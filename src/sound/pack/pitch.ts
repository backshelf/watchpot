import type { Pcm } from "./ffmpeg";

export type Root = { hz: number; confidence: number };

const MIN_HZ = 50;
const MAX_HZ = 2000;
/** The analysis window: the loudest this many seconds of the file. */
const WINDOW_SECONDS = 0.2;
const FRAME = 2048;
const THRESHOLD = 0.1;

/** A root is only kept at or above this confidence. */
export const MIN_CONFIDENCE = 0.8;

/** The start of the loudest `len` samples of `x`, found on a hop. */
function loudestStart(x: Float32Array, len: number, hop: number): number {
  if (x.length <= len) return 0;
  let best = 0;
  let bestE = -1;
  let e = 0;
  for (let i = 0; i < len; i++) e += (x[i] as number) ** 2;
  for (let s = 0; s + len <= x.length; s += hop) {
    if (s > 0) {
      for (let i = s - hop; i < s; i++) e -= (x[i] as number) ** 2;
      for (let i = s + len - hop; i < s + len; i++) e += (x[i] as number) ** 2;
    }
    if (e > bestE) {
      bestE = e;
      best = s;
    }
  }
  return best;
}

/** YIN on one frame at `start`: the pitch in Hz and its confidence (1 - the normalised difference at the dip). */
function yinFrame(x: Float32Array, start: number, w: number, rate: number): Root | null {
  const tauMax = Math.floor(rate / MIN_HZ);
  const tauMin = Math.max(2, Math.floor(rate / MAX_HZ));
  if (start + w + tauMax > x.length) return null;
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < w; j++) {
      const diff = (x[start + j] as number) - (x[start + j + tau] as number);
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // Cumulative mean normalised difference.
  const dn = new Float32Array(tauMax + 1);
  dn[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    run += d[tau] as number;
    dn[tau] = run === 0 ? 1 : ((d[tau] as number) * tau) / run;
  }
  // The first dip under the threshold, walked down to its floor; failing that, the global minimum.
  let tau = -1;
  for (let t = tauMin; t < tauMax; t++) {
    if ((dn[t] as number) < THRESHOLD) {
      while (t + 1 < tauMax && (dn[t + 1] as number) < (dn[t] as number)) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    let min = Infinity;
    for (let t = tauMin; t < tauMax; t++) {
      if ((dn[t] as number) < min) {
        min = dn[t] as number;
        tau = t;
      }
    }
  }
  if (tau < 0) return null;
  const confidence = 1 - (dn[tau] as number);
  // Parabolic interpolation around the dip for a sub-sample period.
  let period = tau;
  if (tau > 1 && tau < tauMax) {
    const a = dn[tau - 1] as number;
    const b = dn[tau] as number;
    const c = dn[tau + 1] as number;
    const denom = a - 2 * b + c;
    if (denom !== 0) period = tau + (a - c) / (2 * denom);
  }
  return { hz: rate / period, confidence };
}

/**
 * The root of a tonal file by YIN over the loudest 200 ms: the frame of best confidence wins. `null` when the file is
 * too short to analyse or no frame reaches `MIN_CONFIDENCE`.
 */
export function detectRoot(pcm: Pcm): Root | null {
  const first = pcm.channels[0];
  if (!first) return null;
  const mono = new Float32Array(first.length);
  for (const ch of pcm.channels)
    for (let i = 0; i < mono.length; i++)
      mono[i] = (mono[i] as number) + (ch[i] as number) / pcm.channels.length;
  const len = Math.round(WINDOW_SECONDS * pcm.rate);
  const from = loudestStart(mono, len, Math.round(0.01 * pcm.rate));
  const win = mono.subarray(from, from + len);
  let best: Root | null = null;
  for (let s = 0; s + FRAME <= win.length; s += FRAME / 2) {
    const r = yinFrame(win, s, FRAME / 2, pcm.rate);
    if (r && (!best || r.confidence > best.confidence)) best = r;
  }
  return best && best.confidence >= MIN_CONFIDENCE ? best : null;
}

/** A note name (`"A4"`, `"C#3"`, `"Bb2"`) or a number of Hz as Hz; `undefined` when it is neither. */
export function rootToHz(root: string | number): number | undefined {
  if (typeof root === "number") return root > 0 ? root : undefined;
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(root.trim());
  if (!m) return Number(root) > 0 ? Number(root) : undefined;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[(m[1] as string).toUpperCase() as "C"] as number;
  const semis = base + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
}

/** The nearest note's name for a log line (`"A4 +3c"`). */
export function noteName(hz: number): string {
  const midi = 69 + 12 * Math.log2(hz / 440);
  const n = Math.round(midi);
  const cents = Math.round((midi - n) * 100);
  const name = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][((n % 12) + 12) % 12];
  return `${name}${Math.floor(n / 12) - 1}${cents === 0 ? "" : ` ${cents > 0 ? "+" : ""}${cents}c`}`;
}
