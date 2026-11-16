/**
 * The harmony clock: the key, the scale and the chord every pitched cue is transposed onto. Arithmetic on the main
 * thread: a recording has a root, the clock has a key, and a play is a rate.
 *
 * A degree counts from 0 (the key's tonic) along the scale; past the scale's length it climbs octaves. A recording
 * with a root moves to the nearest copy of its degree's note, a fifth above preferred to a fourth below (so degree 0
 * to 6 never moves a take more than seven semitones); one with no root is moved relative to itself (degree 0 is 1).
 * A ladder is the other reading (`climb`): step 0 goes to the nearest copy of the tonic and every step is measured up
 * from there, so a ladder always rises, however far the recording's root is from the key.
 */
import type { CorePort } from "../port";
import type { Grid, Harmony, Scale } from "../types";
import type { TransportCore } from "./transport";

/** The harmony clock as `engine.ts` holds it. */
export interface HarmonyCore {
  /** What a game sees: `sound.harmony`. */
  api: Harmony;
  /**
   * The ratio that puts one play on the clock. `rootHz` is the recording's root (undefined when it has none: the
   * ratio is then relative to the sound as it is, so degree 0 is 1). `degree` is the scale degree asked for;
   * undefined asks for the nearest tone of the chord (or of the scale, with no chord set). `pending` reads the
   * harmony a `set` waiting for its grid line will move to, rather than the one sounding now. `climb` reads the
   * degree as a ladder's step: measured up from the nearest copy of the tonic, never wrapped down on its own.
   */
  pitch(rootHz: number | undefined, degree: number | undefined, pending?: boolean, climb?: boolean): number;
  /** Calls `fn` on every `set` (as it is asked, not when it lands); the returned function stops it. */
  onChange(fn: () => void): () => void;
}

/** Each scale's steps, in semitones above the tonic. */
export const SCALES: Readonly<Record<Scale, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
};

const NOTES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A key's tonic as a pitch class (C is 0) and whether it names a minor key; null for a name that is not a key. */
export function parseKey(key: string): { tonic: number; minor: boolean } | null {
  const match = /^([A-G])([#b]?)(m?)$/.exec(key.trim());
  if (!match) return null;
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return { tonic: ((NOTES[match[1] ?? "C"] ?? 0) + accidental + 12) % 12, minor: match[3] === "m" };
}

interface State {
  key: string;
  scale: Scale;
  chord: readonly number[];
  tonic: number;
}

/** Wraps a semitone difference into [-low, 12 - low), with a hair of slack so a root a rounding off the edge stays in. */
const wrap = (semitones: number, low: number): number => {
  const shifted = semitones + low + 1e-6;
  return (((shifted % 12) + 12) % 12) - low - 1e-6;
};
/** The nearest copy of a note, a fifth up beating a fourth down: -4..7 semitones. */
const near = (semitones: number): number => wrap(semitones, 4);
/** The plain nearest copy: -6..5 semitones. */
const nearest = (semitones: number): number => wrap(semitones, 6);
/** A recording's root as semitones above C, fractional (A440 is 9). */
const semitonesOf = (hz: number): number => 9 + 12 * Math.log2(hz / 440);

/** A degree's semitones above the tonic: its scale step plus the octaves it has climbed. */
function stepOf(scale: readonly number[], degree: number): number {
  const n = Math.round(degree);
  const octave = Math.floor(n / scale.length);
  return 12 * octave + (scale[n - octave * scale.length] ?? 0);
}

function ratioOf(
  state: State,
  rootHz: number | undefined,
  degree: number | undefined,
  climb = false,
): number {
  const scale = SCALES[state.scale];
  const rooted = rootHz !== undefined && Number.isFinite(rootHz) && rootHz > 0;
  if (degree !== undefined && Number.isFinite(degree)) {
    const step = stepOf(scale, degree);
    if (!rooted) return 2 ** (step / 12);
    const root = semitonesOf(rootHz);
    // A ladder: the tonic nearest the recording, then the step's own height above it.
    if (climb) return 2 ** ((near(state.tonic - root) + step) / 12);
    const inScale = ((step % 12) + 12) % 12;
    const octaves = step - inScale;
    return 2 ** ((near(state.tonic + inScale - root) + octaves) / 12);
  }
  // No degree: a rooted take snaps to the nearest tone of the chord (or the scale); one with no root stays as it is.
  if (!rooted) return 1;
  const root = semitonesOf(rootHz);
  const tones = state.chord.length ? state.chord.map((d) => stepOf(scale, d)) : scale;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const tone of tones) {
    const move = nearest(state.tonic + tone - root);
    if (Math.abs(move) < bestDistance) {
      best = move;
      bestDistance = Math.abs(move);
    }
  }
  return 2 ** (best / 12);
}

export function createHarmony(transport: TransportCore, port: CorePort): HarmonyCore {
  let now: State = { key: "C", scale: "major", chord: [], tonic: 0 };
  /** A `set` waiting for its grid line: the frame it lands on. */
  let pending: { at: number; state: State } | null = null;
  const changes = new Set<() => void>();
  const warned = new Set<string>();

  /** The harmony sounding now: a pending set lands once the context's clock reaches its line. */
  const current = (): State => {
    if (pending && port.frame() >= pending.at) {
      now = pending.state;
      pending = null;
    }
    return now;
  };
  const latest = (): State => pending?.state ?? current();

  return {
    api: {
      set(options, when?: Grid) {
        const key = parseKey(options.key);
        if (!key) {
          if (!warned.has(options.key)) {
            warned.add(options.key);
            console.warn(
              `watchpot/sound: "${options.key}" is not a key ("C" to "B", "#" or "b", "m" for minor)`,
            );
          }
          return;
        }
        const state: State = {
          key: options.key,
          scale: options.scale ?? (key.minor ? "minor" : "major"),
          chord: [...(options.chord ?? [])],
          tonic: key.tonic,
        };
        const at = transport.next(when);
        current();
        if (at > port.frame()) pending = { at, state };
        else {
          now = state;
          pending = null;
        }
        for (const fn of changes) fn();
      },
      rateFor: (rootHz, degree) => ratioOf(current(), rootHz, degree),
      current() {
        const { key, scale, chord } = current();
        return { key, scale, chord };
      },
    },
    pitch: (rootHz, degree, upcoming = false, climb = false) =>
      ratioOf(upcoming ? latest() : current(), rootHz, degree, climb),
    onChange(fn) {
      changes.add(fn);
      return () => void changes.delete(fn);
    },
  };
}
