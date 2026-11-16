/**
 * How a value sits on a fader's travel, how it moves by a nudge, and how it reads and parses as text. Faders work in
 * position (0 at the bottom or left, 1 at the top or right); the desk in values.
 */
import type { DeskParam } from "../../sound/desk";

export type Nudge = "fine" | "normal" | "coarse";

export interface Scale {
  min: number;
  max: number;
  toPos(value: number): number;
  fromPos(pos: number): number;
  /** One step of the value up (`dir` 1) or down, clamped to the range. */
  nudge(value: number, dir: 1 | -1, size: Nudge): number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
/** Rounds away float dust (0.30000000000000004) without changing what a person set. */
const tidy = (v: number) => Number.parseFloat(v.toPrecision(10));

export const decimalsOf = (step: number) => {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
};

function quantize(v: number, min: number, step: number | undefined): number {
  if (!step || step <= 0) return tidy(v);
  return Number((Math.round((v - min) / step) * step + min).toFixed(decimalsOf(step)));
}

/** Position by nudge size, for scales that step in travel rather than in their unit. */
const TRAVEL: Record<Nudge, number> = { fine: 0.001, normal: 0.01, coarse: 0.1 };
/** dB per nudge size. */
const DB_STEP: Record<Nudge, number> = { fine: 0.1, normal: 0.5, coarse: 3 };

/** Steps in travel, at least one `step` of the value. */
function travelNudge(scale: Omit<Scale, "nudge">, step?: number) {
  return (value: number, dir: 1 | -1, size: Nudge) => {
    const moved = scale.fromPos(clamp01(scale.toPos(value) + dir * TRAVEL[size]));
    let next = quantize(moved, scale.min, step);
    if (step && next === value) next = quantize(value + dir * step, scale.min, step);
    return clamp(next, scale.min, scale.max);
  };
}

/**
 * A fader law for dB: travel follows the fourth root of the gain, so the top of the throw (where a mix lives) gets
 * most of it, as a console's fader does. Unity sits about four fifths up on a -60..+6 throw.
 */
export function dbScale(min: number, max: number): Scale {
  const q = (db: number) => 10 ** (db / 80);
  const lo = q(min);
  const hi = q(max);
  return {
    min,
    max,
    toPos: (db) =>
      Number.isFinite(db) ? clamp01((q(clamp(db, min, max)) - lo) / (hi - lo)) : db > 0 ? 1 : 0,
    fromPos: (pos) => clamp(80 * Math.log10(lo + clamp01(pos) * (hi - lo)), min, max),
    nudge: (db, dir, size) => {
      const step = DB_STEP[size];
      // Snap to the step's grid first, so -6.3 goes to -6.0 and not -5.8.
      const grid = dir > 0 ? Math.floor(db / step + 1e-9) * step : Math.ceil(db / step - 1e-9) * step;
      return clamp(tidy(grid + dir * step), min, max);
    },
  };
}

/** A send's gain, 0 (none) to `max`, on the same law as a level fader; it steps in dB. */
export function gainScale(max: number): Scale {
  const floor = 10 ** (-60 / 20);
  return {
    min: 0,
    max,
    toPos: (g) => clamp01((clamp(g, 0, max) / max) ** 0.25),
    fromPos: (pos) => tidy(max * clamp01(pos) ** 4),
    nudge: (g, dir, size) => {
      if (g < floor) return dir > 0 ? floor : 0;
      const db = dbScale(-60, 20 * Math.log10(max)).nudge(toDb(g), dir, size);
      if (dir < 0 && db <= -60) return 0;
      return clamp(tidy(10 ** (db / 20)), 0, max);
    },
  };
}

export function linScale(min: number, max: number, step?: number): Scale {
  const base = {
    min,
    max,
    toPos: (v: number) => (max === min ? 0 : clamp01((v - min) / (max - min))),
    fromPos: (pos: number) => quantize(min + clamp01(pos) * (max - min), min, step),
  };
  return { ...base, nudge: travelNudge(base, step) };
}

/**
 * Log travel for frequencies and times. A range that starts at 0 (a delay of 0 to 2 s) cannot be logarithmic, so it
 * gets a curve that is: three decades of fine travel above the floor, then log.
 */
export function logScale(min: number, max: number): Scale {
  if (min > 0) {
    const span = Math.log(max / min);
    const base = {
      min,
      max,
      toPos: (v: number) => clamp01(Math.log(clamp(v, min, max) / min) / span),
      fromPos: (pos: number) => tidy(min * Math.exp(clamp01(pos) * span)),
    };
    return { ...base, nudge: travelNudge(base) };
  }
  const k = 1000 / (max - min);
  const span = Math.log1p(k * (max - min));
  const base = {
    min,
    max,
    toPos: (v: number) => clamp01(Math.log1p(k * (clamp(v, min, max) - min)) / span),
    fromPos: (pos: number) => tidy(min + Math.expm1(clamp01(pos) * span) / k),
  };
  return { ...base, nudge: travelNudge(base) };
}

export function paramScale(p: DeskParam): Scale {
  if (p.scale === "log") return logScale(p.min, p.max);
  return linScale(p.min, p.max, p.unit === "bits" || p.scale === "choice" ? 1 : undefined);
}

// ---- Text ----------------------------------------------------------------------------------------------------------

export const toDb = (gain: number) => (gain > 0 ? 20 * Math.log10(gain) : Number.NEGATIVE_INFINITY);
export const fromDb = (db: number) => (Number.isFinite(db) ? 10 ** (db / 20) : 0);

const MINUS = "−";
const signed = (v: number, digits: number) => {
  const text = Math.abs(v).toFixed(digits);
  if (Number(text) === 0) return text;
  return (v < 0 ? MINUS : "+") + text;
};

/** A dB figure with its sign, a true minus and one decimal: "−6.0", "+1.5", "0.0", "−∞". */
export function fmtDb(db: number): string {
  if (!Number.isFinite(db) || db <= -120) return db > 0 ? "+∞" : `${MINUS}∞`;
  return signed(db, 1);
}

/** A value in a param's unit, as a field shows it and `parseValue` reads it back. */
export function fmtValue(v: number, unit: string, step?: number): string {
  switch (unit) {
    case "dB":
      return `${fmtDb(v)} dB`;
    case "Hz":
      if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz`;
      return `${v.toFixed(v >= 100 ? 0 : 1)} Hz`;
    case "s":
      if (Math.abs(v) < 1) return `${(v * 1000).toFixed(Math.abs(v) < 0.01 ? 1 : 0)} ms`;
      return `${v.toFixed(2)} s`;
    case "ratio":
      return `${v.toFixed(1)}:1`;
    case "bpm":
      return `${v.toFixed(0)} bpm`;
    case "beats":
      return `${v.toFixed(2)} beats`;
    case "bits":
      return `${Math.round(v)} bits`;
    default: {
      const digits = step ? decimalsOf(step) : Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
      const text = v.toFixed(digits).replace("-", MINUS);
      return unit ? `${text} ${unit}` : text;
    }
  }
}

/**
 * Reads what a person typed: a number with an optional suffix in the field's unit or a near one ("1.2k", "1.2 kHz",
 * "250ms", "-6", "−6 dB", "4:1", "-inf"). Null when it is not a number.
 */
export function parseValue(text: string, unit: string): number | null {
  const t = text.trim().toLowerCase().replaceAll(MINUS, "-").replace(",", ".");
  if (/^-\s*(inf|∞)/.test(t)) return Number.NEGATIVE_INFINITY;
  const m = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*([a-z:%]*)/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const suffix = m[2] ?? "";
  if (suffix === "k" || suffix === "khz") return n * 1000;
  if (suffix === "ms") return unit === "s" ? n / 1000 : n;
  return n;
}
