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
/** Folds contributions into a stat bus. */
export declare function busOf(contributions: readonly Contribution[]): StatBus;
/** Reads one stat's totals off a bus. */
export declare function statTotals(bus: StatBus, id: string): StatTotals;
/** The softcap's reduction of `value`, or `value` itself below its start. Monotonic and never above `value`. */
export declare function applySoftcap(value: number, cap: Softcap | undefined): number;
/** A stat's value: `(base + add) x mult`, softcapped, then hardcapped. */
export declare function statValue(bus: StatBus, id: string, base?: number, def?: StatDef): number;
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
export declare function explainStat(bus: StatBus, id: string, base?: number, def?: StatDef): StatBreakdown;
