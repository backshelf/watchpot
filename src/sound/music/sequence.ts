/**
 * A sequence: a step pattern on the transport's grid that plays a cue, rewritten live, with a call on every step
 * for the page to draw.
 *
 * A sequence is a track of the core's sequencer: the cue's voice (`host.voice`, asked again whenever a sample comes
 * ready, so a cue whose pack arrives late moves onto it) is the track's template, and the pattern is a velocity and
 * a rate per step. The core plays it on the grid and swaps a new pattern in on the bar line; the main thread only
 * says what it is.
 */
import { NO_LINK } from "../desk";
import type { CueVoice, SoundHost } from "../port";
import { encode, gridId, LIMITS, STEP_SOURCE } from "../protocol";
import type { Grid, Sequence, SequenceDef } from "../types";

/** The tracks each sound's sequences hold. */
const tracks = new WeakMap<SoundHost, Set<number>>();

function takeTrack(host: SoundHost): number {
  let taken = tracks.get(host);
  if (!taken) {
    taken = new Set();
    tracks.set(host, taken);
  }
  for (let track = 0; track < LIMITS.SEQ_TRACKS; track++) {
    if (!taken.has(track)) {
      taken.add(track);
      return track;
    }
  }
  return -1;
}

const dbGain = (db: number | undefined): number =>
  db !== undefined && Number.isFinite(db) ? 10 ** (db / 20) : 1;

/**
 * A pattern as velocities, at most 64: a string's `1` is a hit and `0` a rest (spaces and `|` are left out, to mark
 * beats and bars); an array's numbers are velocities, 0..1.
 */
export function parsePattern(pattern: string | readonly number[]): number[] {
  if (typeof pattern === "string") {
    return [...pattern.replace(/[\s|]/g, "")].slice(0, LIMITS.SEQ_STEPS).map((char) => {
      if (char === "1") return 1;
      if (char === "0") return 0;
      throw new Error(`watchpot/sound: a step pattern is "0" and "1", not "${char}"`);
    });
  }
  return pattern
    .slice(0, LIMITS.SEQ_STEPS)
    .map((v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0));
}

/** Builds a sequence over a sound. At most 16 run at once. */
export function createSequence(def: SequenceDef<string>, host: SoundHost): Sequence {
  const { port, harmony } = host;
  const track = takeTrack(host);
  if (track < 0) {
    console.warn(`watchpot/sound: every one of the core's ${LIMITS.SEQ_TRACKS} sequencer tracks is in use`);
    return { steps() {}, set() {}, onStep: () => () => {}, stop() {} };
  }
  let cue = def.cue as string;
  let grid: Grid = def.grid ?? "16";
  let level = def.level ?? 0;
  let degrees: readonly number[] = def.degrees ?? [];
  let velocities = parsePattern(def.steps);
  /** The voice the track was last defined with (null: not yet). */
  let defined: CueVoice | null = null;
  let stopped = false;
  const stepping = new Set<(index: number) => void>();

  /** The rate of each step: the cue's own, times its degree's ratio on the harmony clock (a set waiting included). */
  const rates = (voice: CueVoice) =>
    velocities.map((_, i) =>
      degrees.length ? voice.rate * harmony.pitch(undefined, degrees[i % degrees.length], true) : voice.rate,
    );

  function sendSteps(voice: CueVoice): void {
    port.send(
      encode("SEQ_STEPS", {
        track,
        count: velocities.length,
        now: 0,
        velocity: velocities,
        rate: rates(voice),
      }),
    );
  }

  /** Defines the track with the cue's voice when it can sound and has changed; `steps` re-sends the pattern too. */
  function sync(steps: boolean): void {
    if (stopped || !port.up()) return;
    const asked = host.voice(cue);
    if (!asked) return;
    // A new sample (a take's pack arrived, a cue moved) or bus redefines the track; a pick's own variation does not.
    const changed = !defined || asked.sample !== defined.sample || asked.bus !== defined.bus;
    const voice = changed || !defined ? asked : defined;
    if (changed) {
      const [first, second] = voice.sends;
      port.send(
        encode("SEQ_DEFINE", {
          track,
          sample: voice.sample,
          bus: voice.bus,
          gain: voice.gain * dbGain(level),
          pan: 0,
          sendBus1: first?.bus ?? 0,
          send1: first?.level ?? 0,
          sendBus2: second?.bus ?? 0,
          send2: second?.level ?? 0,
          grid: gridId(grid),
        }),
      );
    }
    if (changed || steps) sendSteps(voice);
    defined = voice;
  }

  // The cue's desk strip: its trim is in the voice the track is defined with, so a trim defines the track again.
  let link = NO_LINK;
  let unwatch = () => {};
  const watch = () => {
    unwatch();
    link = host.channel?.("cue", cue) ?? NO_LINK;
    unwatch = link.watch(() => {
      defined = null;
      sync(false);
    });
  };
  watch();

  const unlisten = port.listen((event) => {
    if (event.op === "SAMPLE_READY") sync(false);
    else if (event.op === "STEP" && event.source === STEP_SOURCE.seq && event.track === track) {
      link.started(defined?.busName);
      for (const fn of stepping) fn(event.index);
    }
  });
  const unchange = harmony.onChange(() => {
    if (degrees.length) sync(true);
  });
  port.whenUp(() => sync(true));

  return {
    steps(pattern) {
      if (stopped) return;
      velocities = parsePattern(pattern);
      sync(true);
    },
    set(options) {
      if (stopped) return;
      if (options.cue !== undefined && options.cue !== cue) {
        cue = options.cue;
        watch();
      }
      if (options.grid !== undefined) grid = options.grid;
      if (options.level !== undefined) level = options.level;
      if (options.degrees !== undefined) degrees = options.degrees;
      // Anything that changes the template defines the track again.
      if (options.cue !== undefined || options.grid !== undefined || options.level !== undefined)
        defined = null;
      sync(true);
    },
    onStep(fn) {
      stepping.add(fn);
      return () => void stepping.delete(fn);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      unlisten();
      unwatch();
      unchange();
      stepping.clear();
      tracks.get(host)?.delete(track);
      // A sample of 0 removes the track.
      if (defined) {
        port.send(
          encode("SEQ_DEFINE", {
            track,
            sample: 0,
            bus: 0,
            gain: 0,
            pan: 0,
            sendBus1: 0,
            send1: 0,
            sendBus2: 0,
            send2: 0,
            grid: 0,
          }),
        );
      }
    },
  };
}
