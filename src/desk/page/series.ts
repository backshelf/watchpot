// The sim desk's data shaping: the server's windows in, the series the graphs and tables draw out. Pure: no React, no
// DOM. Decimals arrive as strings and are parsed once, here.
import { D, type Decimal, fmt } from "../../core";
import type { FittedGate } from "../../sim/fit";
import type { DeskPoint, ToClient } from "../protocol";

export const HOUR_MS = 3_600_000;

type WindowMessage = Extract<ToClient, { type: "window" }>;

/** A series point: played hours and the value then. */
export type Pt = readonly [hours: number, value: Decimal];

/** A next-cost series point: the wallet that pays and the price, at played hours. */
export interface NextPt {
  hours: number;
  held: Decimal;
  cost: Decimal;
}

/** One sample of the desk, parsed. */
export interface Sample {
  atMs: number;
  hours: number;
  currencies: Record<string, Decimal>;
  next: Record<string, { currency: string; cost: Decimal }>;
}

/** What one seed has sent: its samples in time order and the gates of its furthest window. */
export interface SeedData {
  samples: readonly Sample[];
  gates: readonly FittedGate[];
  /** The `toMs` of the window `gates` came from. */
  gatesToMs: number;
}

/** Every seed's data. Immutable: `addWindow` gives a new one. */
export interface DeskData {
  seeds: ReadonlyMap<number, SeedData>;
}

export const emptyData = (): DeskData => ({ seeds: new Map() });

function parse(p: DeskPoint): Sample {
  const currencies: Record<string, Decimal> = {};
  for (const [k, v] of Object.entries(p.currencies)) currencies[k] = D(v);
  const next: Sample["next"] = {};
  for (const [k, v] of Object.entries(p.next ?? {})) next[k] = { currency: v.currency, cost: D(v.cost) };
  return { atMs: p.atMs, hours: p.atMs / HOUR_MS, currencies, next };
}

/**
 * Merges a window into a seed's samples. Windows may arrive in any order and may overlap: the samples already held
 * inside the new window's span are replaced by the window's own.
 */
export function addWindow(data: DeskData, msg: WindowMessage): DeskData {
  const fresh = msg.points.map(parse).sort((a, b) => a.atMs - b.atMs);
  const lo = Math.min(msg.fromMs, fresh[0]?.atMs ?? Infinity);
  const hi = Math.max(msg.toMs, fresh[fresh.length - 1]?.atMs ?? -Infinity);
  const before = data.seeds.get(msg.seed);
  const kept = (before?.samples ?? []).filter((s) => s.atMs < lo || s.atMs > hi);
  const samples = [...kept, ...fresh].sort((a, b) => a.atMs - b.atMs);
  const newer = !before || msg.toMs >= before.gatesToMs;
  const seeds = new Map(data.seeds);
  seeds.set(msg.seed, {
    samples,
    gates: newer ? msg.gates : before.gates,
    gatesToMs: newer ? msg.toMs : before.gatesToMs,
  });
  return { seeds };
}

/** The seed numbers that have sent anything, ascending. */
export const seedNumbers = (data: DeskData): number[] => [...data.seeds.keys()].sort((a, b) => a - b);

/** The buyable keys seen in any sample, in order of first appearance (seeds ascending). */
export function nextKeys(data: DeskData): string[] {
  const keys = new Set<string>();
  for (const seed of seedNumbers(data))
    for (const s of data.seeds.get(seed)?.samples ?? []) for (const k of Object.keys(s.next)) keys.add(k);
  return [...keys];
}

/** A seed's series for one currency. */
export function currencySeries(data: DeskData, seed: number, currency: string): Pt[] {
  const out: Pt[] = [];
  for (const s of data.seeds.get(seed)?.samples ?? []) {
    const v = s.currencies[currency];
    if (v) out.push([s.hours, v]);
  }
  return out;
}

/** A seed's series for one buyable: the balance of the currency it is paid in, and its price. */
export function nextSeries(data: DeskData, seed: number, key: string): NextPt[] {
  const out: NextPt[] = [];
  for (const s of data.seeds.get(seed)?.samples ?? []) {
    const n = s.next[key];
    const held = n && s.currencies[n.currency];
    if (n && held) out.push({ hours: s.hours, held, cost: n.cost });
  }
  return out;
}

