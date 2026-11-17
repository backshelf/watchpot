/**
 * `createSound`: a game's cue table played by key through the DSP core. `unlock()` loads zzfx (whose AudioContext
 * everything plays through), resumes the context and boots the core in its worklet. The core then holds every
 * sound as a sample: a cue's zzfx voices rendered to one buffer, its 0.6 clips once decoded, a pack's recordings
 * once loaded. `play` asks the governor whether the play sounds, picks its take and its variation, and turns into
 * `VOICE_START` records on the cue's bus, with its sends and, for a placed cue, its place.
 *
 * Where the core cannot start (no AudioWorklet, no WebAssembly, or a boot that failed) and while it boots, cues play
 * the 0.6 way (`fallback.ts`). The gate is the same on every path: nothing plays or queues while muted, before
 * `unlock()`, or while the context is not running.
 */

import { createBabble } from "./babble";
import { bootCore, type CoreLink, coreSupported } from "./boot";
import { type CueState, createCueState, createRng, type Picked, pickTake } from "./cues";
import {
  createDesk,
  DESK_SLEW_MS,
  type DeskLink,
  type DeskSource,
  inertDesk,
  type SampleEntry,
} from "./desk";
import { clipSeconds, playFallback, type ReadyClips } from "./fallback";
import { armGestures, loadZzfx, resume, type Zzfx } from "./gate";
import { createGovernor, type Governor } from "./governor";
import { createInstruments } from "./instruments";
import { createMixer } from "./mixer";
import { createMod } from "./mod";
import { createMusic } from "./music/arranger";
import { createHarmony } from "./music/harmony";
import { createSequence } from "./music/sequence";
import { createTransport } from "./music/transport";
import type { CorePort, CueVoice, SoundHost } from "./port";
import { resolveCue } from "./presets";
import { concat, encode, gridId, LIMITS, MASTER_PARAM, type SoundEvent, VOICE_PARAM } from "./protocol";
import {
  channelsOf,
  createClipCache,
  createSampleIds,
  type Decoded,
  fetchDecoded,
  gainOf,
  rateOf,
  renderVoices,
  toPcm16,
} from "./samples";
import { createSpace } from "./space";
import { createTap } from "./tap";
import type {
  Cue,
  CueShorthand,
  DefaultBus,
  PackManifest,
  PlayOptions,
  Sound,
  SoundOptions,
  Take,
  VoiceHandle,
} from "./types";
import { soundSeconds } from "./voice";

/** zzfx's own master volume, the default. */
const DEFAULT_VOLUME = 0.3;

/** How far ahead a play with offsets is stamped, so its first layer is not already past when the core reads it. */
const LEAD_SECONDS = 0.01;

/** How often a roll's voice is retuned to its cue's rate, in milliseconds, and how long it takes to follow. */
const ROLL_TICK_MS = 50;
/** How long a roll's voice takes to go when its cue's rate falls. */
const ROLL_RELEASE_MS = 150;
/** The crossfade at the seam of a looped roll, in seconds. */
const ROLL_SEAM_SECONDS = 0.005;

/** What `createSound` needs from outside: where the core can run and how it boots. Swapped in tests. */
export interface CoreBoot {
  supported(context: AudioContext): boolean;
  boot(context: AudioContext, options: { voices: number }): Promise<CoreLink>;
}

const WORKLET: CoreBoot = { supported: coreSupported, boot: bootCore };

/** A sample the shell has posted to the core. */
interface Held {
  id: number;
  /** The gain that restores the source's level from the normalised PCM. */
  scale: number;
  /** Source frames a second. */
  rate: number;
  frames: number;
  /** The core answered `SAMPLE_READY`. */
  ready: boolean;
  /** Hears the answer. */
  waiters: (() => void)[];
}

/** A cue's rendered voices on the core, or null for a cue with nothing to render. */
interface RenderedVoices {
  held: Held | null;
  randomness: number;
}

/** The voices one play started: their handles on the core and what each was started at, so a roll can retune them. */
interface Started {
  handle: VoiceHandle;
  /** Each voice's gain before its desk strip's. */
  voices: readonly { id: number; gain: number; rate: number }[];
  /** The desk strip it sounds through. */
  link: DeskLink;
}

/** A voice the core has not said ended: its strip and its gain before the strip's, so a trim can move it. */
interface Sounding {
  link: DeskLink;
  base: number;
  /** A roll's voice: its gain follows the roll's tick, which reads the strip itself. */
  roll: boolean;
}

/** One voice a play starts. */
/**
 * A sample the mix desk put a recording beside: the pack's own (none for a sample the pack does not have yet), the
 * staged one with its manifest entry, and which of them plays under the sample's key.
 */
interface Swap {
  a: Held | undefined;
  b: Held;
  entry: SampleEntry;
  side: "a" | "b";
}

interface Start {
  held: Held;
  gain: number;
  rate: number;
  /** Seconds after the play. */
  at: number;
  /** Source frames into the sample. */
  offset: number;
}

