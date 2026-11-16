/**
 * The instruments a game plays with numbers: grain clouds over a sample and modelled sources (a motor, shaped
 * noise, a struck bank). Each is a slot in the core, started once the core is up (and, for a cloud, once its sample
 * is held), then moved by `set`. What is set before then is remembered and sent with the start.
 */
import { DESK_SLEW_MS, NO_LINK } from "./desk";
import type { SoundHost } from "./port";
import { concat, encode, GEN_KIND, GEN_PARAMS, GRAIN_PARAM, LIMITS } from "./protocol";
import type { Gen, GenDef, GenKind, Grain, GrainDef, GrainSettings } from "./types";

const dbGain = (db: number | undefined): number =>
  db !== undefined && Number.isFinite(db) ? 10 ** (db / 20) : 1;

/** The first two sends of a definition, by bus index. */
function sendsOf(host: SoundHost, sends: Readonly<Partial<Record<string, number>>> | undefined) {
  const list = Object.entries(sends ?? {})
    .slice(0, 2)
    .map(([name, level]) => ({
      bus: host.bus(name),
      level: Math.max(0, Number.isFinite(level) ? (level ?? 0) : 0),
    }));
  return {
    sendBus1: list[0]?.bus ?? 0,
    send1: list[0]?.level ?? 0,
    sendBus2: list[1]?.bus ?? 0,
    send2: list[1]?.level ?? 0,
  };
}

/** Each generator's `level` before any `GEN_SET` (the defaults in `dsp/src/gens/*.rs`): what a desk trim scales. */
const GEN_LEVEL: Readonly<Record<GenKind, number>> = { motor: 0.5, noise: 0.3, modal: 0.5 };

/** A pool of slot numbers: the lowest free one, or -1 when all are taken. */
function slots(count: number) {
  const taken = new Set<number>();
  return {
    take(): number {
      for (let i = 0; i < count; i++) {
        if (!taken.has(i)) {
          taken.add(i);
          return i;
        }
      }
      return -1;
    },
    give: (slot: number) => void taken.delete(slot),
  };
}

/** The instruments as `engine.ts` holds them. */
export interface Instruments {
  grain(sample: string, def?: GrainDef<string>): Grain;
  gen(kind: GenKind, def?: GenDef<string>): Gen;
  /** A sample became ready or was freed: a cloud waiting for its sample can start. */
  samples(): void;
}

