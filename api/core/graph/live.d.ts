import { type Decimal, type DecimalSource } from "../decimal";
import type { Softcap, StatDef } from "./stats";
/**
 * The live stat graph: effects whose value is a function of state, worked out lazily in Decimals. Content is indexed
 * once (`liveIndex().add(source, meta)`), then `over(q)` gives a graph for one state that works each stat out the
 * first time it is read and keeps it for the graph's life, so make a new graph after the state changes. The order is
 * the bus's: (base + every add) x every mul, then the stat's softcap, then its hardcap. An effect's value may read
 * another stat through `q`; one that comes back to itself throws.
 */
/** What a source does to a stat: adds to its base or multiplies it, by a value read off the state `q`. */
export interface LiveEffect<S extends string, Q> {
    readonly stat: S;
    /** Adds to the base, or multiplies (`"mul"`, where the bus's `Effect` says `mult`). */
    readonly op: "add" | "mul";
    /** Called at most once per graph, with the state the graph is over. */
    readonly value: (q: Q) => DecimalSource;
    /** Counts like any other, and is marked `quiet` in `parts` for a screen that hides the small print. */
    readonly quiet?: boolean;
}
/** A piece of content as the index takes it: the effects it has and the flags it raises while it is active. */
export interface LiveSource<S extends string, F extends string, Q> {
    readonly effects?: readonly LiveEffect<S, Q>[];
    readonly flags?: readonly F[];
}
/**
 * Where a source comes from and when it counts. A source whose `group` is muted loses its effects, never its flags:
 * a flag it raises stays raised while it is `active`, so a source a game means to switch off whole reads the mute in
 * its own `active` too.
 */
export interface LiveMeta<Q, G extends string = string> {
    readonly label: string;
    readonly owner: string;
    readonly group?: G;
    readonly active: (q: Q) => boolean;
}
/** One counting effect of a stat, worked out: a row of its breakdown. */
export interface StatPart {
    readonly label: string;
    readonly owner: string;
    readonly op: "add" | "mul";
    readonly value: Decimal;
    readonly quiet: boolean;
}
/** A stat's base, summed adds, multiplier, raw and capped value, and every counting effect, in Decimals. */
export interface LiveBreakdown<S extends string> {
    stat: S;
    base: Decimal;
    /** The counting adds, summed (the base not included). */
    add: Decimal;
    /** The counting muls, multiplied. */
    mult: Decimal;
    /** Before the caps. */
    raw: Decimal;
    value: Decimal;
    /** The softcap's label while it is reducing the value. */
    softcapped: string | null;
    hardcapped: boolean;
    /** The counting effects, in the order their sources were added. */
    parts: StatPart[];
}
/** The stats and flags of one state. Each is worked out once, on first read. */
export interface StatGraph<S extends string, F extends string> {
    /** The stat's value, capped. */
    stat(id: S): Decimal;
    /** The counting effects on the stat, in the order their sources were added. */
    parts(id: S): StatPart[];
    /** Everything that makes the stat what it is. */
    explain(id: S): LiveBreakdown<S>;
    /** Whether any active source raises the flag. */
    flag(id: F): boolean;
}
/**
 * A live index's stat bases (default: 1 for every stat, where the bus's `statValue` defaults to 0) and caps per stat.
 */
export interface LiveIndexOptions<S extends string> {
    base?: (stat: S) => DecimalSource;
    caps?: Partial<Record<S, StatDef>>;
}
/** Content indexed by stat and flag, ready to be read over any state. */
export interface LiveIndex<S extends string, F extends string, Q, G extends string = string> {
    /** Indexes every effect and flag of the source under its meta. Graphs already made do not see it. */
    add(source: LiveSource<S, F, Q>, meta: LiveMeta<Q, G>): void;
    /**
     * A graph over one state; `muted` silences the effects of a group. Never its flags: `flag` still reads a muted
     * group's sources as raised, so a mute meant to switch a source off whole goes in its `active` as well.
     */
    over(q: Q, options?: {
        muted?: (group: G) => boolean;
    }): StatGraph<S, F>;
}
/** The softcap's reduction of `value` in Decimals, or `value` itself below its start: `applySoftcap` past 1e308. */
export declare function softcapDecimal(value: Decimal, cap: Softcap | undefined): Decimal;
/** An empty live index. Add content to it once, then read it over each state with `over`. */
export declare function liveIndex<S extends string, F extends string, Q, G extends string = string>(options?: LiveIndexOptions<S>): LiveIndex<S, F, Q, G>;
