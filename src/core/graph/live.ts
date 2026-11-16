import { D, type Decimal, type DecimalSource, ONE, ZERO } from "../decimal";
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
  over(q: Q, options?: { muted?: (group: G) => boolean }): StatGraph<S, F>;
}

interface Entry<S extends string, Q, G extends string> {
  readonly seq: number;
  readonly effect: LiveEffect<S, Q>;
  readonly meta: LiveMeta<Q, G>;
}

interface Raiser<Q> {
  readonly seq: number;
  readonly active: (q: Q) => boolean;
}

/** The softcap's reduction of `value` in Decimals, or `value` itself below its start: `applySoftcap` past 1e308. */
export function softcapDecimal(value: Decimal, cap: Softcap | undefined): Decimal {
  if (!cap || !(cap.start > 0) || !value.gt(cap.start)) return value;
  return value.pow(cap.power).mul(D(cap.start).pow(1 - cap.power));
}

/** An empty live index. Add content to it once, then read it over each state with `over`. */
export function liveIndex<S extends string, F extends string, Q, G extends string = string>(
  options: LiveIndexOptions<S> = {},
): LiveIndex<S, F, Q, G> {
  const base = options.base ?? (() => ONE);
  const caps: Partial<Record<S, StatDef>> = options.caps ?? {};
  const effects = new Map<S, Entry<S, Q, G>[]>();
  const flags = new Map<F, Raiser<Q>[]>();
  let added = 0;

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
        list.push({ seq, active: meta.active });
        flags.set(flag, list);
      }
    },

    over(q, over = {}) {
      // Sources added after this point belong to later graphs.
      const seen = added;
      const muted = over.muted;
      const worked = new Map<S, LiveBreakdown<S>>();
      const working = new Set<S>();
      const flagged = new Map<F, boolean>();

      const work = (id: S): LiveBreakdown<S> => {
        const hit = worked.get(id);
        if (hit) return hit;
        if (working.has(id)) throw new Error(`stat "${id}" depends on itself`);
        working.add(id);
        try {
          const b = D(base(id));
          let add = ZERO;
          let mult = ONE;
          const parts: StatPart[] = [];
          for (const { seq, effect, meta } of effects.get(id) ?? []) {
            if (seq >= seen || !meta.active(q)) continue;
            if (meta.group !== undefined && muted?.(meta.group)) continue;
            const value = D(effect.value(q));
            if (effect.op === "add") add = add.add(value);
            else mult = mult.mul(value);
            parts.push({
              label: meta.label,
              owner: meta.owner,
              op: effect.op,
              value,
              quiet: effect.quiet ?? false,
            });
          }
          const def = caps[id] ?? {};
          const raw = b.add(add).mul(mult);
          const soft = softcapDecimal(raw, def.softcap);
          const hardcapped = def.hardcap !== undefined && soft.gt(def.hardcap);
          const out: LiveBreakdown<S> = {
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
          const on = (flags.get(id) ?? []).some((r) => r.seq < seen && r.active(q));
          flagged.set(id, on);
          return on;
        },
      };
    },
  };
}
