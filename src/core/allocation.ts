import type { Draft } from "immer";
import { offlineCredit } from "./clock";
import { type CostCurve, costAt, costOfMany, maxAffordable } from "./cost";
import { D, type Decimal, type DecimalSource, ZERO } from "./decimal";
import type { DimensionAway } from "./dimensions";
import { type Feature, type FeatureApi, feature, type ResetRule } from "./feature";

/**
 * Allocation: a capped pool split between sinks. Workers across jobs, energy across bars, crew across stations: the
 * pool is the game's number, and the player says how much of it goes where. A sink either counts what is assigned to
 * it (the game reads `assigned` as a rate) or fills a bar: each assigned unit does `speed` work a second, and a full
 * bar levels the sink up and starts the next, whose cost climbs on a cost curve.
 *
 * `assignUnits`, `freeUnits`, `allocatedUnits` and `rebalanceUnits` are the pure rules over an assigned record (the
 * `Units` suffix marks the kernel; the feature's action of the same stem, `assign(id, n)`, is `assignUnits` over its
 * own record, pool and caps); `allocation({ key, pool, sinks })` is the feature. When the pool shrinks, what no longer
 * fits is taken back from the most recently assigned sink first.
 */

/** Whole units, never negative. */
const whole = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

/** The units assigned across every sink. */
export function allocatedUnits(assigned: Readonly<Record<string, number>>): number {
  let total = 0;
  for (const n of Object.values(assigned)) total += whole(n);
  return total;
}

/** What is left of the pool: `pool - allocated`, never negative. */
export function freeUnits(assigned: Readonly<Record<string, number>>, pool: number): number {
  return Math.max(0, whole(pool) - allocatedUnits(assigned));
}

/**
 * Moves `n` units into sink `id` (or out of it, for a negative `n`): into it no more than is free and than its `cap`
 * leaves room for, out of it no more than it holds. Pure; returns the new record.
 */
export function assignUnits(
  assigned: Readonly<Record<string, number>>,
  id: string,
  n: number,
  pool: number,
  cap = Number.POSITIVE_INFINITY,
): Record<string, number> {
  const had = whole(assigned[id] ?? 0);
  const move =
    n >= 0
      ? Math.min(Math.floor(n), freeUnits(assigned, pool), Math.max(0, Math.floor(cap) - had))
      : -Math.min(Math.floor(-n), had);
  return { ...assigned, [id]: had + move };
}

/**
 * Trims an assigned record to fit: every sink to its cap, then the total to the pool, taking from the end of `order`
 * (the most recently assigned last) first, and from any sink not in `order` after those. Pure and deterministic;
 * returns the new record (the same values when it already fits).
 */
export function rebalanceUnits(
  assigned: Readonly<Record<string, number>>,
  pool: number,
  order: readonly string[] = [],
  caps: Readonly<Record<string, number>> = {},
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [id, n] of Object.entries(assigned))
    next[id] = Math.min(whole(n), whole(caps[id] ?? Number.MAX_SAFE_INTEGER));
  let over = allocatedUnits(next) - whole(pool);
  const unordered = Object.keys(next).filter((id) => !order.includes(id));
  const trim = [...order].reverse().concat([...unordered].reverse());
  for (const id of trim) {
    if (over <= 0) break;
    const take = Math.min(over, next[id] ?? 0);
    if (take <= 0) continue;
    next[id] = (next[id] ?? 0) - take;
    over -= take;
  }
  return next;
}

interface SinkBase<G, E> {
  readonly id: string;
  /** The most it can hold, read off the whole game state (default: no cap). */
  readonly cap?: (state: G) => number;
  /** What its level gives, for the game's stats (a bar's level; a counting sink stays at level 0). */
  readonly effects?: (level: number) => readonly E[];
}

/**
 * One sink. Without `cost` it only counts what is assigned to it. With `cost` and `speed` it is a bar: each assigned
 * unit does `speed(state)` work a second, and the level's `cost` of work fills it and levels it up.
 */
export type SinkDef<G, E = never> = SinkBase<G, E> &
  (
    | { readonly cost?: undefined; readonly speed?: undefined; readonly maxLevel?: undefined }
    | {
        /** The work to fill the bar at each level: a cost curve over the level (geometric is closed-form). */
        readonly cost: CostCurve;
        /** The work one assigned unit does a second. */
        readonly speed: (state: G) => DecimalSource;
        /** The level it stops at (default: none). */
        readonly maxLevel?: number;
      }
  );