export function createInstruments(host: SoundHost, seed: () => number): Instruments {
  const { port } = host;
  const clouds = slots(LIMITS.GRAIN_CLOUDS);
  const gens = slots(LIMITS.GENS);
  /** Clouds whose sample the core does not hold yet. */
  const waiting = new Set<() => boolean>();
  const warned = new Set<string>();
  const warn = (reason: string) => {
    if (warned.has(reason)) return;
    warned.add(reason);
    console.warn(`watchpot/sound: ${reason}`);
  };
  const draw = () => Math.floor(seed() * 0xffffffff) >>> 0;
  /** Generators made so far by kind: what names one the game did not name (`noise#2`). */
  const made: Record<GenKind, number> = { motor: 0, noise: 0, modal: 0 };

  function grain(sample: string, def: GrainDef<string> = {}): Grain {
    const cloud = clouds.take();
    if (cloud < 0) {
      warn(`every one of the core's ${LIMITS.GRAIN_CLOUDS} grain clouds is in use`);
      return { set() {}, stop() {} };
    }
    const settings = new Map<keyof typeof GRAIN_PARAM, number>();
    let started = false;
    let stopped = false;
    // Its desk strip: the trim rides on the cloud's level.
    const link = host.channel?.("grain", def.name ?? sample) ?? NO_LINK;
    /** A held sample is normalised to full scale: this restores the recording's level, through the cloud's level. */
    let scale = 1;

    const remember = (o: GrainSettings) => {
      for (const [name, value] of Object.entries(o)) {
        if (name in GRAIN_PARAM && typeof value === "number" && Number.isFinite(value))
          settings.set(name as keyof typeof GRAIN_PARAM, value);
      }
    };
    const sets = (names: Iterable<keyof typeof GRAIN_PARAM>, slew: number) =>
      [...names].map((name) =>
        encode("GRAIN_SET", {
          cloud,
          param: GRAIN_PARAM[name],
          value:
            name === "level" ? (settings.get("level") ?? 1) * scale * link.gain() : (settings.get(name) ?? 0),
          slew,
        }),
      );

    /** Starts the cloud when the core is up and holds the sample. True once it has (or never will). */
    const start = (): boolean => {
      if (started || stopped) return true;
      const id = port.up() ? port.sample(sample) : 0;
      if (id === 0) return false;
      started = true;
      scale = host.held(sample)?.scale ?? 1;
      port.send(
        concat([
          encode("GRAIN_START", {
            cloud,
            sample: id,
            bus: host.bus(link.route() ?? def.bus),
            pan: def.pan ?? 0,
            ...sendsOf(host, def.sends),
            seed: draw(),
          }),
          // A parameter's first set lands at once: the cloud opens where the game left it, at its sample's level.
          ...sets(new Set([...settings.keys(), "level" as const]), 0),
        ]),
      );
      link.started(link.route() ?? def.bus, Object.keys(def.sends ?? {}).slice(0, 2));
      link.hold(true);
      return true;
    };

    const unwatch = link.watch(() => {
      if (started && !stopped && port.up()) port.send(concat(sets(["level"], port.frames(DESK_SLEW_MS))));
    });
    remember(def);
    if (!start()) waiting.add(start);
    return {
      set(o, slewMs) {
        if (stopped) return;
        remember(o);
        const names = Object.keys(o).filter((name) => settings.has(name as keyof typeof GRAIN_PARAM));
        if (started && names.length)
          port.send(concat(sets(names as (keyof typeof GRAIN_PARAM)[], port.frames(slewMs))));
      },
      stop(releaseMs) {
        if (stopped) return;
        stopped = true;
        unwatch();
        waiting.delete(start);
        if (started) {
          port.send(encode("GRAIN_STOP", { cloud, release: port.frames(releaseMs ?? 50) }));
          link.hold(false);
        }
        clouds.give(cloud);
      },
    };
  }

  function gen(kind: GenKind, def: GenDef<string> = {}): Gen {
    const slot = gens.take();
    if (slot < 0) {
      warn(`every one of the core's ${LIMITS.GENS} generators is in use`);
      return { set() {}, stop() {} };
    }
    const ids: Readonly<Record<string, number>> = GEN_PARAMS[kind];
    const settings = new Map<number, number>();
    let started = false;
    let stopped = false;
    made[kind]++;
    // Its desk strip: the trim rides on the generator's `level`, from its kind's default when the game sets none.
    const link = host.channel?.("gen", def.name ?? `${kind}#${made[kind]}`) ?? NO_LINK;
    const LEVEL = GEN_PARAMS[kind].level;
    const levelOf = () => (settings.get(LEVEL) ?? GEN_LEVEL[kind]) * link.gain();

    /** The parameter ids and values a settings object names; a modal bank's modes are set by `modes`. */
    const remember = (o: Readonly<Record<string, number>>): number[] => {
      const touched: number[] = [];
      for (const [name, value] of Object.entries(o)) {
        const id = name === "mode" ? undefined : ids[name];
        if (id === undefined || typeof value !== "number" || !Number.isFinite(value)) continue;
        settings.set(id, value);
        touched.push(id);
      }
      return touched;
    };
    const sets = (params: Iterable<number>, slew: number) =>
      [...params].map((param) =>
        encode("GEN_SET", {
          slot,
          param,
          value: param === LEVEL ? levelOf() : (settings.get(param) ?? 0),
          slew,
        }),
      );

    if (kind === "modal") {
      (def.modes ?? []).slice(0, 12).forEach((mode, i) => {
        const at = GEN_PARAMS.modal.mode + 3 * i;
        settings.set(at, mode.freq);
        settings.set(at + 1, mode.decay);
        settings.set(at + 2, mode.gain);
      });
    }
    remember(def.params ?? {});

    port.whenUp(() => {
      if (stopped) return;
      started = true;
      // A strike set before the start would fire as the bank appears: it is a moment, not a setting.
      const strike = kind === "modal" ? GEN_PARAMS.modal.strike : -1;
      // A trimmed strip sets the level even where the game left it at the kind's default.
      const params = [...settings.keys()].filter((param) => param !== strike);
      if (link.gain() !== 1 && !settings.has(LEVEL)) params.push(LEVEL);
      port.send(
        concat([
          encode("GEN_START", {
            slot,
            kind: GEN_KIND[kind],
            bus: host.bus(link.route() ?? def.bus),
            gain: dbGain(def.level),
            pan: def.pan ?? 0,
            ...sendsOf(host, def.sends),
            seed: draw(),
          }),
          ...sets(params, 0),
        ]),
      );
      link.started(link.route() ?? def.bus, Object.keys(def.sends ?? {}).slice(0, 2));
      link.hold(true);
    });

    const unwatch = link.watch(() => {
      if (started && !stopped && port.up()) port.send(concat(sets([LEVEL], port.frames(DESK_SLEW_MS))));
    });
    return {
      set(o, slewMs) {
        if (stopped) return;
        const touched = remember(o);
        if (started && touched.length) port.send(concat(sets(touched, port.frames(slewMs))));
      },
      stop(releaseMs) {
        if (stopped) return;
        stopped = true;
        unwatch();
        if (started) {
          port.send(encode("GEN_STOP", { slot, release: port.frames(releaseMs ?? 50) }));
          link.hold(false);
        }
        gens.give(slot);
      },
    };
  }

  return {
    grain,
    gen,
    samples() {
      for (const start of [...waiting]) if (start()) waiting.delete(start);
    },
  };
}
