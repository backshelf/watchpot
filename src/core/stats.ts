import type { Decimal, DecimalSource } from "./decimal";
import { type Feature, feature, type NeedsOf, type ReachOf, type ReachShape } from "./feature";
import {
  type Effect,
  type ExtraEffect,
  type SourceMeta,
  type StatBreakdown,
  type StatCaps,
  type StatIndex,
  type StatPart,
  type StatSource,
  statIndex,
} from "./graph/stats";
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
export interface StatSourceDef<S extends string, F extends string, Q, G extends string = string>
  extends StatSource<S, F, Q>,
    SourceMeta<Q, G> {}

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
export const RESERVED_STAT_IDS: readonly string[] = ["flags", "feed"];

/** The feature's slice: every stat under its id, the flags, and the contributions folded by stat. */
export type StatsValues<S extends string, F extends string> = { readonly [P in S]: Decimal } & {
  /** Whether any counting source raises each declared flag. */
  readonly flags: Readonly<Record<F, boolean>>;
  /** The state's contributions, by stat: what the stats read. Not for a game to read. */
  readonly feed: Readonly<Record<string, readonly ExtraEffect<S, never>[]>>;
};

/** The read side of a stats feature. */
export interface StatsSelect<K extends string, S extends string, F extends string> {
  /** The stat's value, capped: `state[key][id]`. */
  value(state: Record<K, { readonly [P in S]: Decimal }>, id: S): Decimal;
  /** Whether any counting source raises the flag. */
  flag(state: Record<K, { readonly flags: Readonly<Record<F, boolean>> }>, id: F): boolean;
  /** Everything that makes the stat what it is: base, adds, multiplier, caps and a row per effect. */
  explain(state: object, id: S): StatBreakdown<S>;
  /** The rows alone, muted ones marked. */
  parts(state: object, id: S): StatPart[];
}

/** A stats feature: the feature, `select` to read it, and `def` with the stats and the index it folds. */
export type StatsFeature<
  K extends string,
  S extends string,
  F extends string,
  Q,
  G extends string,
  N,
