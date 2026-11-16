import type { Decimal, DecimalSource } from "./decimal";
import { type Feature, type NeedsOf, type ReachOf, type ReachShape } from "./feature";
import { type Effect, type ExtraEffect, type SourceMeta, type StatBreakdown, type StatCaps, type StatIndex, type StatPart, type StatSource } from "./graph/stats";
import type { AnyVocab, StatOf } from "./vocab";
/**
 * The stats feature: the home of a game's stat graph. It is told every stat's base once, takes the game's sources
 * (what raises a stat, and when), and serves each stat as a derived value under its own id: `s.stats.heat` is a
 * Decimal, current wherever it is read, worked out again only when something it read has changed, and never saved.
 * A stat whose effect reads another stat (`q.stats.heat`) is ordered after it; two that read each other throw,
 * naming the loop. The breakdown behind a number (`select.explain`) is worked out when asked for.
 */
/** A stat as the feature is told it: its base, said once, and its caps. */
export interface StatDef extends StatCaps {
    /** What the stat is before any effect: 1 for a multiplier, 0 for a sum. There is no default. */
    readonly base: DecimalSource;
}
/** A source as a game declares it: where it comes from, when and how many times it counts, and what it does. */
export interface StatSourceDef<S extends string, F extends string, Q, G extends string = string> extends StatSource<S, F, Q>, SourceMeta<Q, G> {
}
/**
 * An effect with the id of what gives it, as the factories' `contributions` hand them over (`<owner>:<id>`): a
 * rank of a node, an earned achievement, a running buff. The same effect given several times by one source (one
 * per rank held) is one row of the breakdown, counted that many times.
 */
export interface Contribution<S extends string = string, Q = unknown> {
    readonly source: string;
    readonly effect: Effect<S, Q>;
    /** How many times over it counts (default 1): the copies owned, said once and not listed one by one. */
    readonly times?: number;
}
/** The names a stat cannot take: the feature's own derived values beside the stats. */
export declare const RESERVED_STAT_IDS: readonly string[];
/** The feature's slice: every stat under its id, the flags, and the contributions folded by stat. */
export type StatsValues<S extends string, F extends string> = {
    readonly [P in S]: Decimal;
} & {
    /** Whether any counting source raises each declared flag. */
    readonly flags: Readonly<Record<F, boolean>>;
    /** The state's contributions, by stat: what the stats read. Not for a game to read. */
    readonly feed: Readonly<Record<string, readonly ExtraEffect<S, never>[]>>;
};
/** The read side of a stats feature. */
export interface StatsSelect<K extends string, S extends string, F extends string> {
    /** The stat's value, capped: `state[key][id]`. */
    value(state: Record<K, {
        readonly [P in S]: Decimal;
    }>, id: S): Decimal;
    /** Whether any counting source raises the flag. */
    flag(state: Record<K, {
        readonly flags: Readonly<Record<F, boolean>>;
    }>, id: F): boolean;
    /** Everything that makes the stat what it is: base, adds, multiplier, caps and a row per effect. */
    explain(state: object, id: S): StatBreakdown<S>;
    /** The rows alone, muted ones marked. */
    parts(state: object, id: S): StatPart[];
}
/** A stats feature: the feature, `select` to read it, and `def` with the stats and the index it folds. */
export type StatsFeature<K extends string, S extends string, F extends string, Q, G extends string, N> = Feature<K, Record<never, never>, Record<never, never>, N, StatsValues<S, F>> & {
    readonly select: StatsSelect<K, S, F>;
    readonly def: {
        readonly stats: Readonly<Record<S, StatDef>>;
        readonly flags: readonly F[];
        /** The declared sources, indexed: for a tool that lists what feeds a stat. */
        readonly index: StatIndex<S, F, Q, G>;
    };
    readonly draft: Record<never, never>;
};
/**
 * Declares the stats feature over a vocabulary's stats. `stats` gives every stat its base and caps; `sources` are
 * what raises them, read off the state the feature reaches; `contributions` hands over what the game's other
 * features list for the state as it stands (a tree's ranks, the running buffs). `muted` silences a group's effects
 * (true, or the reason as a string): its rows stay in the breakdown, marked, and stop counting. Throws at
 * definition on a stat named in `RESERVED_STAT_IDS`.
 */
export declare function defineStats<const K extends string, V extends AnyVocab, const F extends string = never, const R extends ReachShape = readonly [], G extends string = string>(def: {
    /** The key the stats are read under: `s.<key>.<stat>`. Nothing is saved there. */
    readonly key: K;
    readonly vocab: V;
    /** The features the sources read, as `feature`'s `reach`. */
    readonly reach?: R | (() => R);
    readonly stats: {
        readonly [P in StatOf<V>]: StatDef;
    };
    /** The flags a source may raise, each served under `s.<key>.flags`. */
    readonly flags?: readonly F[];
    readonly sources?: readonly StatSourceDef<StatOf<V>, F, ReachOf<R> & Record<K, {
        readonly [P in StatOf<V>]: Decimal;
    }>, G>[];
    readonly contributions?: (state: ReachOf<R>) => readonly Contribution<StatOf<V>, ReachOf<R> & Record<K, {
        readonly [P in StatOf<V>]: Decimal;
    }>>[];
    /** A contribution's label in the breakdown, from its source id (default: the id). */
    readonly label?: (source: string) => string;
    readonly muted?: (state: ReachOf<R>, group: G) => boolean | string;
}): StatsFeature<K, StatOf<V>, F, ReachOf<R> & Record<K, {
    readonly [P in StatOf<V>]: Decimal;
}>, G, NeedsOf<R>>;
