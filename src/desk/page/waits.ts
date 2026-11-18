// The waits between upgrades, read from a seed's samples: when each buyable was bought, the dry spells between
// purchases, and how they spread over keys and windows. Pure: no React. A wait is only as fine as the sample step.
import type { DeskData, Sample } from "./series";

export interface Purchase {
  hours: number;
  key: string;
}

export interface DrySpell {
  from: number;
  to: number;
  hours: number;
  /** The keys bought at `to`; empty for the trailing gap that runs out the run. */
  endedBy: string[];
}

export interface KeyWaits {
  key: string;
  bought: number;
  firstHours: number;
  medianWait: number | undefined;
  longestWait: number | undefined;
}

export interface WindowWaits {
  from: number;
  to: number;
  longest: number;
  median: number;
  buys: number;
}

const medianOf = (xs: readonly number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
};

/** One event per key per consecutive pair of samples where its next cost changed, appeared or disappeared. */
export function purchases(samples: readonly Sample[]): Purchase[] {
  const out: Purchase[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = (samples[i - 1] as Sample).next;
    const b = (samples[i] as Sample).next;
    const hours = (samples[i] as Sample).hours;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const x = a[key];
      const y = b[key];
      if (!x || !y || !x.cost.eq(y.cost)) out.push({ hours, key });
    }
  }
  return out;
}

/** The median gap between consecutive samples' hours. */
export function sampleStepHours(samples: readonly Sample[]): number {
  if (samples.length < 2) return 0;
  return medianOf(samples.slice(1).map((s, i) => s.hours - (samples[i] as Sample).hours));
}

/** The gaps between consecutive distinct purchase times (and from the start, and out to the end), longest first. */
export function drySpells(samples: readonly Sample[], endHours: number): DrySpell[] {
  const first = samples[0];
  if (!first) return [];
  const byTime = new Map<number, string[]>();
  for (const p of purchases(samples)) byTime.set(p.hours, [...(byTime.get(p.hours) ?? []), p.key]);
  const out: DrySpell[] = [];
  let at = first.hours;
  for (const to of [...byTime.keys()].sort((a, b) => a - b)) {
    out.push({ from: at, to, hours: to - at, endedBy: byTime.get(to) as string[] });
    at = to;
  }
  if (endHours > at) out.push({ from: at, to: endHours, hours: endHours - at, endedBy: [] });
  return out.sort((a, b) => b.hours - a.hours || a.from - b.from);
}

/** Per key: how many were bought, when the first was, and the median and longest gap between its purchases. */
export function perKey(samples: readonly Sample[]): KeyWaits[] {
  const times = new Map<string, number[]>();
  for (const p of purchases(samples)) times.set(p.key, [...(times.get(p.key) ?? []), p.hours]);
  const rows = [...times].map(([key, ts]): KeyWaits => {
    const gaps = ts.slice(1).map((t, i) => t - (ts[i] as number));
    return {
      key,
      bought: ts.length,
      firstHours: ts[0] as number,
      medianWait: gaps.length > 0 ? medianOf(gaps) : undefined,
      longestWait: gaps.length > 0 ? Math.max(...gaps) : undefined,
    };
  });
  return rows.sort((a, b) => {
    if (a.longestWait === undefined || b.longestWait === undefined)
      return a.longestWait === b.longestWait
        ? a.key.localeCompare(b.key)
        : a.longestWait === undefined
          ? 1
          : -1;
    return b.longestWait - a.longestWait || a.key.localeCompare(b.key);
  });
}

/** Per window `[i*w, (i+1)*w)` up to the end: the longest and median dry spell ending in it, and the purchases in it. */
export function perWindow(samples: readonly Sample[], windowHours: number, endHours: number): WindowWaits[] {
  if (!(windowHours > 0) || !(endHours > 0)) return [];
  const spells = drySpells(samples, endHours);
  const buys = purchases(samples);
  const out: WindowWaits[] = [];
  for (let i = 0; i * windowHours < endHours; i++) {
    const from = i * windowHours;
    const to = (i + 1) * windowHours;
    const inside = spells.filter((s) => s.to >= from && s.to < to).map((s) => s.hours);
    out.push({
      from,
      to,
      longest: inside.length > 0 ? Math.max(...inside) : 0,
      median: medianOf(inside),
      buys: buys.filter((p) => p.hours >= from && p.hours < to).length,
    });
  }
  return out;
}

export interface WaitStats {
  seed: number;
  step: number;
  spells: DrySpell[];
  keys: KeyWaits[];
  windows: WindowWaits[];
}

/** The waits of the median seed: the one whose longest dry spell is the median across seeds (the lower, if even). */
export function waitStats(data: DeskData, windowHours: number, endHours: number): WaitStats | undefined {
  const all = [...data.seeds]
    .map(([seed, d]) => ({ seed, samples: d.samples, spells: drySpells(d.samples, endHours) }))
    .filter((s) => s.samples.length > 0)
    .sort((a, b) => (a.spells[0]?.hours ?? 0) - (b.spells[0]?.hours ?? 0) || a.seed - b.seed);
  const pick = all[(all.length - 1) >> 1];
  if (!pick) return undefined;
  return {
    seed: pick.seed,
    step: sampleStepHours(pick.samples),
    spells: pick.spells.slice(0, 5),
    keys: perKey(pick.samples),
    windows: perWindow(pick.samples, windowHours, endHours),
  };
}
