/**
 * The arranger: a score as stems (bar-synced loops in the core) and sections (which stems, how loud), changed on
 * the bar, with stingers in key and a riser built from one tension value.
 *
 * A stem is a loop slot in the core, started once its sample is held and phase-locked to the transport there, so
 * a stem that arrives late comes in on the beat. A section change is a `LOOP_SET` per stem stamped with the frame
 * of the next grid line, so it lands on the bar however early the page asked. The riser is three generators (a
 * noise sweep, a rising motor and a noise roll) moved by `tension` and let go over the time left to the next
 * section's line, so it ends as the section lands.
 *
 * A stem may have takes (other samples of the pack that play in its place, one at a time) and a score may have
 * layers (loops no section moves). Each is a loop of its own, and a loop holds a slot only while it sounds: it is
 * started when its level first leaves 0 and given back once it has faded there, so a score may list many more
 * loops than play at once.
 */
import { DESK_SLEW_MS, type DeskLink, NO_LINK } from "../desk";
import type { SoundHost } from "../port";
import { encode, LIMITS } from "../protocol";
import type { Gen, Grid, Music, MusicDef, PackManifest } from "../types";

/**
 * The loop slots each sound's scores hold: a slot is free from the frame it was given back on (a stopped stem keeps
 * its slot until its stamped stop has landed and faded, so no other stem starts there first).
 */
const loopSlots = new WeakMap<SoundHost, Map<number, number>>();

function takeSlot(host: SoundHost): number {
  let slots = loopSlots.get(host);
  if (!slots) {
    slots = new Map();
    loopSlots.set(host, slots);
  }
  const now = host.port.frame();
  for (let slot = 0; slot < LIMITS.LOOPS; slot++) {
    const freeAt = slots.get(slot);
    if (freeAt === undefined || freeAt <= now) {
      slots.set(slot, Number.POSITIVE_INFINITY);
      return slot;
    }
  }
  return -1;
}

const giveSlot = (host: SoundHost, slot: number, at: number) => void loopSlots.get(host)?.set(slot, at);

const unit = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** The grid a section change and a stop wait for when the call names none. */
const SECTION_GRID: Grid = "bar";
/** The grid a stinger waits for when the call names none. */
const STINGER_GRID: Grid = "4";
/** How long a layer's fade lasts by default, in beats (a section's is a bar). */
const LAYER_FADE_BEATS = 1;
/** How long one take crosses to another, in beats. */
const TAKE_FADE_BEATS = 0.25;
/** How long the stems fade when the score stops, in beats. */
const STOP_FADE_BEATS = 1;
/** How quickly the riser follows `tension`, and the shortest it lets go over. */
const RISER_SLEW_MS = 80;
const RISER_RELEASE_MS = 250;
/** The riser's level by default, in dB. */
const RISER_DB = -6;
/** The tension values where the roll's rate doubles. */
export const ROLL_DOUBLINGS = [0.5, 0.75, 0.9] as const;

interface Stem {
  /** The sample it loops. */
  name: string;
  /** The stem whose level it plays at while it is that stem's take (its own name for a stem's first take). */
  of: string;
  /** No section moves it. */
  layer: boolean;
  slot: number;
  /** The frame its fade to silence ends on: past it, a silent loop gives its slot back. */
  quietAt: number;
  started: boolean;
  /** The level it is at (or fading to), 0..1. */
  level: number;
  /** A level stamped for a later frame, not yet reached. */
  later: { at: number; level: number; beats: number } | null;
  /** Its desk strip. */
  link: DeskLink;
  /**
   * The gain over the sample's own that the loop was started at: 1, or `HEADROOM` once a trim has asked for more
   * than a level of 1 gives (the core holds a loop's level to 0..1, so a louder stem is started louder and its
   * levels sent lower).
   */
  head: number;
}

/** The most a desk trim lifts a stem: +24 dB, the top of a trim. */
const HEADROOM = 10 ** (24 / 20);