/** The currency a buyable is paid in, as of its latest sample on any seed. */
export function nextCurrency(data: DeskData, key: string): string | undefined {
  let latest = -Infinity;
  let currency: string | undefined;
  for (const seed of data.seeds.values())
    for (const s of seed.samples) {
      const n = s.next[key];
      if (n && s.atMs >= latest) {
        latest = s.atMs;
        currency = n.currency;
      }
    }
  return currency;
}

/** Index of the last entry whose hour is at or before `hours`, or -1. Entries are in time order. */
export function lastAtOrBefore(hoursOf: (i: number) => number, length: number, hours: number): number {
  let lo = 0;
  let hi = length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (hoursOf(mid) <= hours + 1e-9) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** The value of a series at an hour: its last point at or before it. */
export function valueAt(pts: readonly Pt[], hours: number): Decimal | undefined {
  return pts[lastAtOrBefore((i) => pts[i]?.[0] ?? 0, pts.length, hours)]?.[1];
}

/** The same for a next-cost series. */
export function nextAt(pts: readonly NextPt[], hours: number): NextPt | undefined {
  return pts[lastAtOrBefore((i) => pts[i]?.hours ?? 0, pts.length, hours)];
}

/** The median of some Decimals; two in the middle average. */
export function median(values: readonly Decimal[]): Decimal {
  const sorted = [...values].sort((a, b) => a.cmp(b));
  const mid = sorted.length >> 1;
  const hi = sorted[mid] as Decimal;
  return sorted.length % 2 === 1 ? hi : (sorted[mid - 1] as Decimal).add(hi).div(2);
}

/** The median of plain numbers. */
export function medianNumber(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * The median across seeds at every hour any of them was sampled. Seeds are sampled at different hours, so each
 * contributes its last point at or before the hour; a seed with none yet is left out of that hour. One series comes
 * back as it is.
 */
export function medianSeries(lists: readonly (readonly Pt[])[]): Pt[] {
  const live = lists.filter((l) => l.length > 0);
  if (live.length <= 1) return [...(live[0] ?? [])];
  const hours = [...new Set(live.flatMap((l) => l.map((p) => p[0])))].sort((a, b) => a - b);
  const at = live.map(() => -1);
  const out: Pt[] = [];
  for (const h of hours) {
    const values: Decimal[] = [];
    live.forEach((l, i) => {
      let k = at[i] as number;
      while (k + 1 < l.length && (l[k + 1]?.[0] ?? Infinity) <= h + 1e-9) k++;
      at[i] = k;
      const p = l[k];
      if (p) values.push(p[1]);
    });
    if (values.length > 0) out.push([h, median(values)]);
  }
  return out;
}

/** A currency's median across the seeds that have data. */
export const medianCurrency = (data: DeskData, currency: string): Pt[] =>
  medianSeries(seedNumbers(data).map((s) => currencySeries(data, s, currency)));

/** A buyable's median wallet and price across seeds, on the same hours. */
export function medianNext(data: DeskData, key: string): NextPt[] {
  const per = seedNumbers(data).map((s) => nextSeries(data, s, key));
  const held = medianSeries(per.map((l) => l.map((p): Pt => [p.hours, p.held])));
  const cost = medianSeries(per.map((l) => l.map((p): Pt => [p.hours, p.cost])));
  return held.map(([hours, h], i) => ({ hours, held: h, cost: cost[i]?.[1] ?? h }));
}

/** log10 of a Decimal as a number: `-Infinity` for zero or below, the axis floor. */
export function log10(d: Decimal): number {
  if (!d.gt(0)) return Number.NEGATIVE_INFINITY;
  return d.log10().toNumber();
}

/** A Decimal as a plain number, clamped to what a float holds; for a linear axis. */
export function toNumber(d: Decimal): number {
  const n = d.toNumber();
  return Number.isNaN(n) ? 0 : Math.max(-Number.MAX_VALUE, Math.min(Number.MAX_VALUE, n));
}

/** A Decimal's short form: up to two decimals below 1,000, then `1.23e45`. */
export function short(d: Decimal): string {
  if (d.isNan()) return "0";
  if (d.eq(0)) return "0";
  const abs = d.abs();
  if (abs.lt(0.01) || abs.gte(1000)) return d.toExponential(2).replace("e+", "e");
  return String(Number(d.toNumber().toFixed(2)));
}

/**
 * A Decimal to three significant digits in the engine's own form (`fmt`: separators below 100,000, then `1.52M`, then
 * scientific past `Dc`). The figure a table or a readout prints; `–` for nothing.
 */
export function figure(d: Decimal | undefined): string {
  if (!d || d.isNan()) return "–";
  const abs = d.abs();
  if (abs.gt(0) && abs.lt(1e-4)) return d.toExponential(2).replace("e+", "e");
  // fmt keeps plain digits up to 100,000 (`18,899`); a table column reads better in one short form throughout.
  if (abs.gte(1e3) && abs.lt(1e5)) return `${(d.toNumber() / 1e3).toFixed(2)}K`;
  const decimals = abs.gte(100) || abs.eq(0) ? 0 : abs.gte(10) ? 1 : abs.gte(1) ? 2 : abs.gte(0.1) ? 3 : 4;
  return fmt(d, { decimals }).text;
}

/** `figure` without the trailing zeros of its fraction: `152K`, `1.5M`, `0.2`. For an axis, where room is short. */
export function compact(d: Decimal): string {
  const text = figure(d);
  return text.includes(".") ? text.replace(/\.?0+(?=[A-Za-z]|$)/, "") : text;
}

/**
 * The change from a value in the run before to the value now, as a signed percentage: `+12.4%`, `−3.1%` (a true
 * minus), three significant digits. Blank when there is no run before to compare with; `–` when the change means
 * nothing (a price that was zero, a value not yet reached).
 */
export function percentChange(now: Decimal | undefined, before: Decimal | undefined): string {
  if (before === undefined) return "";
  if (!now || now.isNan() || !before.gt(0)) return "–";
  const pct = now.sub(before).div(before).mul(100);
  const abs = pct.abs();
  // Past +1000% a percentage stops reading (`+15.92K%`): say it as a multiple of the value before (`×160`).
  if (pct.gte(1000)) return `×${figure(now.div(before))}`;
  const body = abs.lt(100) ? abs.toNumber().toFixed(1) : figure(abs);
  if (body === "0.0") return "0.0%";
  return `${pct.lt(0) ? "\u2212" : "+"}${body}%`;
}

/** One pixel column of a downsampled series: where it sits and the lowest and highest value that fell in it. */
export interface Band {
  x: number;
  min: number;
  max: number;
}

/**
 * A series cut into `columns` equal slices of `[from, to]` (a pixel column each): for each slice that holds points,
 * the mean x and the lowest and highest y. Drawing the highs as the line and the lows-to-highs as a band keeps every
 * purchase dip from becoming a spike, while a real drop (a reset) is still a drop: the slice it falls in keeps both
 * ends, and the next slice starts low. A slice with one point is that point, so a sparse series is drawn as it is.
 * Points are in ascending x; a NaN is skipped; `-Infinity` (a log axis' zero) is kept as the low.
 */
export function downsample(
  pts: readonly (readonly [x: number, y: number])[],
  from: number,
  to: number,
  columns: number,
): Band[] {
  const live = pts.filter(([x, y]) => !Number.isNaN(x) && !Number.isNaN(y));
  if (!(to > from) || !(columns >= 1)) return live.map(([x, y]) => ({ x, min: y, max: y }));
  const out: Band[] = [];
  const per = columns / (to - from);
  let at = -1;
  let n = 0;
  let sum = 0;
  let cur: Band | undefined;
  for (const [x, y] of live) {
    const col = Math.min(columns - 1, Math.max(0, Math.floor((x - from) * per)));
    if (cur && col === at) {
      n++;
      sum += x;
      cur.x = sum / n;
      cur.min = Math.min(cur.min, y);
      cur.max = Math.max(cur.max, y);
    } else {
      at = col;
      n = 1;
      sum = x;
      cur = { x, min: y, max: y };
      out.push(cur);
    }
  }
  return out;
}

/**
 * A series smoothed by a centred moving average over a window of `windowHours` — hours, not points, for the points are
 * not evenly spaced: each point's y becomes the mean of the finite y of every point within half the window either
 * side of it. Two pointers and running sums, O(n) whatever the window; points are in ascending x. A window of zero or
 * less returns the series unchanged, and a point with nothing finite in its window keeps its own y (a lone axis-floor
 * `-Infinity` stays the floor). It is a drawing aid only: the readout and the tables keep the raw values.
 */
export function smooth(pts: readonly (readonly [number, number])[], windowHours: number): [number, number][] {
  if (!(windowHours > 0)) return pts.map(([x, y]) => [x, y]);
  const half = windowHours / 2;
  const out: [number, number][] = [];
  let lo = 0;
  let hi = 0;
  let n = 0;
  let sum = 0;
  for (const [x, y] of pts) {
    while (hi < pts.length && (pts[hi]?.[0] ?? Infinity) <= x + half + 1e-9) {
      const v = pts[hi]?.[1];
      if (v !== undefined && Number.isFinite(v)) {
        n++;
        sum += v;
      }
      hi++;
    }
    while (lo < hi && (pts[lo]?.[0] ?? -Infinity) < x - half - 1e-9) {
      const v = pts[lo]?.[1];
      if (v !== undefined && Number.isFinite(v)) {
        n--;
        sum -= v;
      }
      lo++;
    }
    out.push([x, n > 0 ? sum / n : y]);
  }
  return out;
}

/** Hours as `h:mm`, signed when `signed`: `+0:12`, `-1:05`. Rounded to the minute. */
export function hoursMinutes(hours: number, signed = false): string {
  const minutes = Math.round(Math.abs(hours) * 60);
  const text = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
  if (!signed || minutes === 0) return text;
  return `${hours < 0 ? "-" : "+"}${text}`;
}

/** One column of the hourly table; `before` is the same series in the run before. */
export interface Column {
  id: string;
  label: string;
  pts: readonly Pt[];
  before?: readonly Pt[];
}

/** One row of the hourly table: a whole hour and each column's value then (the last at or before it). */
export interface HourRow {
  hour: number;
  cells: (Decimal | undefined)[];
}

/**
 * One row per whole hour that has data: from the first hour any column has a value to the last hour any column has
 * been sampled at or past.
 */
export function hourlyRows(columns: readonly Column[]): HourRow[] {
  const firsts = columns.flatMap((c) => (c.pts[0] ? [c.pts[0][0]] : []));
  const lasts = columns.flatMap((c) => (c.pts.length ? [c.pts[c.pts.length - 1]?.[0] ?? 0] : []));
  if (firsts.length === 0) return [];
  const from = Math.ceil(Math.min(...firsts) - 1e-9) || 0;
  const to = Math.floor(Math.max(...lasts) + 1e-9);
  const rows: HourRow[] = [];
  for (let hour = from; hour <= to; hour++)
    rows.push({ hour, cells: columns.map((c) => valueAt(c.pts, hour)) });
  return rows;
}

/** One gate of the gates table, hours played. */
export interface GateRow {
  key: string;
  plannedH: number;
  /** The median of the seeds that opened it; undefined when none has. */
  openedH?: number;
  /** Opened minus planned, in hours: positive when it opened late. */
  driftH?: number;
  /** Seeds that opened it, of seeds that have gates. */
  opened: number;
  seeds: number;
  pinned: boolean;
  /** The gate's price as the latest run priced it, and what the fit would have priced it when it was pinned. */
  value?: string;
  fitValue?: string;
  /** Each opening, one per seed that opened it. */
  openings: number[];
}

/** The latest gates of each seed. */
export function latestGates(data: DeskData): Map<number, readonly FittedGate[]> {
  return new Map(seedNumbers(data).map((s) => [s, data.seeds.get(s)?.gates ?? []]));
}

/** The gates table: in plan order, the planned hour, the opened one (the median across seeds) and the drift. */
export function gateRows(data: DeskData): GateRow[] {
  const per = [...latestGates(data).values()].filter((g) => g.length > 0);
  const order: string[] = [];
  for (const gates of per) for (const g of gates) if (!order.includes(g.key)) order.push(g.key);
  return order.map((key) => {
    const found = per.flatMap((gates) => gates.filter((g) => g.key === key));
    const openings = found.flatMap((g) => (g.openedMs === undefined ? [] : [g.openedMs / HOUR_MS]));
    const plannedH = medianNumber(found.map((g) => g.atMs / HOUR_MS));
    const openedH = openings.length ? medianNumber(openings) : undefined;
    return {
      key,
      plannedH,
      openedH,
      driftH: openedH === undefined ? undefined : openedH - plannedH,
      opened: openings.length,
      seeds: per.length,
      pinned: found.some((g) => g.pinned !== undefined),
      value: found.find((g) => g.value !== undefined)?.value,
      fitValue: found.find((g) => g.fitValue !== undefined)?.fitValue,
      openings,
    };
  });
}

/** Two lines at one x, in the same units: the price and the balance that has to reach it. */
export interface GapPoint {
  x: number;
  /** The price line. */
  high: number;
  /** The balance line. */
  low: number;
}

/**
 * The shaded gaps between two lines drawn in the same units, where `high` is above `low` (a cost above its balance):
 * one polygon of `[x, y]` corners per stretch, split where the lines cross. Y is up, as the values are.
 */
export function gapPolygons(pts: readonly GapPoint[]): [number, number][][] {
  const out: [number, number][][] = [];
  let top: [number, number][] = [];
  let bottom: [number, number][] = [];
  const flush = (): void => {
    if (top.length > 1) out.push([...top, ...bottom.reverse()]);
    top = [];
    bottom = [];
  };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as GapPoint;
    const d = p.high - p.low;
    const prev = pts[i - 1];
    if (prev) {
      const dp = prev.high - prev.low;
      if (dp > 0 !== d > 0 && dp !== 0 && d !== 0) {
        // The lines cross between the two points.
        const t = dp / (dp - d);
        const x = prev.x + (p.x - prev.x) * t;
        const y = prev.high + (p.high - prev.high) * t;
        if (dp > 0) {
          top.push([x, y]);
          bottom.push([x, y]);
          flush();
        } else {
          flush();
          top.push([x, y]);
          bottom.push([x, y]);
        }
      }
    }
    if (d > 0) {
      if (top.length === 0 && prev && prev.high === prev.low) {
        top.push([prev.x, prev.high]);
        bottom.push([prev.x, prev.low]);
      }
      top.push([p.x, p.high]);
      bottom.push([p.x, p.low]);
    } else if (top.length > 0) {
      // The gap closes at this point.
      top.push([p.x, p.high]);
      bottom.push([p.x, p.low]);
      flush();
    }
  }
  flush();
  return out;
}

/** A y axis: its two ends and the ticks between, in the units the lines are drawn in (log10 or the plain value). */
export interface YAxis {
  lo: number;
  hi: number;
  ticks: number[];
}

/** The axis for some y values: whole powers of ten on a log axis; from zero to a round figure on a linear one. */
export function yAxis(ys: readonly number[], log: boolean): YAxis {
  // A loop, not `Math.min(...ys)`: every seed of every series is hundreds of thousands of values, past the stack.
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const y of ys) {
    if (!Number.isFinite(y)) continue;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  if (min > max) return { lo: 0, hi: 1, ticks: [0, 1] };
  if (log) {
    const lo = Math.floor(min);
    const hi = Math.max(Math.ceil(max), lo + 1);
    const step = Math.max(1, Math.ceil((hi - lo) / 8));
    const ticks: number[] = [];
    for (let t = lo; t <= hi; t += step) ticks.push(t);
    return { lo, hi: ticks[ticks.length - 1] ?? hi, ticks };
  }
  const lo = Math.min(0, min);
  const span = Math.max(max, lo + 1e-9) - lo;
  const raw = span / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  const first = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let i = 0; ticks.length < 2 || (ticks[ticks.length - 1] ?? 0) < max - step * 1e-9; i++)
    ticks.push(first + i * step);
  return { lo: first, hi: ticks[ticks.length - 1] ?? 1, ticks };
}

