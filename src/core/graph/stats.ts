import { D, type Decimal, type DecimalSource, ONE, ZERO } from "../decimal";

/**
 * The stat graph: the engine's one stat system. Every number a tree, a card or a purchase changes is a named stat,
 * and every change to it is an effect: an amount added to its base, or a multiplier. One order everywhere:
 * (base + every add) x every mul, then the stat's softcap, then its hardcap, in Decimals. An effect's amount is a
 * fixed number or a function of the state, and may read another stat; one that comes back to itself throws.
 *
 * Content is indexed once (`statIndex().add(source, meta)`), then `over(q)` gives a graph for one state that works
 * each stat out the first time it is read and keeps it for the graph's life, so make a new graph after the state
 * changes. A game does not usually hold a graph itself: the `stats` feature owns one and serves each stat as a
 * derived value (`watchpot/core` › `stats`).
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
export interface StatCaps {
  softcap?: Softcap;
  hardcap?: number;
}

/** An effect's amount: a fixed number, or a value read off the state `q` (called at most once per graph). */
export type Amount<Q> = DecimalSource | ((q: Q) => DecimalSource);

/**
 * What a source does to a stat: `{ stat, add }` adds to its base, `{ stat, mul }` multiplies it. The amount is a
 * number (`{ stat: "heat", mul: 2 }`) or a function of the state (`{ stat: "heat", add: (q) => q.stove.burners }`).
 * `quiet` counts like any other and is marked in the breakdown, for a screen that hides the small print.
 */
export type Effect<S extends string = string, Q = unknown> =
  | { readonly stat: S; readonly add: Amount<Q>; readonly mul?: undefined; readonly quiet?: boolean }
  | { readonly stat: S; readonly mul: Amount<Q>; readonly add?: undefined; readonly quiet?: boolean };

/** A piece of content as the index takes it: the effects it has and the flags it raises while it counts. */
export interface StatSource<S extends string, F extends string, Q> {
  readonly effects?: readonly Effect<S, Q>[];
  readonly flags?: readonly F[];
}

/**
 * Where a source comes from and when it counts. `times` is how many times over it counts (the ranks held of a
 * node, the copies owned of a card): an add counts `times` times its amount, a mul its amount to the power
 * `times`, as one row of the breakdown; 0 or less and the source does not count. A source whose `group` is muted
 * loses its effects, never its flags: a flag it raises stays raised while it counts, so a source a game means to
 * switch off whole reads the mute in its own `active` too.
 */
export interface SourceMeta<Q, G extends string = string> {
  readonly label: string;
  readonly owner: string;
  readonly group?: G;
  /** Whether the source counts at all (default: it does). */
  readonly active?: (q: Q) => boolean;
  /** How many times over it counts (default 1). */
  readonly times?: (q: Q) => number;
}

/** One effect of a stat, worked out: a row of its breakdown. */
export interface StatPart {
  readonly label: string;
  readonly owner: string;
  readonly op: "add" | "mul";
  /** What the row comes to, `times` included: the sum it adds or the factor it multiplies by. */
  readonly value: Decimal;
  /** How many times over the source counts. */
  readonly times: number;
  readonly quiet: boolean;
  /**
   * Set when the source's group is muted: the row is listed with what it would have come to and does not count.
   * The string is the mute's reason when the game gave one, else the group's name.
   */
  readonly muted: string | null;
}

/** A stat's base, summed adds, multiplier, raw and capped value, and every effect on it, in Decimals. */
export interface StatBreakdown<S extends string> {
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
  /** Every effect of a counting source, in the order the sources were added; a muted one is marked, not counted. */
  parts: StatPart[];
}

/** The stats and flags of one state. Each is worked out once, on first read. */
export interface StatGraph<S extends string, F extends string> {
  /** The stat's value, capped. */
  stat(id: S): Decimal;
  /** The effects on the stat, in the order their sources were added (muted ones marked). */
  parts(id: S): StatPart[];
  /** Everything that makes the stat what it is. */
  explain(id: S): StatBreakdown<S>;
  /** Whether any counting source raises the flag. */
  flag(id: F): boolean;
}

/** A stat index's bases and caps. The base has no default: every stat's is said once, here. */
export interface StatIndexOptions<S extends string> {
  base: (stat: S) => DecimalSource;
  caps?: Partial<Record<S, StatCaps>>;
}

/** What `over` may be told: which groups are muted. A string is the reason, shown on the muted rows. */
export interface OverOptions<G extends string, S extends string = string, Q = unknown> {
  muted?: (group: G) => boolean | string;
  /** Effects that count for this graph only, after the indexed ones: what the state itself lists for a stat. */
  extra?: (stat: S) => readonly ExtraEffect<S, Q, G>[];
}

/** One effect handed to a single graph, with where it comes from. */
export interface ExtraEffect<S extends string, Q, G extends string = string> {
  readonly effect: Effect<S, Q>;
  readonly meta: SourceMeta<Q, G>;
}

/** Content indexed by stat and flag, ready to be read over any state. */
export interface StatIndex<S extends string, F extends string, Q, G extends string = string> {
  /** Indexes every effect and flag of the source under its meta. Graphs already made do not see it. */
  add(source: StatSource<S, F, Q>, meta: SourceMeta<Q, G>): void;
  /**
   * A graph over one state; `muted` silences the effects of a group. Never its flags: `flag` still reads a muted
   * group's sources as raised, so a mute meant to switch a source off whole goes in its `active` as well.
   */
  over(q: Q, options?: OverOptions<G, S, Q>): StatGraph<S, F>;
}