interface Riser {
  sweep: Gen;
  motor: Gen;
  roll: Gen;
  doublings: number;
}

/** Builds a score over a sound. Throws on a section naming a stem the definition does not list. */
export function createMusic<S extends string>(def: MusicDef<S, string>, host: SoundHost): Music<S> {
  const { port, transport, harmony } = host;
  const listed = new Set(def.stems);
  for (const [name, section] of Object.entries(def.sections) as [string, MusicDef["sections"][string]][]) {
    for (const stem of Object.keys(section.stems)) {
      if (!listed.has(stem))
        throw new Error(
          `watchpot/sound: section "${name}" names "${stem}", which is not one of the score's stems`,
        );
    }
  }
  const missingFrom = (manifest: PackManifest) => def.stems.filter((stem) => !(stem in manifest.samples));
  const known = host.manifest(def.pack);
  if (known) {
    const missing = missingFrom(known);
    if (missing.length)
      throw new Error(`watchpot/sound: pack "${def.pack}" has no stem ${missing.join(", ")}`);
  }

  for (const stem of Object.keys(def.takes ?? {})) {
    if (!listed.has(stem))
      throw new Error(`watchpot/sound: takes are given for "${stem}", which is not one of the score's stems`);
  }
  const loop = (name: string, of: string, layer: boolean): Stem => ({
    name,
    of,
    layer,
    slot: -1,
    quietAt: 0,
    started: false,
    level: 0,
    later: null,
    link: host.channel?.("stem", `${def.pack}/${name}`) ?? NO_LINK,
    head: 1,
  });
  /** Every loop of the score: each stem, then each stem's other takes, then the layers. */
  const stems: Stem[] = [
    ...def.stems.map((name) => loop(name, name, false)),
    ...Object.entries(def.takes ?? {}).flatMap(([stem, takes]) =>
      (takes ?? []).map((name) => loop(name, stem, false)),
    ),
    ...(def.layers ?? []).map((name) => loop(name, name, true)),
  ];
  /** The take each stem plays: its own sample until `take` says another. */
  const taking = new Map<string, string>(def.stems.map((name) => [name, name]));
  /** Whether a loop sounds, now or at a line still to come: what holds a slot. */
  const wanted = (stem: Stem) => stem.level > 0 || (stem.later?.level ?? 0) > 0;
  const bus = def.bus ?? "music";
  /** A stem's level as the core takes it: through its strip's gain, under the gain it was started at. */
  const wire = (stem: Stem, level: number) => Math.min(1, (level * stem.link.gain()) / stem.head);
  let begun = false;
  let riser: Riser | null = null;
  /** The frame a pending section lands on (0: none). */
  let landing = 0;
  const warned = new Set<string>();
  const warn = (reason: string) => {
    if (warned.has(reason)) return;
    warned.add(reason);
    console.warn(`watchpot/sound: ${reason}`);
  };

  const bpm = () => def.tempo ?? host.manifest(def.pack)?.tempo ?? transport.bpm();
  const beatsPerBar = () => def.beatsPerBar ?? transport.beatsPerBar();

  /** A stem's length in bars: the manifest's, else from its seconds at the score's tempo. */
  function barsOf(stem: string): number {
    const sample = host.manifest(def.pack)?.samples[stem];
    if (!sample) return 0;
    if (sample.bars !== undefined && sample.bars > 0) return sample.bars;
    return Math.max(1, Math.round((sample.seconds * bpm()) / 60 / beatsPerBar()));
  }

  const stamp = (stem: Stem, level: number, at: number, beats: number) => {
    if (stem.started)
      port.send(encode("LOOP_SET", { atFrame: at, slot: stem.slot, level: wire(stem, level), beats }));
  };

  /** Starts (or starts again, in place on the transport) a stem's loop over its held sample. */
  function loopStart(stem: Stem, sample: { id: number; scale: number }): void {
    port.send(
      encode("LOOP_START", {
        slot: stem.slot,
        sample: sample.id,
        bus: host.bus(stem.link.route() ?? bus),
        gain: sample.scale * stem.head,
        level: wire(stem, stem.level),
        bars: barsOf(stem.name),
        sendBus1: 0,
        send1: 0,
        sendBus2: 0,
        send2: 0,
      }),
    );
    if (stem.later) stamp(stem, stem.later.level, stem.later.at, stem.later.beats);
  }

  /** A stem's strip moved: what is sounding follows within the desk's slew, and what is stamped for later too. */
  function retrim(stem: Stem): void {
    if (!stem.started || !port.up()) return;
    settle();
    if (!stem.started) return;
    const top = Math.max(stem.level, stem.later?.level ?? 0);
    if (stem.head < HEADROOM && top * stem.link.gain() > stem.head) {
      // Louder than a level of 1 can carry: started again, louder, in place (a loop is phase-locked).
      const sample = host.held(`${def.pack}/${stem.name}`);
      if (!sample) return;
      stem.head = HEADROOM;
      loopStart(stem, sample);
      return;
    }
    const beats = port.frames(DESK_SLEW_MS) / Math.max(1, transport.framesPerBeat());
    stamp(stem, stem.level, 0, beats);
    if (stem.later) stamp(stem, stem.later.level, stem.later.at, stem.later.beats);
  }
  /** A stem's loop started again in place: on another bus (the desk routed it), or over another recording. */
  function restart(stem: Stem): void {
    if (!stem.started || !port.up()) return;
    const sample = host.held(`${def.pack}/${stem.name}`);
    if (!sample) return;
    settle();
    if (!stem.started) return;
    loopStart(stem, sample);
    stem.link.started(stem.link.route() ?? bus);
  }
  for (const stem of stems) {
    stem.link.watch(() => retrim(stem));
    stem.link.rerouted(() => restart(stem));
  }
  host.swapped?.((key) => {
    for (const stem of stems) if (key === `${def.pack}/${stem.name}`) restart(stem);
  });

  /** Moves a stem to `level` at frame `at` (0: now) over `beats`. */
  function move(stem: Stem, level: number, at: number, beats: number): void {
    if (level === 0)
      stem.quietAt = Math.max(at, port.frame()) + Math.ceil(beats * transport.framesPerBeat()) + 1;
    const now = port.frame();
    // A loop raised from nothing is not running yet: it starts silent and takes its fade from the next frame.
    if (at > now || (!stem.started && level > 0)) stem.later = { at: Math.max(at, now + 1), level, beats };
    else {
      stem.level = level;
      stem.later = null;
    }
    stamp(stem, level, at, beats);
  }

  /** Brings what was stamped for a frame now past into the levels the score is at. */
  function settle(): void {
    const now = port.frame();
    for (const stem of stems) {
      if (stem.later && stem.later.at <= now) {
        stem.level = stem.later.level;
        stem.later = null;
      }
      // A loop that has faded to silence and is asked for nothing gives its slot back.
      if (stem.started && !wanted(stem) && now >= stem.quietAt) {
        port.send(encode("LOOP_STOP", { atFrame: 0, slot: stem.slot, beats: STOP_FADE_BEATS }));
        giveSlot(host, stem.slot, now + Math.ceil(STOP_FADE_BEATS * transport.framesPerBeat()));
        stem.link.hold(false);
        stem.slot = -1;
        stem.started = false;
      }
    }
    if (landing <= now) landing = 0;
  }

  /** Starts every stem whose sample the core now holds. Asked when the pack resolves, the core comes up, or a sample is ready. */
  function startReady(): void {
    if (!begun || !port.up()) return;
    const manifest = host.manifest(def.pack);
    if (!manifest) return;
    settle();
    for (const stem of stems) {
      if (stem.started || !wanted(stem) || !(stem.name in manifest.samples)) continue;
      const sample = host.held(`${def.pack}/${stem.name}`);
      if (!sample) continue;
      if (stem.slot < 0) stem.slot = takeSlot(host);
      if (stem.slot < 0) {
        warn(`every one of the core's ${LIMITS.LOOPS} loops is in use`);
        return;
      }
      stem.started = true;
      // A strip already trimmed above unity starts the loop with the headroom it needs.
      stem.head = stem.link.gain() > 1 ? HEADROOM : 1;
      loopStart(stem, sample);
      stem.link.started(stem.link.route() ?? bus);
      stem.link.hold(true);
    }
  }

  port.listen((event) => {
    if (event.op === "SAMPLE_READY") startReady();
  });

  /** The score's first use (and its first after a stop): the pack loads, the tempo and key are set, the clock starts. */
  function begin(): void {
    if (begun) return;
    begun = true;
    let clockSet = false;
    const setClock = () => {
      if (clockSet || !begun) return;
      clockSet = true;
      transport.api.set({ bpm: bpm(), beatsPerBar: beatsPerBar() });
      const key = def.key ?? host.manifest(def.pack)?.key;
      if (key) harmony.api.set({ key, ...(def.scale ? { scale: def.scale } : {}) });
      transport.api.start();
    };
    // The tempo known now (the definition's, or a pack already loaded) sets the clock at once; else the pack's does.
    if (def.tempo !== undefined || host.manifest(def.pack)) setClock();
    host.loadPack(def.pack).then(
      () => {
        setClock();
        const manifest = host.manifest(def.pack);
        if (manifest)
          for (const stem of missingFrom(manifest)) warn(`pack "${def.pack}" has no stem "${stem}"`);
        startReady();
      },
      (error: unknown) => {
        setClock();
        warn(
          `the score's pack "${def.pack}" did not load (${error instanceof Error ? error.message : String(error)})`,
        );
      },
    );
  }

  /** Starts the stems once the core is up, after the call that asked has set their levels. */
  let armed = false;
  function arm(): void {
    if (armed) return;
    armed = true;
    port.whenUp(() => {
      armed = false;
      startReady();
    });
  }

  function letGo(releaseMs: number): void {
    if (!riser) return;
    for (const gen of [riser.sweep, riser.motor, riser.roll]) gen.stop(releaseMs);
    riser = null;
  }

  /** The time from now to a frame (0: now), in milliseconds, at least the riser's shortest release. */
  const msUntil = (at: number) => Math.max(RISER_RELEASE_MS, ((at - port.frame()) / port.rate()) * 1000);

  return {
    section(name, options = {}) {
      const section = def.sections[name];
      if (!section) return;
      begin();
      settle();
      const when = options.when ?? SECTION_GRID;
      const at = transport.next(when);
      const beats = options.fadeBeats ?? beatsPerBar();
      // A section asked again before the last one landed overrules it: the last call wins. Landing later than the
      // overruled line, the old levels are stamped on that line again; landing earlier, the new ones are.
      const overrule = landing > port.frame() && landing !== at ? landing : 0;
      for (const stem of stems) {
        if (stem.layer) continue;
        const level = taking.get(stem.of) === stem.name ? unit(section.stems[stem.of] ?? 0) : 0;
        if (overrule) stamp(stem, at > overrule ? stem.level : level, overrule, beats);
        move(stem, level, at, beats);
      }
      landing = at;
      if (section.harmony) harmony.api.set(section.harmony, when);
      letGo(msUntil(at));
      arm();
    },
    layer(stemName, level, options = {}) {
      const stem = stems.find((s) => s.name === (taking.get(stemName) ?? stemName));
      if (!stem) {
        warn(`the score has no stem "${stemName}"`);
        return;
      }
      begin();
      settle();
      move(stem, unit(level), 0, options.fadeBeats ?? LAYER_FADE_BEATS);
      arm();
    },
    take(stemName, index, options = {}) {
      const name = [stemName, ...(def.takes?.[stemName] ?? [])][index];
      const from = stems.find((s) => !s.layer && s.name === taking.get(stemName));
      const to = stems.find((s) => !s.layer && s.of === stemName && s.name === name);
      if (!from || !to || from === to) return;
      // A take its pack does not hold is left out: the stem stays on the take it has.
      const manifest = host.manifest(def.pack);
      if (manifest && !(to.name in manifest.samples)) return;
      taking.set(stemName, to.name);
      if (!begun) return;
      settle();
      // On the line asked for, or the line the stem's own move is still waiting for, whichever is later.
      const at = Math.max(transport.next(options.when ?? SECTION_GRID), from.later?.at ?? 0);
      const level = from.later?.level ?? from.level;
      const beats = options.fadeBeats ?? TAKE_FADE_BEATS;
      move(from, 0, at, beats);
      move(to, level, at, beats);
      arm();
    },
    stinger(key, options = {}) {
      begin();
      host.play(key, { when: options.when ?? STINGER_GRID });
    },
    tension(value) {
      const t = unit(value);
      if (t === 0) {
        letGo(RISER_RELEASE_MS);
        return;
      }
      begin();
      const db = def.riser?.level ?? RISER_DB;
      const riserBus = def.riser?.bus ?? bus;
      // Named for the score, so each tension does not make the desk new strips.
      const named = (part: string) => `${def.pack}.riser.${part}`;
      const doublings = ROLL_DOUBLINGS.filter((line) => t >= line).length;
      // A band of pink noise climbing five octaves, a motor climbing two, and a roll of bursts: eighths of the
      // score's tempo, doubling at each line.
      const sweep = { centre: 300 * 2 ** (t * 5), width: 400 + 2000 * t, level: t * t };
      const motor = { rate: 40 * 2 ** (t * 2), level: 0.6 * t * t };
      const roll = { grid: (bpm() / 60) * 2 * 2 ** doublings, level: 0.5 * t };
      if (!riser) {
        riser = {
          sweep: host.gen("noise", {
            name: named("sweep"),
            bus: riserBus,
            level: db,
            params: { color: 1, ...sweep },
          }),
          motor: host.gen("motor", {
            name: named("motor"),
            bus: riserBus,
            level: db,
            params: { duty: 0.3, load: 0.2, ...motor },
          }),
          roll: host.gen("noise", {
            name: named("roll"),
            bus: riserBus,
            level: db,
            params: { color: 0, centre: 3000, width: 3000, duty: 0.25, ...roll },
          }),
          doublings,
        };
        return;
      }
      riser.sweep.set(sweep, RISER_SLEW_MS);
      riser.motor.set(motor, RISER_SLEW_MS);
      riser.roll.set({ level: roll.level }, RISER_SLEW_MS);
      // The roll's rate jumps when a line is crossed, either way.
      if (doublings !== riser.doublings) {
        riser.doublings = doublings;
        riser.roll.set({ grid: roll.grid });
      }
    },
    stop(options = {}) {
      letGo(RISER_RELEASE_MS);
      if (!begun) return;
      const at = transport.next(options.when ?? SECTION_GRID);
      const freeAt = Math.max(at, port.frame()) + Math.ceil(STOP_FADE_BEATS * transport.framesPerBeat());
      for (const stem of stems) {
        if (stem.started) {
          port.send(encode("LOOP_STOP", { atFrame: at, slot: stem.slot, beats: STOP_FADE_BEATS }));
          stem.link.hold(false);
        }
        if (stem.slot >= 0) giveSlot(host, stem.slot, freeAt);
        stem.slot = -1;
        stem.started = false;
        stem.level = 0;
        stem.later = null;
      }
      landing = 0;
      begun = false;
    },
  };
}