/** Round hour ticks from 0 to `end`, about ten at most. */
export function hourTicks(end: number): number[] {
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((s) => end / s <= 10) ?? 1000;
  const ticks: number[] = [];
  for (let h = 0; h <= end + 1e-9; h += step) ticks.push(h);
  return ticks;
}

/**
 * The difference of a value from the run before, in orders of magnitude (`log10(now) - log10(before)`); undefined when
 * either is not above zero, so the ratio means nothing.
 */
export function orders(now: Decimal | undefined, before: Decimal | undefined): number | undefined {
  if (!now || !before || !now.gt(0) || !before.gt(0)) return undefined;
  const d = log10(now) - log10(before);
  return Number.isFinite(d) ? d : undefined;
}

/** A difference in orders of magnitude, signed, two decimals: `+0.42`, `-1.05`, `+0.00`. */
export function signedOrders(d: number | undefined): string {
  if (d === undefined) return "–";
  const text = Math.abs(d).toFixed(2);
  return `${d < 0 && Number(text) !== 0 ? "-" : "+"}${text}`;
}

/** A series' value at an hour in the run before, only where that run was played: past its end there is no before. */
export function beforeAt(pts: readonly Pt[] | undefined, hours: number): Decimal | undefined {
  const last = pts?.[pts.length - 1];
  if (!pts || !last || hours > last[0] + 1e-9) return undefined;
  return valueAt(pts, hours);
}

