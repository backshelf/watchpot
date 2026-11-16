import { D, Decimal, type DecimalSource } from "./decimal";

/**
 * Number formatting per decisions.md:
 * - below 100,000: plain with thousands separators ("12,480")
 * - from 100,000: two decimals and a suffix K M B T Qa Qi Sx Sp Oc No Dc ("1.52M")
 * - from 1e36 (past the last suffix): scientific ("1.00e36")
 * Mantissas are floored, never rounded up: nothing is rounded away from the player.
 *
 * Which one a call site uses (economy-midgame): `fmtFull` for headline numbers, which are power, balances (the
 * header pills and wallet numbers) and reward payouts, so a big number reads in full ("1,000,000,000"). `fmt` for
 * costs, rates and small supporting numbers, where the suffix keeps a line short.
 */
export const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"] as const;
/** Below this value `fmt` prints plain digits with separators. */
export const PLAIN_BELOW = 100_000;
/** From this power of ten `fmt` switches to scientific notation. */
export const SCIENTIFIC_FROM_EXPONENT = 36;

/** A formatted number: the mantissa, its suffix, the full text and the sign. */
export interface Formatted {
  /** The number in front of the suffix, already floored to the shown precision. A ticker animates this. */
  mantissa: number;
  /** "", "K".."Dc", or "e36" in the scientific range. */
  suffix: string;
  /** The full string, sign included. */
  text: string;
  negative: boolean;
}

/**
 * The notations, for a settings screen: `suffix` (the default: K to Dc, then scientific), `scientific` (`1.23e45`),
 * `engineering` (an exponent that is a multiple of 3, three figures: `12.3e6`), `letters` (a per thousand, then b, …
 * z, aa, ab …: `1.52b`) and `logarithm` (the exponent alone, two decimals: `e12.34`). Every one prints plain digits
 * below its plain range, and infinity as `∞`.
 */
export const NOTATIONS = ["suffix", "scientific", "engineering", "letters", "logarithm"] as const;
/** One of `NOTATIONS`. */
export type Notation = (typeof NOTATIONS)[number];

/** Options for `fmt`: the decimals shown in the plain range. */
export interface FmtOptions {
  /** Decimals to show in the plain range (default 0). Rates under 1,000 read better with one. */
  decimals?: number;
  /** "suffix" (default) walks K..Dc; the others print plain digits, then their own form from `plainBelow`. */
  notation?: Notation;
  /** Where plain digits end in every notation but `suffix` (default `PLAIN_BELOW`). */
  plainBelow?: number;
  /** `decimals` applies only to values under this (default: the whole plain range). */
  decimalsBelow?: number;
}

const groupDigits = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Floor to `places` decimals after killing float noise (2.4999999999 -> 2.50, not 2.49). */
function floorTo(value: number, places: number): number {
  const scale = 10 ** places;
  const denoised = Number(value.toPrecision(12));
  return Math.floor(denoised * scale + 1e-9) / scale;
}

/** Formats a number for display: plain digits, then `K` to `Dc` suffixes, then scientific. */
export function fmt(value: DecimalSource, options: FmtOptions = {}): Formatted {
  const d = D(value);
  if (d.isNan()) return { mantissa: 0, suffix: "", text: "0", negative: false };
  if (!d.isFinite()) {
    const negative = d.sign < 0;
    return { mantissa: Number.POSITIVE_INFINITY, suffix: "", text: negative ? "-∞" : "∞", negative };
  }
  const negative = d.lt(0);
  const abs = d.abs();
  const sign = negative ? "-" : "";

  const notation = options.notation ?? "suffix";
  const plainBelow = notation === "suffix" ? PLAIN_BELOW : (options.plainBelow ?? PLAIN_BELOW);
  if (abs.lt(plainBelow)) {
    const wanted = abs.lt(options.decimalsBelow ?? Number.POSITIVE_INFINITY) ? (options.decimals ?? 0) : 0;
    const places = Math.max(0, Math.min(6, wanted));
    const mantissa = floorTo(abs.toNumber(), places);
    const [whole = "0", frac] = mantissa.toFixed(places).split(".");
    const text = sign + groupDigits(whole) + (frac ? `.${frac}` : "");
    return { mantissa: negative ? -mantissa : mantissa, suffix: "", text, negative };
  }
  if (notation === "engineering" || notation === "letters" || notation === "logarithm")
    return beyondPlain(abs, negative, notation);

  const exponent = Math.floor(abs.log10().toNumber() + 1e-12);
  if (options.notation === "scientific" || exponent >= SCIENTIFIC_FROM_EXPONENT) {
    let e = exponent;
    let m = floorTo(abs.div(Decimal.pow(10, e)).toNumber(), 2);
    if (m >= 10) {
      e += 1;
      m = 1;
    }
    const suffix = `e${options.notation === "scientific" && e >= 1000 ? groupDigits(String(e)) : e}`;
    return { mantissa: negative ? -m : m, suffix, text: `${sign}${m.toFixed(2)}${suffix}`, negative };
  }

  let group = Math.floor(exponent / 3);
  let m = floorTo(abs.div(Decimal.pow(10, group * 3)).toNumber(), 2);
  if (m >= 1000) {
    group += 1;
    m = 1;
  }
  const suffix = SUFFIXES[group] ?? `e${group * 3}`;
  return { mantissa: negative ? -m : m, suffix, text: `${sign}${m.toFixed(2)}${suffix}`, negative };
}