/** The feature's saved state. */
export interface AllocationState {
  /** Units per sink id. */
  assigned: Record<string, number>;
  /** Sink ids, the most recently assigned last: the order a shrinking pool takes back from. */
  order: string[];
  /** Work into the current level, per bar. */
  progress: Record<string, Decimal>;
  /** Level per bar. */
  level: Record<string, number>;
}

/** The feature's actions. Each returns the units it moved. */
export interface AllocationActions {
  /** Moves `n` free units into a sink, clamped to what is free and to its cap: `assignUnits` on the saved record. */
  assign(id: string, n: number): number;
  /** Takes `n` units back out of a sink: `assignUnits` with `-n`. */
  unassign(id: string, n: number): number;
  /** Takes every unit back. */
  clear(): number;
  /** Moves everything free into one sink. */
  fill(id: string): number;
}

/** An allocation's rules, read off the game state. */
export interface AllocationRules<G, E> {
  readonly sinks: readonly SinkDef<G, E>[];
  sink(id: string): SinkDef<G, E> | undefined;
  /** The pool now. */
  pool(state: G): number;
  /** What is free now. */
  free(state: G): number;
  /** A sink's cap now (Infinity without one). */
  cap(state: G, id: string): number;
  /** A bar's work a second: assigned × speed (zero for a counting sink). */
  perSecond(state: G, id: string): Decimal;
  /** A bar's level, the work into it, the work it needs and the share filled. */
  bar(state: G, id: string): { level: number; into: Decimal; need: Decimal; share: number };
  /** Every sink's effects at its level, sourced `<key>:<id>`. */
  contributions(slice: Pick<AllocationState, "level">): { source: string; effect: E }[];
}

/** An `allocation` feature, carrying its rules as `.rules`. */
export type AllocationFeature<K extends string, G, E> = Feature<K, AllocationState, AllocationActions> & {
  readonly rules: AllocationRules<G, E>;
};

/**
 * A pool split between sinks, as a feature. It saves `{ assigned, order, progress, level }` under `key` (the contributions'
 * source prefix too). `<key>.sync.pool` trims the record when the pool or a cap shrinks; `<key>.produce.fill` fills the
 * bars over a tick, and over an absence through `away` (default: all of it), several levels in one step when the work
 * covers them. A run reset clears it unless `reset` says otherwise. The callbacks read the whole game state, so
 * annotate one of them with the game's state type.
 */