/** A time in ms as a clock: `1:30` for a minute and a half, `1:00:00` for an hour, `0:00.25` below a whole second. */
export function clock(ms: number): string {
  if (!Number.isFinite(ms)) return String(ms);
  const sign = ms < 0 ? "-" : "";
  const abs = Math.abs(ms);
  const whole = Math.floor(abs / 1000);
  const frac = Math.round(abs - whole * 1000);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const tail = frac > 0 ? `.${String(frac).padStart(3, "0").replace(/0+$/, "")}` : "";
  const s = `${String(whole % 60).padStart(2, "0")}${tail}`;
  return h > 0 ? `${sign}${h}:${String(m).padStart(2, "0")}:${s}` : `${sign}${m}:${s}`;
}

/** A knob's value for reading: `ms` as a clock, `x` as `×1.15`, `%` (stored as a fraction) as `50%`, else the number. */
export function knobText(value: number, unit: unknown): string {
  const plain = String(Number(value.toPrecision(6)));
  if (unit === "ms") return clock(value);
  if (unit === "x") return `×${plain}`;
  if (unit === "%") return `${Number((value * 100).toPrecision(6))}%`;
  return plain;
}

/** A time typed as `m:ss` or `h:mm:ss` (seconds may carry a fraction), in ms; undefined when it is neither. */
export function parseClock(text: string): number | undefined {
  const t = text.trim();
  const mmss = /^(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(t);
  if (mmss) return Math.round((Number(mmss[1]) * 60 + Number(mmss[2])) * 1000);
  const hmmss = /^(\d+):([0-5]\d):([0-5]?\d(?:\.\d+)?)$/.exec(t);
  if (hmmss) return Math.round((Number(hmmss[1]) * 3600 + Number(hmmss[2]) * 60 + Number(hmmss[3])) * 1000);
  return undefined;
}

/** A time typed as `h:mm` or as plain (possibly fractional) hours, in ms; undefined when it is neither. */
export function parseHours(text: string): number | undefined {
  const t = text.trim();
  const clocked = /^(\d+):([0-5]\d)$/.exec(t);
  if (clocked) return (Number(clocked[1]) * 60 + Number(clocked[2])) * 60_000;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * HOUR_MS);
  return undefined;
}

/** A price typed as a figure Decimal reads (`150`, `1.5e12`): the text trimmed, or undefined when it is not one. */
export function parsePrice(text: string): string | undefined {
  const t = text.trim();
  if (!/^\d+(\.\d+)?(e[+-]?\d+)?$/i.test(t)) return undefined;
  return D(t).isNan() ? undefined : t;
}