> = Feature<K, Record<never, never>, Record<never, never>, N, StatsValues<S, F>> & {
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
export function stats<
  const K extends string,
  V extends AnyVocab,
  const F extends string = never,
  const R extends ReachShape = readonly [],
  G extends string = string,
>(def: {
  /** The key the stats are read under: `s.<key>.<stat>`. Nothing is saved there. */
  readonly key: K;
  readonly vocab: V;
  /** The features the sources read, as `feature`'s `reach`. */
  readonly reach?: R | (() => R);
  readonly stats: { readonly [P in StatOf<V>]: StatDef };
  /** The flags a source may raise, each served under `s.<key>.flags`. */
  readonly flags?: readonly F[];
  readonly sources?: readonly StatSourceDef<
    StatOf<V>,
    F,
    ReachOf<R> & Record<K, { readonly [P in StatOf<V>]: Decimal }>,
    G
  >[];
  readonly contributions?: (
    state: ReachOf<R>,
  ) => readonly Contribution<StatOf<V>, ReachOf<R> & Record<K, { readonly [P in StatOf<V>]: Decimal }>>[];
  /** A contribution's label in the breakdown, from its source id (default: the id). */
  readonly label?: (source: string) => string;
  readonly muted?: (state: ReachOf<R>, group: G) => boolean | string;
}): StatsFeature<
  K,
  StatOf<V>,
  F,
  ReachOf<R> & Record<K, { readonly [P in StatOf<V>]: Decimal }>,
  G,
  NeedsOf<R>
> {
  type S = StatOf<V>;
  type Q = ReachOf<R> & Record<K, { readonly [P in S]: Decimal }>;
  const ids = Object.keys(def.stats) as S[];
  for (const id of ids)
    if (RESERVED_STAT_IDS.includes(id))
      throw new Error(
        `stats "${def.key}": a stat cannot be named "${id}" (reserved: ${RESERVED_STAT_IDS.join(", ")})`,
      );
  const declared = def.stats as Readonly<Record<S, StatDef>>;
  const flags = def.flags ?? [];
  const index = statIndex<S, F, Q, G>({ base: (stat) => declared[stat].base, caps: declared });
  for (const { effects, flags: raised, ...meta } of def.sources ?? [])
    index.add({ effects, flags: raised }, meta);

  type Fed = Readonly<Record<string, readonly ExtraEffect<S, Q, G>[]>>;
  const EMPTY: Fed = {};
  /** What a source id comes to in a breakdown (its label and owner), worked out once per id. */
  const named = new Map<string, { label: string; owner: string }>();
  const nameOf = (source: string) => {
    let hit = named.get(source);
    if (!hit) {
      hit = { label: def.label?.(source) ?? source, owner: source.split(":")[0] ?? source };
      named.set(source, hit);
    }
    return hit;
  };
  /** The last feed made and what it was made from: handed back when the contributions come to the same. */
  let last: { rows: readonly { source: string; effect: Effect<S, Q>; times: number }[]; fed: Fed } | null =
    null;
  /**
   * The state's contributions by stat, the same effect from the same source counted as one row. It runs on every
   * pass of a sim, so it is one walk with no lookups for the usual case (a source's ranks listed one after
   * another), and hands back the feed it made last time when nothing in it differs, which leaves the stats alone.
   */
  const feed = (q: Q): Fed => {
    if (!def.contributions) return EMPTY;
    const rows: { source: string; effect: Effect<S, Q>; times: number }[] = [];
    let seen: Map<string, Map<Effect<S, Q>, { times: number }>> | null = null;
    let row: { source: string; effect: Effect<S, Q>; times: number } | undefined;
    for (const { source, effect, times = 1 } of def.contributions(q)) {
      if (!(times > 0)) continue;
      if (row && row.source === source && row.effect === effect) {
        row.times += times;
        continue;
      }
      // Not next to its like: look it up among the rows so far.
      if (!seen) {
        seen = new Map();
        for (const r of rows) seen.set(r.source, (seen.get(r.source) ?? new Map()).set(r.effect, r));
      }
      const bySource = seen.get(source) ?? new Map<Effect<S, Q>, { times: number }>();
      seen.set(source, bySource);
      const held = bySource.get(effect);
      if (held) {
        held.times += times;
        row = undefined;
        continue;
      }
      row = { source, effect, times };
      bySource.set(effect, row);
      rows.push(row);
    }
    const was = last;
    if (
      was &&
      was.rows.length === rows.length &&
      rows.every((r, i) => {
        const w = was.rows[i];
        return w !== undefined && w.source === r.source && w.effect === r.effect && w.times === r.times;
      })
    )
      return was.fed;
    const fed: Record<string, ExtraEffect<S, Q, G>[]> = {};
    for (const r of rows) {
      const { label, owner } = nameOf(r.source);
      const times = r.times;
      const list = fed[r.effect.stat] ?? [];
      fed[r.effect.stat] = list;
      list.push({ effect: r.effect, meta: { label, owner, group: owner as G, times: () => times } });
    }
    last = { rows, fed };
    return fed;
  };

  const self = (q: object) => (q as Record<K, StatsValues<S, F>>)[def.key];
  const graph = (q: Q) =>
    index.over(q, {
      muted: def.muted ? (group) => def.muted?.(q, group) ?? false : undefined,
      extra: (stat) => (self(q).feed as unknown as Fed)[stat] ?? [],
    });

  const derived: Record<string, (q: Q) => unknown> = {
    feed,
    flags: (q) => {
      const g = graph(q);
      return Object.fromEntries(flags.map((f) => [f, g.flag(f)]));
    },
  };
  for (const id of ids) derived[id] = (q) => graph(q).stat(id);

  const made = feature<
    K,
    Record<never, never>,
    Record<never, never>,
    ReachShape,
    StatsValues<S, F>,
    Q & object
  >({
    key: def.key,
    reach: def.reach,
    initial: () => ({}),
    reset: "never",
    // Built by stat id; the mapped type cannot be written key by key.
    derived: derived as never,
  });

  const select: StatsSelect<K, S, F> = {
    value: (state, id) => state[def.key][id],
    flag: (state, id) => state[def.key].flags[id],
    explain: (state, id) => graph(state as Q).explain(id),
    parts: (state, id) => graph(state as Q).parts(id),
  };
  return Object.assign(made, { select, def: { stats: declared, flags, index }, draft: {} }) as StatsFeature<
    K,
    S,
    F,
    Q,
    G,
    NeedsOf<R>
  >;
}
