/**
 * The stat bus. Every number a tree, a card or a purchase changes is a named stat, and every change to it is an
 * effect: an amount added to its base, or a multiplier. One order everywhere: (base + every add) x every mult, then
 * the stat's softcap, then its hardcap. A game names its stats and their caps in its own file; `explainStat` says
 * what feeds any of them.
 */

export interface Softcap {
  /** The value past which gains are reduced. */
  start: number;
  /** Below one. Past `start` the value is `value^power x start^(1 - power)`, The Modding Tree's softcap. */
  power: number;
  /** The line the player reads where the softcap bites, in the voice of the stat's world. */
  label: string;
}

/** How a stat is capped: an optional softcap and hardcap. */
export interface StatDef {
  softcap?: Softcap;
  hardcap?: number;
}

/** What a node does to a stat: add or multiply. */
export interface Effect {
  stat: string;
  add?: number;
  mult?: number;
}

/** An effect and where it came from: a node, a card, a purchase. The breakdown lists these. */
export interface Contribution {
  source: string;
  effect: Effect;
}

/** A stat's summed additions and multipliers. */
export interface StatTotals {
  add: number;
  mult: number;
}

/** The folded contributions: totals per stat and the contributions themselves. */
export interface StatBus {
  totals: ReadonlyMap<string, StatTotals>;
  contributions: readonly Contribution[];
}

const NONE: StatTotals = { add: 0, mult: 1 };

/** Folds contributions into a stat bus. */
export function busOf(contributions: readonly Contribution[]): StatBus {
  const totals = new Map<string, StatTotals>();
  for (const { effect } of contributions) {
    const t = totals.get(effect.stat) ?? { add: 0, mult: 1 };
    if (effect.add !== undefined) t.add += effect.add;
    if (effect.mult !== undefined) t.mult *= effect.mult;
    totals.set(effect.stat, t);
  }
  return { totals, contributions };
}

/** Reads one stat's totals off a bus. */
export function statTotals(bus: StatBus, id: string): StatTotals {
  return bus.totals.get(id) ?? NONE;
}

/** The softcap's reduction of `value`, or `value` itself below its start. Monotonic and never above `value`. */
export function applySoftcap(value: number, cap: Softcap | undefined): number {
  if (!cap || !(value > cap.start) || !(cap.start > 0)) return value;
  return value ** cap.power * cap.start ** (1 - cap.power);
}

/** A stat's value: `(base + add) x mult`, softcapped, then hardcapped. */
export function statValue(bus: StatBus, id: string, base = 0, def: StatDef = {}): number {
  const t = statTotals(bus, id);
  const capped = applySoftcap((base + t.add) * t.mult, def.softcap);
  return def.hardcap === undefined ? capped : Math.min(def.hardcap, capped);
}

/** A stat's base, additions, multiplier, raw and capped value, for a breakdown view. */
export interface StatBreakdown {
  stat: string;
  base: number;
  add: number;
  mult: number;
  /** Before the caps. */
  raw: number;
  value: number;
  /** The softcap's label while it is reducing the value. */
  softcapped: string | null;
  hardcapped: boolean;
  /** Every contribution to this stat, in the order it was collected. */
  sources: Contribution[];
}

/** Everything that feeds a stat and what it comes to: the tree lines and the "fed by" lots are built from this. */
export function explainStat(bus: StatBus, id: string, base = 0, def: StatDef = {}): StatBreakdown {
  const t = statTotals(bus, id);
  const raw = (base + t.add) * t.mult;
  const soft = applySoftcap(raw, def.softcap);
  const value = def.hardcap === undefined ? soft : Math.min(def.hardcap, soft);
  return {
    stat: id,
    base,
    add: t.add,
    mult: t.mult,
    raw,
    value,
    softcapped: def.softcap && soft < raw ? def.softcap.label : null,
    hardcapped: def.hardcap !== undefined && soft > def.hardcap,
    sources: bus.contributions.filter((c) => c.effect.stat === id),
  };
}