export function allocation<const K extends string, E = never, G extends object = object>(def: {
  readonly key: K;
  readonly pool: (state: G) => number;
  readonly sinks: readonly SinkDef<G, E>[];
  readonly away?: (state: G) => DimensionAway;
  readonly reset?: ResetRule<AllocationState>;
}): AllocationFeature<K, G, E> {
  const byId = new Map<string, SinkDef<G, E>>();
  for (const s of def.sinks) {
    if (byId.has(s.id)) throw new Error(`allocation "${def.key}": the sink "${s.id}" appears twice`);
    byId.set(s.id, s);
  }

  type Own = Record<K, AllocationState>;
  const own = (state: unknown): AllocationState => (state as Own)[def.key];
  const capOf = (state: G, s: SinkDef<G, E>): number =>
    s.cap ? whole(s.cap(state)) : Number.POSITIVE_INFINITY;
  const pool = (state: G): number => whole(def.pool(state));
  const levelOf = (state: unknown, id: string): number => own(state).level[id] ?? 0;
  const perSecond = (state: G, s: SinkDef<G, E>): Decimal =>
    s.speed ? D(s.speed(state)).mul(own(state).assigned[s.id] ?? 0) : ZERO;

  const rules: AllocationRules<G, E> = {
    sinks: def.sinks,
    sink: (id) => byId.get(id),
    pool,
    free: (state) => freeUnits(own(state).assigned, pool(state)),
    cap: (state, id) => {
      const s = byId.get(id);
      return s ? capOf(state, s) : 0;
    },
    perSecond: (state, id) => {
      const s = byId.get(id);
      return s ? perSecond(state, s) : ZERO;
    },
    bar: (state, id) => {
      const s = byId.get(id);
      const level = levelOf(state, id);
      const into = own(state).progress[id] ?? ZERO;
      if (!s?.cost) return { level, into: ZERO, need: ZERO, share: 0 };
      const need = costAt(s.cost, level);
      const share = need.gt(0) ? Math.min(1, into.div(need).toNumber()) : 1;
      return { level, into, need, share };
    },
    contributions: (slice) => {
      const out: { source: string; effect: E }[] = [];
      for (const s of def.sinks)
        for (const effect of s.effects?.(slice.level[s.id] ?? 0) ?? [])
          out.push({ source: `${def.key}:${s.id}`, effect });
      return out;
    },
  };

  /** Moves `n` (signed) into a sink inside a recipe; the sink goes to the end of the order when it gains. */
  const move = (draft: Draft<Own>, id: string, n: number): number => {
    const sink = byId.get(id);
    if (!sink) return 0;
    const state = draft as unknown as G;
    const s = own(draft);
    const had = s.assigned[id] ?? 0;
    s.assigned = assignUnits(s.assigned, id, n, pool(state), capOf(state, sink));
    const moved = (s.assigned[id] ?? 0) - had;
    if (moved > 0) s.order = [...s.order.filter((o) => o !== id), id];
    return Math.abs(moved);
  };

  /** Fills every bar over `seconds`. */
  const fill = (draft: Draft<Own>, seconds: number): void => {
    if (!(seconds > 0)) return;
    const state = draft as unknown as G;
    const s = own(draft);
    for (const sink of def.sinks) {
      if (!sink.cost) continue;
      const work = perSecond(state, sink).mul(seconds);
      if (work.lte(0)) continue;
      const level = levelOf(draft, sink.id);
      const room =
        sink.maxLevel === undefined ? Number.POSITIVE_INFINITY : Math.max(0, sink.maxLevel - level);
      if (room <= 0) {
        s.progress[sink.id] = ZERO;
        continue;
      }
      const total = (s.progress[sink.id] ?? ZERO).add(work);
      const n = maxAffordable(sink.cost, level, total, room);
      const left = total.sub(costOfMany(sink.cost, level, n));
      s.level[sink.id] = level + n;
      s.progress[sink.id] = n >= room || left.lt(0) ? ZERO : left;
    }
  };

  const made = feature<K, AllocationState, AllocationActions, readonly [], Record<never, never>, Own>({
    key: def.key,
    initial: (): AllocationState => ({
      assigned: Object.fromEntries(def.sinks.map((s) => [s.id, 0])),
      order: [],
      progress: Object.fromEntries(def.sinks.filter((s) => s.cost).map((s) => [s.id, ZERO])),
      level: Object.fromEntries(def.sinks.filter((s) => s.cost).map((s) => [s.id, 0])),
    }),
    reset: def.reset ?? "run",
    actions: (api: FeatureApi<Own>): AllocationActions => {
      const run = (recipe: (d: Draft<Own>) => number): number => {
        let n = 0;
        api.set((d) => {
          n = recipe(d);
        });
        return n;
      };
      return {
        assign: (id, n) => run((d) => move(d, id, Math.max(0, n))),
        unassign: (id, n) => run((d) => move(d, id, -Math.max(0, n))),
        clear: () =>
          run((d) => {
            const s = own(d);
            const total = allocatedUnits(s.assigned);
            s.assigned = Object.fromEntries(Object.keys(s.assigned).map((id) => [id, 0]));
            s.order = [];
            return total;
          }),
        fill: (id) => run((d) => move(d, id, Number.MAX_SAFE_INTEGER)),
      };
    },
    steps: {
      sync: {
        pool: (d: Draft<Own>) => {
          const state = d as unknown as G;
          const s = own(d);
          const caps: Record<string, number> = {};
          for (const sink of def.sinks) if (sink.cap) caps[sink.id] = capOf(state, sink);
          const next = rebalanceUnits(s.assigned, pool(state), s.order, caps);
          if (Object.entries(next).some(([id, n]) => s.assigned[id] !== n)) s.assigned = next;
        },
      },
      produce: {
        fill: {
          pass: "both",
          run: (d: Draft<Own>, ctx) => {
            if (ctx.pass === "tick") return fill(d, ctx.dtMs / 1000);
            const away = def.away?.(d as unknown as G) ?? { rate: 1 };
            fill(
              d,
              offlineCredit(ctx.dtMs, away.rate, away.capMs ?? Number.POSITIVE_INFINITY).creditedMs / 1000,
            );
          },
        },
      },
    },
  });
  return Object.assign(made, { rules });
}