/** The exponent from which the three newer notations print the logarithm in scientific: `e1.23e15`. */
const HUGE_EXPONENT = 1e15;

/** The letters of group `n` (1 is "a"): bijective base 26, so z is followed by aa. */
export function letterSuffix(n: number): string {
  let out = "";
  for (let k = Math.floor(n); k > 0; k = Math.floor((k - 1) / 26))
    out = String.fromCharCode(97 + ((k - 1) % 26)) + out;
  return out;
}

/** An exponent as text: grouped from 1,000. */
const exponentText = (e: number): string => (e >= 1000 ? groupDigits(String(e)) : String(e));

/** The engineering, letters and logarithm forms of a value past the plain range. */
function beyondPlain(
  abs: Decimal,
  negative: boolean,
  notation: "engineering" | "letters" | "logarithm",
): Formatted {
  const sign = negative ? "-" : "";
  const log = abs.log10();
  const out = (mantissa: number, suffix: string, text: string): Formatted => ({
    mantissa: negative ? -mantissa : mantissa,
    suffix,
    text: sign + text,
    negative,
  });
  if (!(log.toNumber() < HUGE_EXPONENT)) {
    // Too large for a whole exponent: the logarithm itself, in scientific.
    const inner = fmt(log, { notation: "scientific" });
    return out(inner.mantissa, `e${inner.suffix}`, `e${inner.text}`);
  }
  const l = log.toNumber();
  if (notation === "logarithm") {
    const m = floorTo(l, 2);
    const [whole = "0", frac = "00"] = m.toFixed(2).split(".");
    return out(m, "", `e${groupDigits(whole)}.${frac}`);
  }
  let group = Math.floor(Math.floor(l + 1e-12) / 3);
  const scaled = (g: number) => abs.div(Decimal.pow(10, g * 3)).toNumber();
  if (notation === "letters") {
    let m = floorTo(scaled(group), 2);
    if (m >= 1000) {
      group += 1;
      m = 1;
    }
    const suffix = letterSuffix(group);
    return out(m, suffix, `${m.toFixed(2)}${suffix}`);
  }
  // Engineering: three figures, so the decimals shrink as the mantissa grows.
  const placesFor = (v: number) => (v >= 100 ? 0 : v >= 10 ? 1 : 2);
  let raw = scaled(group);
  let m = floorTo(raw, placesFor(raw));
  if (m >= 1000) {
    group += 1;
    raw = scaled(group);
    m = floorTo(raw, placesFor(raw));
  }
  const suffix = `e${exponentText(group * 3)}`;
  return out(m, suffix, `${m.toFixed(placesFor(m))}${suffix}`);
}

/** Full digits with separators, never a suffix: 12345678.9 -> "12,345,678". Floors toward zero. */
export function fmtFull(value: DecimalSource): string {
  const d = D(value);
  if (d.isNan()) return "0";
  if (!d.isFinite()) return d.sign < 0 ? "-∞" : "∞";
  const negative = d.lt(0);
  const whole = d.abs().floor().toFixed(0);
  return (negative && whole !== "0" ? "-" : "") + groupDigits(whole);
}