const dbGain = (db: number): number => (Number.isFinite(db) ? 10 ** (db / 20) : 1);
const positive = (n: number | undefined, otherwise: number): number =>
  n !== undefined && Number.isFinite(n) && n > 0 ? n : otherwise;

/** A game's sound over its cue table, its 0.6 clips and its packs. Nothing loads or plays until `unlock()`. */
export function createSound<K extends string, F extends string = string, B extends string = never>(
  options: SoundOptions<K, F, B>,
): Sound<K, B> {
  return createSoundWith(options, WORKLET);
}

/** `createSound` with its core boot (and, for a test of the wiring, its governor) swapped: what the tests drive. */
export function createSoundWith<K extends string, F extends string = string, B extends string = never>(
  {
    cues: given,
    samples: urls = {} as Readonly<Record<F, string>>,
    packs = {},
    volume,
    voices = 64,
    buses,
    scenes,
    routes,
    presence,
    seed = 1,
    mix,
  }: SoundOptions<K, F, B>,
  core: CoreBoot,
  parts: { governor?: Governor } = {},
): Sound<K, B> {
  // Shorthand cues resolved up front, so everything below sees full cues.
  const cues = Object.fromEntries(
    Object.entries(given as Readonly<Record<string, Cue<DefaultBus | B, F> | CueShorthand>>).map(
      ([key, cue]) => [key, resolveCue(cue, key)],
    ),
  ) as Readonly<Record<K, Cue<DefaultBus | B, F>>>;
  const clips = createClipCache<F>(urls);
  let engine: Zzfx | null = null;
  let state: "locked" | "booting" | "core" | "fallback" = "locked";
  let booting: Promise<void> | null = null;
  let link: CoreLink | null = null;
  let muted = false;
  let level = volume;
  const warned = new Set<string>();

  /** Every sample on the core by key: `clip:<file>`, `cue:<key>`, `<pack>/<sample>`. */
  const held = new Map<string, Held>();
  const byId = new Map<number, Held>();
  let ids = createSampleIds(LIMITS.MAX_SAMPLES);
  const rendered = new Map<K, RenderedVoices>();
  /** Voice handles the core has not said ended. */
  const live = new Set<number>();
  /** Those of them a play started, with their strips. */
  const voiceStrips = new Map<number, Sounding>();
  let lastVoice = 0;
  /** Packs asked for, by name: the manifest once resolved. */
  const loaded = new Map<string, PackManifest | null>();

  /** The line the mixer, the mod matrix and the space speak to the core through. */
  /** Who hears the core's events, and what waits for the core to come up. */
  const listeners = new Set<(event: SoundEvent) => void>();
  const waitingForCore: (() => void)[] = [];
  const context = () => engine?.ZZFX.audioContext ?? null;
  const port: CorePort = {
    send: (records) => link?.send(records),
    up: () => state === "core" && link !== null,
    whenUp(fn) {
      if (port.up()) fn();
      else waitingForCore.push(fn);
    },
    listen(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    frames: (ms) => Math.max(0, Math.round(((ms ?? 0) / 1000) * port.rate())) || 0,
    rate: () => context()?.sampleRate ?? 48000,
    time: () => context()?.currentTime ?? 0,
    frame: () => Math.round(port.time() * port.rate()),
    sample: (key) => {
      const entry = held.get(key);
      return entry?.ready ? entry.id : 0;
    },
  };
  const mixer = createMixer<DefaultBus | B>({ buses, scenes, presence }, port);
  const mod = createMod<DefaultBus | B>({ routes }, mixer, port);
  const space = createSpace(port);
  const transport = createTransport(port);
  const harmony = createHarmony(transport, port);
  const tap = createTap(port);
  /** Samples the mix desk has put a recording beside, by key. */
  const swaps = new Map<string, Swap>();
  const swapFns = new Set<(key: string) => void>();
  /** A sample's recording changed under its key: whoever holds its id asks again. */
  function swapped(key: string): void {
    mixer.samples();
    instruments.samples();
    for (const fn of [...swapFns]) fn(key);
  }
  /** Gives a sample's id back to the core. */
  function release(entry: Held): void {
    byId.delete(entry.id);
    link?.send(encode("SAMPLE_FREE", { sample: entry.id }));
    ids.give(entry.id);
    for (const wake of entry.waiters) wake();
  }
  /** What the mix desk reads of the sound and stages in it. */
  const source: DeskSource = {
    cues: () => Object.keys(cues),
    takes: (key) => (key in cues ? (cues[key as K].takes ?? []) : null),
    retake: (key) => void cueStates.delete(key as K),
    packs: () =>
      [...loaded].flatMap(([name, manifest]) =>
        manifest
          ? [
              {
                name,
                ...(manifest.tempo !== undefined ? { tempo: manifest.tempo } : {}),
                ...(manifest.key !== undefined ? { key: manifest.key } : {}),
              },
            ]
          : [],
      ),
    samples() {
      const out: { key: string; entry: SampleEntry; url?: string }[] = [];
      for (const [name, manifest] of loaded)
        for (const [sample, { url, ...entry }] of Object.entries(manifest?.samples ?? {}))
          out.push({ key: `${name}/${sample}`, entry, ...(url ? { url } : {}) });
      return out;
    },
    async stage(key, audio, entry) {
      const audioContext = context();
      if (!audioContext || state !== "core") return false;
      let buffer: AudioBuffer;
      try {
        buffer = await audioContext.decodeAudioData(audio.slice(0));
      } catch {
        return false;
      }
      if (state !== "core") return false;
      const was = swaps.get(key);
      const a = was ? was.a : held.get(key);
      // The new one first, the old staged one freed after: a loop over it starts again on the new before it goes.
      const b = upload(key, channelsOf(buffer), buffer.sampleRate);
      if (!b) {
        if (was) held.set(key, was.side === "b" ? was.b : (was.a ?? was.b));
        else if (a) held.set(key, a);
        return false;
      }
      swaps.set(key, { a, b, entry, side: "b" });
      await whenReady(b);
      if (swaps.get(key)?.b !== b) return false;
      swapped(key);
      if (was) release(was.b);
      return true;
    },
    side(key, side) {
      const swap = swaps.get(key);
      const next = side === "a" ? swap?.a : swap?.b;
      if (!swap || !next || swap.side === side) return;
      swap.side = side;
      held.set(key, next);
      swapped(key);
    },
    unstage(key) {
      const swap = swaps.get(key);
      if (!swap) return;
      swaps.delete(key);
      if (swap.a) held.set(key, swap.a);
      else held.delete(key);
      swapped(key);
      release(swap.b);
    },
    keep(key) {
      const swap = swaps.get(key);
      if (!swap) return;
      swaps.delete(key);
      held.set(key, swap.b);
      // The manifest in memory says what the pack's file will once the page loads it again.
      const cut = key.indexOf("/");
      const pack = key.slice(0, cut);
      const name = key.slice(cut + 1);
      const manifest = loaded.get(pack);
      if (manifest)
        loaded.set(pack, {
          ...manifest,
          samples: {
            ...manifest.samples,
            [name]: { ...swap.entry, url: manifest.samples[name]?.url ?? "" },
          },
        });
      if (swap.side === "a") swapped(key);
      if (swap.a) release(swap.a);
    },
  };
  /** A pack's manifest as it plays: a staged recording's entry over the file's while it is the one that sounds. */
  function manifestOfPack(pack: string): PackManifest | null {
    const manifest = loaded.get(pack) ?? null;
    if (!manifest || swaps.size === 0) return manifest;
    let over: Record<string, PackManifest["samples"][string]> | null = null;
    for (const [key, swap] of swaps) {
      if (swap.side !== "b" || !key.startsWith(`${pack}/`)) continue;
      const name = key.slice(pack.length + 1);
      over ??= {};
      over[name] = { ...swap.entry, url: manifest.samples[name]?.url ?? "" };
    }
    return over ? { ...manifest, samples: { ...manifest.samples, ...over } } : manifest;
  }
  const desk = createDesk({
    mixer: mixer.desk,
    port,
    audition: (key, bus) => {
      if (key in cues) play(key as K, bus === undefined ? {} : { bus: bus as DefaultBus | B });
    },
    source,
  });
  /** A cue as it plays: with the takes the desk gave it, when it gave any. */
  const retaken = new Map<string, { takes: readonly Take[]; cue: Cue<DefaultBus | B, F> }>();
  function cueOf(key: K): Cue<DefaultBus | B, F> {
    const takes = desk.takes(key);
    if (!takes) return cues[key];
    let entry = retaken.get(key);
    if (entry?.takes !== takes) {
      entry = { takes, cue: { ...cues[key], takes } };
      retaken.set(key, entry);
    }
    return entry.cue;
  }
  /** The strips a play has watched: a trim moves their voices already sounding. */
  const watched = new Set<string>();
  /** A cue's strip for the bus a play asks for: its role (`cue:<key>@<bus>`). */
  function roleLink(key: string, asked: string | undefined): DeskLink {
    const link = desk.role(key, mixer.desk.resolve(asked));
    if (!watched.has(link.id)) {
      watched.add(link.id);
      link.watch(() => retrim(link));
    }
    return link;
  }
  /** A cue's strip on its own bus: what a sequence of it and a stinger sound through. */
  const cueLink = (key: string): DeskLink => roleLink(key, key in cues ? cues[key as K].bus : undefined);
  /** Moves the voices of a strip already sounding to its gain (a roll's follow on its own tick). */
  function retrim(link: DeskLink): void {
    if (!port.up()) return;
    const slew = port.frames(DESK_SLEW_MS);
    const records: Uint8Array[] = [];
    for (const [voice, sounding] of voiceStrips)
      if (sounding.link === link && !sounding.roll && live.has(voice))
        records.push(
          encode("VOICE_SET", { voice, param: VOICE_PARAM.gain, value: sounding.base * link.gain(), slew }),
        );
    if (records.length) port.send(concat(records));
  }
  const inert = inertDesk();
  const governor = parts.governor ?? createGovernor({ voices });
  /** The sound's one source of chance: every pick and every variation draws from it. */
  const rng = createRng(seed);
  /** What the score, the sequences, the babble and the instruments reach the sound through. */
  const host: SoundHost = {
    port,
    bus: (name) => mixer.index(name),
    held(key) {
      const entry = held.get(key);
      return entry?.ready
        ? { id: entry.id, frames: entry.frames, rate: entry.rate, scale: entry.scale }
        : null;
    },
    manifest: manifestOfPack,
    swapped(fn) {
      swapFns.add(fn);
      return () => void swapFns.delete(fn);
    },
    loadPack: (name) => loadPack(name),
    play: (key, options) => (key in cues ? play(key as K, options) : null),
    voice: (key) => (key in cues ? voiceOf(key as K) : null),
    place: (at) => space.api.resolve(at),
    gen: (kind, def) => instruments.gen(kind, def),
    transport,
    harmony,
    channel: (kind, name) => (kind === "cue" ? cueLink(name) : desk.channel(kind, name)),
  };
  const instruments = createInstruments(host, rng);
  const cueStates = new Map<K, CueState>();
  /** Cues that are rolling, each with the one sustained voice that stands for its plays. */
  const rolling = new Map<K, Started>();
  let rollTimer: ReturnType<typeof setInterval> | null = null;
  // The saved mix lies over the declared one before anything sounds; the mixer sends it from every boot.
  if (mix) desk.desk.load(mix);

  const running = () => engine?.ZZFX.audioContext.state === "running";
  const masterGain = () => level ?? engine?.ZZFX.volume ?? DEFAULT_VOLUME;

  function warn(reason: string): void {
    if (warned.has(reason)) return;
    warned.add(reason);
    console.warn(`watchpot/sound: ${reason}`);
  }

  // The core's samples.

  function upload(key: string, channels: readonly Float32Array[], rate: number): Held | null {
    if (!link) return null;
    const { pcm, channels: count, frames, scale } = toPcm16(channels);
    if (frames === 0) return null;
    const id = ids.take();
    if (id === 0) {
      warn(`every one of the core's ${LIMITS.MAX_SAMPLES - 1} sample ids is taken`);
      return null;
    }
    const entry: Held = { id, scale, rate, frames, ready: false, waiters: [] };
    held.set(key, entry);
    byId.set(id, entry);
    link.upload(pcm, encode("SAMPLE_LOAD", { sample: id, ptr: 0, frames, channels: count, rate }));
    return entry;
  }

  function free(key: string): void {
    const entry = held.get(key);
    if (!entry) return;
    held.delete(key);
    release(entry);
    mixer.samples();
    instruments.samples();
  }

  const whenReady = (entry: Held): Promise<void> =>
    entry.ready ? Promise.resolve() : new Promise((wake) => entry.waiters.push(wake));

  function uploadClip(file: F, clip: Decoded): void {
    if (!held.has(`clip:${file}`)) upload(`clip:${file}`, channelsOf(clip.buffer), clip.buffer.sampleRate);
  }

  /** A cue's voices on the core, rendered and posted now if they are not yet. */
  function voicesOf(key: K): RenderedVoices {
    let entry = rendered.get(key);
    if (!entry && engine) {
      const layers = cues[key].voices ?? [];
      const out = renderVoices(layers, engine);
      entry = {
        held: layers.length ? upload(`cue:${key}`, [out.samples], out.sampleRate) : null,
        randomness: out.randomness,
      };
      rendered.set(key, entry);
    }
    return entry ?? { held: null, randomness: 0 };
  }

  /** Renders every cue's voices ahead of its first play, one cue a task so the page keeps its frames. */
  function prerender(keys: K[]): void {
    const key = keys.shift();
    if (key === undefined || state !== "core") return;
    voicesOf(key);
    if (keys.length) setTimeout(() => prerender(keys), 0);
  }

  function hear(events: SoundEvent[]): void {
    let readied = false;
    for (const event of events) {
      for (const listener of listeners) listener(event);
      if (event.op === "SAMPLE_READY") {
        const entry = byId.get(event.sample);
        if (!entry || entry.ready) continue;
        entry.ready = true;
        readied = true;
        for (const wake of entry.waiters.splice(0)) wake();
      } else if (event.op === "VOICE_ENDED") {
        live.delete(event.voice);
        voiceStrips.delete(event.voice);
      }
    }
    if (readied) {
      mixer.samples();
      instruments.samples();
    }
  }

  function toFallback(reason: string): void {
    link?.dispose();
    link = null;
    for (const entry of held.values()) for (const wake of entry.waiters) wake();
    held.clear();
    byId.clear();
    swaps.clear();
    rendered.clear();
    live.clear();
    voiceStrips.clear();
    endRolls();
    ids = createSampleIds(LIMITS.MAX_SAMPLES);
    state = "fallback";
    warn(`${reason}; playing through plain Web Audio instead`);
  }

  async function boot(context: AudioContext): Promise<void> {
    if (!core.supported(context)) {
      state = "fallback";
      return;
    }
    state = "booting";
    try {
      link = await core.boot(context, { voices });
    } catch (error) {
      toFallback(`the core did not boot (${error instanceof Error ? error.message : String(error)})`);
      return;
    }
    link.onEvent(hear);
    link.onError((fatal, reason) => (fatal ? toFallback(reason) : warn(reason)));
    if (muted) link.send(encode("MASTER_SET", { param: MASTER_PARAM.mute, value: 1, slew: 0 }));
    // Held, not sent, while the core is not yet up: `mixer.boot()` sends it with the rest of the mix.
    mixer.volume(masterGain());
    state = "core";
    mixer.boot();
    mod.boot();
    space.boot();
    transport.boot();
    for (const fn of waitingForCore.splice(0)) fn();
    for (const file of Object.keys(urls) as F[]) {
      const clip = clips.get(file);
      if (clip) uploadClip(file, clip);
    }
    for (const name of loaded.keys()) void fillPack(name);
    prerender(Object.keys(cues) as K[]);
  }

  // Picking what a play starts.

  /** The cue's clip layers when every clip is decoded (and, on the core, held and ready), else null. */
  function readyClips(key: K): ReadyClips | null {
    const layers = cues[key].clips;
    if (!layers?.length) return null;
    const ready: { layer: (typeof layers)[number]; clip: Decoded }[] = [];
    for (const layer of layers) {
      const clip = clips.get(layer.file);
      if (!clip) return null;
      if (state === "core" && !held.get(`clip:${layer.file}`)?.ready) return null;
      ready.push({ layer, clip });
    }
    return ready;
  }

  /** The takes whose samples the core holds and has answered for. */
  const readyTakes = (cue: Cue<DefaultBus | B, F>): { take: Take; entry: Held }[] =>
    state !== "core"
      ? []
      : (cue.takes ?? []).flatMap((take) => {
          const entry = held.get(take.sample);
          return entry?.ready ? [{ take, entry }] : [];
        });

  const takeReady = (take: Take): boolean => state === "core" && held.get(take.sample)?.ready === true;

  function cueState(key: K): CueState {
    let entry = cueStates.get(key);
    if (!entry) {
      entry = createCueState();
      cueStates.set(key, entry);
    }
    return entry;
  }

  /** A take's root, from its pack's manifest: what the harmony clock transposes from. */
  function rootOf(take: Take | null): number | undefined {
    if (!take) return undefined;
    const cut = take.sample.indexOf("/");
    if (cut < 0) return undefined;
    return manifestOfPack(take.sample.slice(0, cut))?.samples[take.sample.slice(cut + 1)]?.rootHz;
  }

  /** What one play of a cue would start now, for a sequencer track: its first voice, with the cue's level and sends. */
  function voiceOf(key: K): CueVoice | null {
    if (state !== "core") return null;
    const cue = cueOf(key);
    const picked = pickTake(cue, cueState(key), {}, rng, takeReady);
    const start = startsOf(key, picked)[0];
    if (!start) return null;
    const strip = cueLink(key);
    const busName = strip.route() ?? mixer.desk.resolve(cue.bus);
    return {
      sample: start.held.id,
      gain: start.gain * dbGain((cue.level ?? 0) + picked.db) * strip.gain(),
      rate: start.rate * positive(picked.rate, 1),
      bus: mixer.index(busName),
      busName,
      sends: strip.sends(cue.sends).map(({ to, level }) => ({ bus: mixer.index(to), level })),
    };
  }

  /** What a play starts: its picked take, else its clips when all are ready, else its rendered zzfx voices. */
  function startsOf(key: K, picked: Picked): Start[] {
    const offsetOf = (entry: Held) => Math.max(0, Math.round((picked.startMs / 1000) * entry.rate));
    const entry = picked.take ? held.get(picked.take.sample) : undefined;
    if (entry?.ready) return [{ held: entry, gain: entry.scale, rate: 1, at: 0, offset: offsetOf(entry) }];
    const ready = readyClips(key);
    if (ready) {
      const starts: Start[] = [];
      for (const { layer, clip } of ready) {
        const clipEntry = held.get(`clip:${layer.file}`);
        if (clipEntry) {
          const gain = gainOf(layer, clip) * clipEntry.scale;
          starts.push({
            held: clipEntry,
            gain,
            rate: rateOf(layer),
            at: layer.at ?? 0,
            offset: offsetOf(clipEntry),
          });
        }
      }
      return starts;
    }
    // Sent even before the core answers for the upload: the port keeps order, so the load lands first.
    const { held: voices, randomness } = voicesOf(key);
    if (!voices) return [];
    return [
      {
        held: voices,
        gain: voices.scale,
        rate: 1 + (2 * rng() - 1) * Math.min(0.5, randomness),
        at: 0,
        offset: offsetOf(voices),
      },
    ];
  }

  function nextVoice(): number {
    lastVoice = (lastVoice + 1) >>> 0 || 1;
    return lastVoice;
  }

  /** One handle over the voices `ids`: calls reach those the core has not said ended. */
  function handleOf(ids: readonly number[], sampleRate: number): VoiceHandle {
    const frames = (ms: number | undefined) => Math.max(0, Math.round(((ms ?? 0) / 1000) * sampleRate)) || 0;
    return {
      stop(releaseMs) {
        const playing = ids.filter((id) => live.has(id));
        if (!playing.length || !link) return;
        link.send(
          concat(
            playing.map((voice) =>
              encode("VOICE_STOP", {
                voice,
                release: releaseMs === undefined ? 0 : Math.max(1, frames(releaseMs)),
              }),
            ),
          ),
        );
      },
      set(param, value, slewMs) {
        const playing = ids.filter((id) => live.has(id));
        if (!playing.length || !link || !Number.isFinite(value)) return;
        link.send(
          concat(
            playing.map((voice) => {
              // A gain set by the game is the voice's own: its strip's trim still rides on it.
              const sounding = param === "gain" ? voiceStrips.get(voice) : undefined;
              if (sounding) sounding.base = value;
              const sent = sounding ? value * sounding.link.gain() : value;
              return encode("VOICE_SET", {
                voice,
                param: VOICE_PARAM[param],
                value: sent,
                slew: frames(slewMs),
              });
            }),
          ),
        );
      },
    };
  }

  /**
   * Starts the voices of one play of `key`: on the cue's bus, with its sends, its hand (`mine`) and, for a placed
   * cue played `at` somewhere, its place. `db` is what the governor adds; `loop` makes each voice loop: `"roll"`
   * from just past its attack, `"whole"` the whole sample.
   */
  function startVoices(
    key: K,
    picked: Picked,
    options: PlayOptions,
    context: AudioContext,
    db: number,
    loop: false | "roll" | "whole",
  ): Started | null {
    const out = link;
    if (!out) return null;
    const starts = startsOf(key, picked);
    if (!starts.length) return null;
    const cue = cueOf(key);
    const hand = mixer.presence(options.mine);
    const gain = dbGain((cue.level ?? 0) + (options.db ?? 0) + db + picked.db + hand.db);
    // A pitched cue, and a cue on a scale ladder, are put on the harmony clock: a degree when the play names one
    // (`degree`, or the ladder's `step`), else the nearest tone of the chord.
    const degree = options.degree ?? (cue.ladder === "scale" ? options.step : undefined);
    // A ladder's step climbs from the take's nearest tonic; a degree asked for by name goes to its nearest copy.
    const climbs = cue.ladder === "scale" && options.degree === undefined;
    const tuned =
      cue.pitched || cue.ladder === "scale" ? harmony.pitch(rootOf(picked.take), degree, false, climbs) : 1;
    const rate = positive(options.rate, 1) * positive(picked.rate, 1) * positive(tuned, 1);
    const delay = Math.max(0, (options.delayMs ?? 0) / 1000) || 0;
    // The cue's strip on the desk for the bus this play asks for (its role): the desk may route it elsewhere, its
    // gain rides on every voice, and its sends are the desk's where the desk says.
    const strip = roleLink(key, options.bus ?? cue.bus);
    const busName = strip.route() ?? mixer.desk.resolve(options.bus ?? cue.bus);
    const bus = mixer.index(busName);
    const own = strip.sends(cue.sends);
    strip.started(
      busName,
      own.map((send) => send.to),
    );
    const stripGain = strip.gain();
    const priority = Math.max(0, Math.round(cue.priority ?? 0)) || 0;
    // A cue's first two sends; the hand leans on the first (the room).
    const sends = own.map(({ to, level }, i) => ({
      bus: mixer.index(to),
      level: level * (i === 0 ? dbGain(hand.sendDb) : 1),
    }));
    const found = cue.placed && options.at !== undefined ? space.api.resolve(options.at) : null;
    // The hand says how much of the distance it takes: the player's own press can be where it landed, and close.
    const reach = Math.min(1, Math.max(0, hand.distance ?? 1)) || 0;
    const place = found ? { ...found, distance: found.distance * reach } : null;
    // A play with no offsets starts now (0); one with offsets is stamped on the context's frames, so its layers
    // keep their spacing to the sample.
    const timed = delay > 0 || starts.some((start) => start.at > 0);
    const sr = context.sampleRate;
    const base = timed ? Math.round((context.currentTime + LEAD_SECONDS + delay) * sr) : 0;
    const voices = starts.map((start) => ({
      id: nextVoice(),
      gain: start.gain * gain,
      rate: start.rate * rate,
    }));
    const records: Uint8Array[] = [];
    starts.forEach((start, i) => {
      const voice = voices[i];
      if (!voice) return;
      const atFrame = timed ? base + Math.round(start.at * sr) : 0;
      const seam = Math.min(
        Math.floor(start.held.frames / 4),
        Math.round(ROLL_SEAM_SECONDS * start.held.rate),
      );
      records.push(
        encode("VOICE_START", {
          atFrame,
          voice: voice.id,
          sample: start.held.id,
          bus,
          gain: voice.gain * stripGain,
          pan: 0,
          rate: voice.rate,
          offset: start.offset,
          loopStart: loop === "roll" ? seam : 0,
          loopEnd: loop ? start.held.frames : 0,
          attack: port.frames(options.attackMs),
          release: 0,
          sendBus1: sends[0]?.bus ?? 0,
          send1: sends[0]?.level ?? 0,
          sendBus2: sends[1]?.bus ?? 0,
          send2: sends[1]?.level ?? 0,
          priority,
          // The grid line the start waits for, if any: the play's own, else the cue's.
          flags: gridId(options.when ?? cue.quantise),
        }),
      );
      // After its start, on the same frame: the core places a voice it already holds.
      if (place) records.push(encode("VOICE_PLACE", { atFrame, voice: voice.id, ...place, slew: 0 }));
    });
    for (const voice of voices) {
      live.add(voice.id);
      voiceStrips.set(voice.id, { link: strip, base: voice.gain, roll: loop === "roll" });
      strip.voice(voice.id);
    }
    out.send(concat(records));
    return {
      handle: handleOf(
        voices.map((voice) => voice.id),
        sr,
      ),
      voices,
      link: strip,
    };
  }

  function playCore(key: K, options: PlayOptions, context: AudioContext): VoiceHandle | null {
    const cue = cueOf(key);
    const admission = governor.admit(key, cue, options, context.currentTime * 1000, soundInfo(key).seconds);
    if (admission.action === "skip") return null;
    if (admission.action === "roll" && !cue.loop) {
      startRoll(key, context, options);
      return null;
    }
    // A loop the governor would have rolled plays as it is: one voice already, with nothing to add.
    const { db, vary } = admission.action === "play" ? admission : { db: 0, vary: 1 };
    const picked = pickTake(cue, cueState(key), options, rng, takeReady, vary);
    return startVoices(key, picked, options, context, db, cue.loop ? "whole" : false)?.handle ?? null;
  }

  // Rolls: a cue played faster than its `roll.above` becomes one sustained voice that follows its rate.

  /** The roll sounds where the play that began it would have: on its bus, at its place, with its hand. */
  function startRoll(key: K, context: AudioContext, options: PlayOptions): void {
    if (rolling.has(key)) return;
    const named = cues[key].roll?.cue as K | undefined;
    const from = named !== undefined && named in cues ? named : key;
    const picked = pickTake(cueOf(from), cueState(from), {}, rng, takeReady);
    const where: PlayOptions = { bus: options.bus, at: options.at, mine: options.mine };
    const started = startVoices(from, picked, where, context, 0, "roll");
    if (!started) return;
    rolling.set(key, started);
    rollTimer ??= setInterval(tickRolls, ROLL_TICK_MS);
  }

  function endRolls(): void {
    for (const started of rolling.values()) started.handle.stop(ROLL_RELEASE_MS);
    rolling.clear();
    if (rollTimer !== null) clearInterval(rollTimer);
    rollTimer = null;
  }

  function tickRolls(): void {
    const context = engine?.ZZFX.audioContext;
    if (!context || !link || state !== "core") {
      endRolls();
      return;
    }
    const slew = port.frames(ROLL_TICK_MS);
    const records: Uint8Array[] = [];
    for (const roll of governor.rolls(context.currentTime * 1000)) {
      const started = rolling.get(roll.key as K);
      if (!started) continue;
      if (roll.ended) {
        started.handle.stop(ROLL_RELEASE_MS);
        rolling.delete(roll.key as K);
        continue;
      }
      for (const voice of started.voices) {
        if (!live.has(voice.id)) continue;
        const gain = voice.gain * dbGain(roll.db) * started.link.gain();
        const rate = voice.rate * positive(roll.rate, 1);
        records.push(encode("VOICE_SET", { voice: voice.id, param: VOICE_PARAM.gain, value: gain, slew }));
        records.push(encode("VOICE_SET", { voice: voice.id, param: VOICE_PARAM.rate, value: rate, slew }));
      }
    }
    if (records.length) link.send(concat(records));
    if (rolling.size === 0) endRolls();
  }

  // Packs.

  async function manifestOf(name: string): Promise<PackManifest | null> {
    const source = packs[name];
    if (!source) return null;
    return typeof source === "function" ? await source() : source;
  }

  /** Decodes and posts every sample of a loaded pack not yet held; resolves once the core holds them all. */
  async function fillPack(name: string): Promise<void> {
    const manifest = loaded.get(name);
    const context = engine?.ZZFX.audioContext;
    if (!manifest || !context || state !== "core") return;
    await Promise.all(
      Object.entries(manifest.samples).map(async ([sample, { url }]) => {
        const key = `${name}/${sample}`;
        let entry = held.get(key);
        if (!entry) {
          const clip = await fetchDecoded(url, context).catch(() => null);
          // Unloaded, or the core went, while this decoded: drop it.
          if (!clip || loaded.get(name) !== manifest || held.has(key)) return;
          entry = upload(key, channelsOf(clip.buffer), clip.buffer.sampleRate) ?? undefined;
        }
        if (entry) await whenReady(entry);
      }),
    );
  }

  // The gate.

  async function unlock(): Promise<void> {
    const loading = loadZzfx();
    if (!loading) return;
    const mod = await loading;
    if (level !== undefined) mod.ZZFX.volume = level;
    engine = mod;
    const context = mod.ZZFX.audioContext;
    booting ??= boot(context);
    void loadSamples(); // decoding works on a suspended context; not awaited, so the resume is not delayed
    await Promise.all([resume(context), booting]);
  }

  function loadSamples(): Promise<void> {
    if (!engine) return Promise.resolve();
    return clips.load(engine.ZZFX.audioContext, (file, clip) => {
      if (state === "core") uploadClip(file, clip);
    });
  }

  function soundInfo(key: K): { source: "sample" | "zzfx"; seconds: number } {
    const cue = cueOf(key);
    const takes = readyTakes(cue);
    if (takes.length) {
      const seconds = Math.max(
        ...takes.map(
          ({ take, entry }) =>
            Math.max(0, entry.frames / entry.rate - (take.at ?? 0)) / positive(take.rate, 1),
        ),
      );
      return { source: "sample", seconds };
    }
    const ready = readyClips(key);
    if (ready) return { source: "sample", seconds: clipSeconds(ready) };
    return { source: "zzfx", seconds: soundSeconds(cue.voices ?? []) };
  }

  function sendMaster(param: number, value: number): void {
    link?.send(encode("MASTER_SET", { param, value, slew: 0 }));
  }

  function play(key: K, options: PlayOptions = {}): VoiceHandle | null {
    if (muted || !engine) return null;
    const audio = engine.ZZFX.audioContext;
    if (audio.state !== "running") return null;
    if (state === "core") return playCore(key, options, audio);
    // A loop has no end of its own and the fallback has no voice to stop: it stays silent there.
    if (cues[key].loop) return null;
    playFallback(engine, cues[key].voices ?? [], readyClips(key));
    return null;
  }

  async function loadPack(name: string): Promise<void> {
    if (!loaded.has(name)) loaded.set(name, null);
    const manifest = loaded.get(name) ?? (await manifestOf(name));
    if (!loaded.has(name)) return; // unloaded while it resolved
    loaded.set(name, manifest);
    await fillPack(name);
  }

  return {
    play,
    unlock,
    armUnlock: (target: EventTarget = window) => armGestures(target, running, unlock),
    loadSamples,
    setMuted(value) {
      muted = value;
      sendMaster(MASTER_PARAM.mute, value ? 1 : 0);
    },
    isMuted: () => muted,
    setVolume(value) {
      level = value;
      if (engine) engine.ZZFX.volume = value;
      mixer.volume(value);
    },
    audioUnlocked: () => engine !== null,
    mode: () => (state === "core" || state === "fallback" ? state : "locked"),
    context,
    output: () => link?.node ?? null,
    loadPack,
    unloadPack(name) {
      // A recording staged beside one of its samples goes first: the pack's own is back under its key, to be freed.
      for (const key of [...swaps.keys()]) if (key.startsWith(`${name}/`)) desk.desk.unstage(key);
      const manifest = loaded.get(name);
      loaded.delete(name);
      if (manifest) for (const sample of Object.keys(manifest.samples)) free(`${name}/${sample}`);
    },
    packReady(name) {
      const manifest = loaded.get(name);
      if (!manifest || state !== "core") return false;
      return Object.keys(manifest.samples).every((sample) => held.get(`${name}/${sample}`)?.ready);
    },
    soundInfo,
    mixer: mixer.api,
    mod: mod.api,
    space: space.api,
    transport: transport.api,
    harmony: harmony.api,
    music: (def) => createMusic(def, host),
    sequence: (def) => createSequence(def, host),
    grain: (sample, def) => instruments.grain(sample, def),
    freeze(bus, amount, slewMs) {
      const units = bus === "master" ? [] : (buses?.[bus]?.fx ?? []);
      const slot = units.findIndex((unit) => unit.kind === "freeze");
      if (slot < 0) warn(`freeze("${bus}") needs a { kind: "freeze" } effect declared on that bus`);
      else mixer.api.bus(bus).fx(slot).set("amount", amount, slewMs);
    },
    babble: (def = {}) => createBabble(def, host),
    gen: (kind, def) => instruments.gen(kind, def),
    tap,
    // Where the core cannot run there is nothing for the desk to reach: it is the inert one, its tunables still live.
    get desk() {
      return state === "fallback" ? inert : desk.desk;
    },
  };
}