interface Entry<S extends string, Q, G extends string> {
  readonly seq: number;
  readonly effect: Effect<S, Q>;
  readonly meta: SourceMeta<Q, G>;
}

interface Raiser<Q, G extends string> {
  readonly seq: number;
  readonly meta: SourceMeta<Q, G>;
}

/** The softcap's reduction of `value`, or `value` itself below its start. Monotonic and never above `value`. */
export function applySoftcap(value: Decimal, cap: Softcap | undefined): Decimal {
  if (!cap || !(cap.start > 0) || !value.gt(cap.start)) return value;
  return value.pow(cap.power).mul(D(cap.start).pow(1 - cap.power));
}

/** `value` to the power `times`: multiplied out for a small whole count, which keeps whole numbers whole. */
function power(value: Decimal, times: number): Decimal {
  if (!Number.isInteger(times) || times > 32) return value.pow(times);
  let out = value;
  for (let i = 1; i < times; i++) out = out.mul(value);
  return out;
}

const amountOf = <Q>(amount: Amount<Q>, q: Q): Decimal =>
  D(typeof amount === "function" ? amount(q) : amount);

/** An empty stat index. Add content to it once, then read it over each state with `over`. */
export function statIndex<S extends string, F extends string, Q, G extends string = string>(
  options: StatIndexOptions<S>,
): StatIndex<S, F, Q, G> {
  const base = options.base;
  const caps: Partial<Record<S, StatCaps>> = options.caps ?? {};
  const effects = new Map<S, Entry<S, Q, G>[]>();
  const flags = new Map<F, Raiser<Q, G>[]>();
  let added = 0;

  const timesOf = (meta: SourceMeta<Q, G>, q: Q): number => {
    if (meta.active && !meta.active(q)) return 0;
    const times = meta.times ? meta.times(q) : 1;
    return Math.max(times, 0);
  };

  return {
    add(source, meta) {
      const seq = added++;
      for (const effect of source.effects ?? []) {
        const list = effects.get(effect.stat) ?? [];
        list.push({ seq, effect, meta });
        effects.set(effect.stat, list);
      }
      for (const flag of source.flags ?? []) {
        const list = flags.get(flag) ?? [];
        list.push({ seq, meta });
        flags.set(flag, list);
      }
    },

    over(q, over = {}) {
      // Sources added after this point belong to later graphs.
      const seen = added;
      const worked = new Map<S, StatBreakdown<S>>();
      const working = new Set<S>();
      const flagged = new Map<F, boolean>();
      const mutes = new Map<G, string | null>();
      const mutedBy = (group: G | undefined): string | null => {
        if (group === undefined || !over.muted) return null;
        const hit = mutes.get(group);
        if (hit !== undefined) return hit;
        const said = over.muted(group);
        const why = said === true ? group : said === false ? null : said;
        mutes.set(group, why);
        return why;
      };

      const work = (id: S): StatBreakdown<S> => {
        const hit = worked.get(id);
        if (hit) return hit;
        if (working.has(id)) throw new Error(`stat "${id}" depends on itself`);
        working.add(id);
        try {
          const b = D(base(id));
          let add = ZERO;
          let mult = ONE;
          const parts: StatPart[] = [];
          const indexed = (effects.get(id) ?? []).filter((e) => e.seq < seen);
          for (const { effect, meta } of [...indexed, ...(over.extra?.(id) ?? [])]) {
            const times = timesOf(meta, q);
            if (times === 0) continue;
            const muted = mutedBy(meta.group);
            const adds = effect.add !== undefined;
            const one = amountOf(adds ? effect.add : effect.mul, q);
            const value = times === 1 ? one : adds ? one.mul(times) : power(one, times);
            if (muted === null) {
              if (adds) add = add.add(value);
              else mult = mult.mul(value);
            }
            parts.push({
              label: meta.label,
              owner: meta.owner,
              op: adds ? "add" : "mul",
              value,
              times,
              quiet: effect.quiet ?? false,
              muted,
            });
          }
          const def = caps[id] ?? {};
          const raw = b.add(add).mul(mult);
          const soft = applySoftcap(raw, def.softcap);
          const hardcapped = def.hardcap !== undefined && soft.gt(def.hardcap);
          const out: StatBreakdown<S> = {
            stat: id,
            base: b,
            add,
            mult,
            raw,
            value: hardcapped ? D(def.hardcap as number) : soft,
            softcapped: def.softcap && soft.lt(raw) ? def.softcap.label : null,
            hardcapped,
            parts,
          };
          worked.set(id, out);
          return out;
        } finally {
          working.delete(id);
        }
      };

      return {
        stat: (id) => work(id).value,
        parts: (id) => [...work(id).parts],
        explain: (id) => {
          const b = work(id);
          return { ...b, parts: [...b.parts] };
        },
        flag(id) {
          const hit = flagged.get(id);
          if (hit !== undefined) return hit;
          const on = (flags.get(id) ?? []).some((r) => r.seq < seen && timesOf(r.meta, q) > 0);
          flagged.set(id, on);
          return on;
        },
      };
    },
  };
}