const twoOrNone = (d: Decimal): number => (d.abs().lt(100) ? 2 : 0);
const oneOrNone = (d: Decimal): number => (d.abs().lt(100) ? 1 : 0);

/** A multiplier: two decimals below 100, none from there: "×3.20", "×1.23e45". */
export function fmtTimes(value: DecimalSource, options: FmtOptions = {}): string {
  const d = D(value);
  return `×${fmt(d, { ...options, decimals: twoOrNone(d), decimalsBelow: undefined }).text}`;
}

/** An addition to a base, two decimals: "+0.50". A negative value keeps its own sign. */
export function fmtPlus(value: DecimalSource, options: FmtOptions = {}): string {
  const d = D(value);
  const text = fmt(d, { ...options, decimals: 2, decimalsBelow: undefined }).text;
  return d.lt(0) ? text : `+${text}`;
}

/** A rate per second, one decimal below 100: "12.5/s". */
export function fmtRate(value: DecimalSource, options: FmtOptions = {}): string {
  const d = D(value);
  return `${fmt(d, { ...options, decimals: oneOrNone(d), decimalsBelow: undefined }).text}/s`;
}

/** A count with its word, the singular exactly at 1: "1 gem", "2 gems". */
export function fmtCounted(
  value: DecimalSource,
  words: readonly [one: string, many: string],
  options: FmtOptions = {},
): string {
  return `${fmt(value, options).text} ${D(value).eq(1) ? words[0] : words[1]}`;
}

/** Time played: "4h 25m" from an hour, "12m 03s" under. Negative reads as zero. */
export function fmtPlayed(ms: number): string {
  const s = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

/** The printers bound to one set of options. */
export interface Formatter {
  /** A number; `decimals` overrides the options' for this call. */
  num(value: DecimalSource, decimals?: number): string;
  times(value: DecimalSource): string;
  plus(value: DecimalSource): string;
  rate(value: DecimalSource): string;
  counted(value: DecimalSource, words: readonly [one: string, many: string]): string;
}

/** Binds `num` and the four printers to one set of options, so a game sets its notation once. */
export function formatter(options: FmtOptions = {}): Formatter {
  return {
    num: (value, decimals) => fmt(value, decimals === undefined ? options : { ...options, decimals }).text,
    times: (value) => fmtTimes(value, options),
    plus: (value) => fmtPlus(value, options),
    rate: (value) => fmtRate(value, options),
    counted: (value, words) => fmtCounted(value, words, options),
  };
}

/** Real money: integer cents to "$1,204.17", never abbreviated. Negative cents read "-$0.14". */
export function fmtCents(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  const abs = Math.abs(safe);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${safe < 0 ? "-" : ""}$${groupDigits(String(dollars))}.${String(rest).padStart(2, "0")}`;
}

/** Countdown "hh:mm:ss"; hours grow past 99 when they must. Negative spans read as zero. */
export function fmtTimer(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(h)}:${two(m)}:${two(s)}`;
}

/**
 * A wait in words, rounded up to the minute so it never reads shorter than it is, then its two largest units:
 * "2d 4h", "1h 52m", "12m", "under a minute". Zero or less is "now", or `zero` where the wait is a length and not
 * a time until something ("+0m" for a perk that adds nothing); infinite or NaN is "never".
 */
export function fmtWait(ms: number, options: { zero?: string } = {}): string {
  if (Number.isNaN(ms) || ms === Number.POSITIVE_INFINITY) return "never";
  if (ms <= 0) return options.zero ?? "now";
  const minutes = Math.ceil(ms / 60_000);
  if (ms < 60_000) return "under a minute";
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** Odds: up to two decimals, trailing zeros trimmed: "70%", "4.5%", "0.25%". */
export function fmtPercent(percent: number): string {
  const p = Number.isFinite(percent) ? percent : 0;
  const text = (Math.round(p * 100) / 100).toFixed(2).replace(/\.?0+$/, "");
  return `${text}%`;
}

/** A bonus to one decimal, signed: "+4.4%". */
export function bonusPercent(value: number): string {
  return `+${fmtPercent(Math.round(Math.max(0, value) * 10) / 10)}`;
}

/** A plain count with separators: "12,480". Same as fmt(...).text without the suffix range, for ids and tallies. */
export function fmtCount(n: number): string {
  return groupDigits(String(Math.max(0, Math.floor(Number.isFinite(n) ? n : 0))));
}
