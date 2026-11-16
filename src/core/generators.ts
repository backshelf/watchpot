import type { Draft } from "immer";
import { catchUp } from "./clock";
import {
  type CostCurve,
  costAt,
  costOfMany,
  maxAffordable,
  nextThreshold,
  reached,
  type Threshold,
} from "./cost";
import type { CurrenciesFeature, CurrencyDraft } from "./currencies";
import { D, type Decimal, type DecimalSource, ZERO } from "./decimal";
import type { DimensionAway } from "./dimensions";
import { type Feature, type FeatureApi, feature, type Move, type ResetRule } from "./feature";

/**
 * Generators: the building list every idle game has. Buy N of a thing, each one makes a currency a second, and the
 * price climbs on a cost curve. A generator either pays a steady `rate` per one owned, or runs a timed `cycle` that
 * pays `cycle.pays × owned` each time it completes: started by hand with `run(id)`, or restarting itself once the
 * game's `automated` says so. Milestones on the owned count (25, 50, 100) multiply the output or speed the cycle, and
 * `global` milestones do the same for every generator once the lowest owned count across the list reaches them.
 *
 * `cyclesIn` is the pure kernel for a cycle: how many complete over a stretch, in closed form, so a tick of 50 ms and
 * an absence of a week land the same. `generators({ key, wallet, list })` is the feature.
 */

/** What a milestone gives: a multiplier on the output, and a speed that divides the cycle (2 halves it). */
export interface GeneratorBoost {
  readonly mult?: number;
  readonly speed?: number;
}

/** A timed cycle: one of `ms` completes and pays `pays` per one owned. */
export interface GeneratorCycle {
  readonly ms: number;
  readonly pays: DecimalSource;
}

interface GeneratorBase<C extends string> {
  readonly id: string;
  /** The price of the next one, by how many are owned (the free ones count). */
  readonly cost: CostCurve;
  /** The currency it is bought with. */
  readonly pays: C;
  /** The currency it makes. */
  readonly makes: C;
  /** Milestones on the owned count: each one reached multiplies the output or speeds the cycle. */
  readonly milestones?: readonly Threshold<GeneratorBoost>[];
  /** Owned at the start of a run (default 0). */
  readonly free?: number;
}

/**
 * One generator. With `rate` it makes that much a second per one owned; with `cycle` it completes a cycle of
 * `cycle.ms` and pays `cycle.pays` per one owned. The game's own fields (a name, a line) ride along.
 */
export type GeneratorDef<C extends string = string> = GeneratorBase<C> &
  (
    | { readonly rate: DecimalSource; readonly cycle?: undefined }
    | { readonly cycle: GeneratorCycle; readonly rate?: undefined }
  );

/** What `cyclesIn` returns: cycles completed over the stretch and the progress into the next. */
export interface CycleStep {
  readonly completed: number;
  readonly progress: number;
}

/**
 * Cycles of `cycleMs` completed over `dtMs` from `progress` ms into the current one: `floor((progress + dt) /
 * cycleMs)` and the remainder. With `once` (a cycle started by hand, not restarting itself) at most one completes
 * and the progress drops to 0 when it does. Pure; cutting the stretch anywhere gives the same total.
 */
export function cyclesIn(progress: number, dtMs: number, cycleMs: number, once = false): CycleStep {
  const total = Math.max(0, progress) + Math.max(0, Number.isFinite(dtMs) ? dtMs : 0);
  const ms = Math.max(Number.MIN_VALUE, cycleMs);
  if (total < ms) return { completed: 0, progress: total };
  if (once) return { completed: 1, progress: 0 };
  const completed = Math.floor(total / ms);
  return { completed, progress: Math.max(0, total - completed * ms) };
}

/** The feature's saved state: owned, cycle progress and running per generator; `perSecond` is derived each tick. */
export interface GeneratorsState {
  owned: Record<string, number>;
  /** Ms into the current cycle, per cycle generator. */
  progress: Record<string, number>;
  /** Whether a cycle started by hand is under way, per cycle generator. */
  running: Record<string, boolean>;
  /** What the list makes a second, per currency: worked out in the `rates` step, never saved. */
  perSecond: Record<string, Decimal>;
}

/** The feature's actions. */
export interface GeneratorActions {
  /** Buys exactly `count` (default 1) of a generator, or nothing. */
  buy(id: string, count?: number): boolean;
  /** Buys as many as the balance covers, `limit` at most. Returns how many. */
  buyMax(id: string, limit?: number): number;
  /** Buys exactly what reaches the generator's next milestone, or nothing (false past the last). */
  buyNext(id: string): boolean;
  /** Starts a cycle generator's cycle. False when it is not a cycle, none is owned, one is under way, or it is automated. */
  run(id: string): boolean;
}

/** A generator list's rules, read off the game state. */
export interface GeneratorRules<G, T extends GeneratorDef> {
  readonly list: readonly T[];
  /** A generator by id. */
  generator(id: string): T | undefined;
  /** Whether it can be bought now. */
  open(state: G, id: string): boolean;
  /** How many are owned. */
  owned(state: G, id: string): number;
  /** The price of the next `count` (default 1). */
  price(state: G, id: string, count?: number): Decimal;
  /** How many more the balance covers (0 when it is not open). */
  affordable(state: G, id: string): number;
  /** Every milestone reached, its own and the global ones, folded: the product of the mults and of the speeds. */
  boost(state: G, id: string): { readonly mult: number; readonly speed: number };
  /** The cycle's length now, after the speed (null for a rate generator). */
  cycleMs(state: G, id: string): number | null;
  /** Whether a cycle generator restarts itself. */
  automated(state: G, id: string): boolean;
  /** What one cycle pays now, all owned (zero for a rate generator). */
  cyclePays(state: G, id: string): Decimal;
  /** What the generator makes a second, all owned, every multiplier applied; a cycle by its average rate. */
  rate(state: G, id: string): Decimal;
  /** How many more reach its next milestone, or null past the last. */
  untilMilestone(state: G, id: string): number | null;
  /** What the list makes a second, per currency: rate generators and automated cycles (a hand cycle is not income). */
  perSecond(state: G): Record<string, Decimal>;
}

/** The draft helpers, for a recipe or a step (an autobuyer's purchase). Each returns how many it bought. */
export interface GeneratorHelpers {
  /** Buys exactly `count` (default 1) inside a recipe, or nothing. */
  buy(draft: object, id: string, count?: number): number;
  /** Buys as many as the balance covers inside a recipe, `limit` at most. */
  buyMax(draft: object, id: string, limit?: number): number;
}

/** A `generators` feature, carrying its rules as `.rules` and the draft helpers `buy` and `buyMax`. */
export type GeneratorsFeature<K extends string, G, T extends GeneratorDef> = Feature<
  K,
  GeneratorsState,
  GeneratorActions
> &
  GeneratorHelpers & { readonly rules: GeneratorRules<G, T> };

/** The share of an absence the list is credited, and the most of it that counts. */
export type GeneratorAway = DimensionAway;

/** The definition `generators` takes. */
export interface GeneratorsDef<
  K extends string,
  T extends GeneratorDef<C>,
  WK extends string,
  C extends string,
  WS extends object,
  WA extends object,
  G extends object,
> {
  /** The saved key. */
  readonly key: K;
  /** The currencies feature the list buys from and pays into. */
  readonly wallet: CurrenciesFeature<WK, C, WS, WA>;
  readonly list: readonly T[];
  /** The game's multiplier on one generator's output (its stat bus), read off the whole game state. */
  readonly mult?: (state: G, def: T) => DecimalSource;
  /** Milestones every generator gets once the lowest owned count across the list reaches them. */
  readonly global?: readonly Threshold<GeneratorBoost>[];
  /** Whether a generator can be bought. Default: always. */
  readonly open?: (state: G, def: T) => boolean;
  /** Whether a cycle generator restarts itself (a manager bought). Default: never; `run(id)` starts each cycle. */
  readonly automated?: (state: G, def: T) => boolean;
  /** How an absence counts. Default: all of it. */
  readonly away?: (state: G) => GeneratorAway;
  readonly reset?: ResetRule<GeneratorsState>;
}

/**
 * A building list as a feature. It saves `{ owned, progress, running }` under `key`, works out `perSecond` in the
 * step `<key>.rates.perSecond` and pays in `<key>.produce.make` (over a tick, and over an absence through `away`),
 * buys from `wallet` and carries its rules as `.rules`. Its auto-player moves buy one of each open generator,
 * valued at the income it adds a second, and start every idle hand cycle for free. A prestige reset starts the list
 * over (the `free` ones owned again) unless `reset` says otherwise. The callbacks read the whole game state, so
 * annotate one of them with the game's state type.
 */
export function generators<
  const K extends string,
  T extends GeneratorDef<C>,
  WK extends string,
  C extends string,
  WS extends object,
  WA extends object,
  G extends object = object,
>(def: GeneratorsDef<K, T, WK, C, WS, WA, G>): GeneratorsFeature<K, G, T> {
  const { list, wallet } = def;
  const byId = new Map<string, T>();
  for (const g of list) {
    if (byId.has(g.id)) throw new Error(`generators "${def.key}": the generator "${g.id}" appears twice`);
    if (g.cycle && !(g.cycle.ms > 0))
      throw new Error(`generators "${def.key}": the cycle of "${g.id}" must be above zero`);
    byId.set(g.id, g);
  }

  type Own = Record<K, GeneratorsState> & CurrencyDraft<WK>;
  const own = (state: unknown): GeneratorsState => (state as Record<K, GeneratorsState>)[def.key];
  const ownedOf = (state: unknown, g: T): number => own(state).owned[g.id] ?? 0;
  const lowest = (state: unknown): number =>
    list.length === 0 ? 0 : Math.min(...list.map((g) => ownedOf(state, g)));

  const open = (state: G, g: T): boolean => def.open?.(state, g) ?? true;
  const automated = (state: G, g: T): boolean =>
    g.cycle !== undefined && (def.automated?.(state, g) ?? false);
  const boost = (state: G, g: T): { mult: number; speed: number } => {
    let mult = 1;
    let speed = 1;
    const gives = [
      ...reached(g.milestones ?? [], ownedOf(state, g)),
      ...reached(def.global ?? [], lowest(state)),
    ];
    for (const b of gives) {
      mult *= b.mult ?? 1;
      speed *= b.speed ?? 1;
    }
    return { mult, speed };
  };
  /** The output multiplier: milestones and the game's own. */
  const multOf = (state: G, g: T): Decimal => D(def.mult?.(state, g) ?? 1).mul(boost(state, g).mult);
  const cycleMs = (state: G, g: T): number | null =>
    g.cycle ? g.cycle.ms / Math.max(Number.MIN_VALUE, boost(state, g).speed) : null;
  /** What one owned makes a second, or pays a cycle. */
  const unit = (state: G, g: T): Decimal =>
    g.cycle
      ? D(g.cycle.pays).mul(multOf(state, g))
      : D(g.rate ?? 0)
          .mul(multOf(state, g))
          .mul(boost(state, g).speed);
  /** What one owned makes a second, a cycle by its average. */
  const unitRate = (state: G, g: T): Decimal => {
    const ms = cycleMs(state, g);
    return ms === null ? unit(state, g) : unit(state, g).mul(1000 / ms);
  };
  const rate = (state: G, g: T): Decimal => unitRate(state, g).mul(ownedOf(state, g));
  const perSecond = (state: G): Record<string, Decimal> => {
    const out: Record<string, Decimal> = {};
    for (const g of list) {
      if (g.cycle && !automated(state, g)) continue;
      out[g.makes] = (out[g.makes] ?? ZERO).add(rate(state, g));
    }
    return out;
  };
  const untilMilestone = (state: unknown, g: T): number | null => {
    const owned = ownedOf(state, g);
    const next = nextThreshold(g.milestones ?? [], owned);
    return next ? next.at - owned : null;
  };

  const rules: GeneratorRules<G, T> = {
    list,
    generator: (id) => byId.get(id),
    open: (state, id) => {
      const g = byId.get(id);
      return g !== undefined && open(state, g);
    },
    owned: (state, id) => {
      const g = byId.get(id);
      return g ? ownedOf(state, g) : 0;
    },
    price: (state, id, count = 1) => {
      const g = byId.get(id);
      return g ? costOfMany(g.cost, ownedOf(state, g), count) : ZERO;
    },
    affordable: (state, id) => {
      const g = byId.get(id);
      if (!g || !open(state, g)) return 0;
      const held = wallet.balance(state as unknown as CurrencyDraft<WK>, g.pays);
      return maxAffordable(g.cost, ownedOf(state, g), held);
    },
    boost: (state, id) => {
      const g = byId.get(id);
      return g ? boost(state, g) : { mult: 1, speed: 1 };
    },
    cycleMs: (state, id) => {
      const g = byId.get(id);
      return g ? cycleMs(state, g) : null;
    },
    automated: (state, id) => {
      const g = byId.get(id);
      return g !== undefined && automated(state, g);
    },
    cyclePays: (state, id) => {
      const g = byId.get(id);
      return g?.cycle ? unit(state, g).mul(ownedOf(state, g)) : ZERO;
    },
    rate: (state, id) => {
      const g = byId.get(id);
      return g ? rate(state, g) : ZERO;
    },
    untilMilestone: (state, id) => {
      const g = byId.get(id);
      return g ? untilMilestone(state, g) : null;
    },
    perSecond,
  };

  /** Buys up to `count` inside a recipe: all of them, or (`partial`) what the balance covers. */
  const buyDraft = (draft: Draft<Own>, id: string, count: number, partial: boolean): number => {
    const g = byId.get(id);
    if (!g || !open(draft as unknown as G, g)) return 0;
    const want = Math.max(0, Math.floor(count));
    const purse = draft as unknown as CurrencyDraft<WK>;
    const had = ownedOf(draft, g);
    const n = partial ? maxAffordable(g.cost, had, wallet.balance(purse, g.pays), want) : want;
    if (n <= 0 || !wallet.debit(purse, g.pays, costOfMany(g.cost, had, n))) return 0;
    own(draft).owned[g.id] = had + n;
    return n;
  };

  /** Pays every generator over `ms` of credited time. */
  const make = (draft: Draft<Own>, ms: number): void => {
    if (!(ms > 0)) return;
    const state = draft as unknown as G;
    const purse = draft as unknown as CurrencyDraft<WK>;
    const s = own(draft);
    for (const g of list) {
      const owned = ownedOf(draft, g);
      if (owned <= 0) continue;
      const length = cycleMs(state, g);
      if (length === null) {
        wallet.credit(purse, g.makes, rate(state, g).mul(ms / 1000));
        continue;
      }
      const auto = automated(state, g);
      if (!auto && !s.running[g.id]) continue;
      const step = cyclesIn(s.progress[g.id] ?? 0, ms, length, !auto);
      s.progress[g.id] = step.progress;
      if (step.completed > 0) {
        wallet.credit(purse, g.makes, unit(state, g).mul(owned).mul(step.completed));
        if (!auto) s.running[g.id] = false;
      }
    }
  };

  const toNumber = (d: Decimal): number => {
    const n = d.toNumber();
    return Number.isFinite(n) ? n : Number.MAX_VALUE;
  };

  const made = feature<K, GeneratorsState, GeneratorActions, readonly [], Own>({
    key: def.key,
    initial: (): GeneratorsState => ({
      owned: Object.fromEntries(list.map((g) => [g.id, Math.max(0, Math.floor(g.free ?? 0))])),
      progress: Object.fromEntries(list.filter((g) => g.cycle).map((g) => [g.id, 0])),
      running: Object.fromEntries(list.filter((g) => g.cycle).map((g) => [g.id, false])),
      perSecond: {},
    }),
    transient: ["perSecond"],
    reset: def.reset ?? "run",
    actions: (api: FeatureApi<Own>): GeneratorActions => {
      const run = (id: string, count: number, partial: boolean): number => {
        let n = 0;
        api.set((d) => {
          n = buyDraft(d, id, count, partial);
        });
        return n;
      };
      return {
        buy: (id, count = 1) => run(id, count, false) > 0,
        buyMax: (id, limit = Number.POSITIVE_INFINITY) => run(id, limit, true),
        buyNext: (id) => {
          const g = byId.get(id);
          const until = g ? untilMilestone(api.get(), g) : null;
          return until !== null && run(id, until, false) > 0;
        },
        run: (id) => {
          let ok = false;
          api.set((d) => {
            const g = byId.get(id);
            const s = own(d);
            if (!g?.cycle || ownedOf(d, g) <= 0 || s.running[g.id] || automated(d as unknown as G, g)) return;
            s.running[g.id] = true;
            s.progress[g.id] = 0;
            ok = true;
          });
          return ok;
        },
      };
    },
    steps: {
      rates: {
        perSecond: (d: Draft<Own>) => {
          own(d).perSecond = perSecond(d as unknown as G);
        },
      },
      produce: {
        make: (d: Draft<Own>, ctx) => {
          if (ctx.pass === "tick") return make(d, ctx.dtMs);
          const away = def.away?.(d as unknown as G) ?? { rate: 1 };
          make(d, catchUp(ctx.dtMs, away.rate, away.capMs ?? Number.POSITIVE_INFINITY).creditedMs);
        },
      },
    },
    moves: (s) => {
      const state = s as unknown as G;
      const out: Move<typeof s>[] = [];
      const actions = (store: { getState(): unknown }) =>
        (store.getState() as Record<K, GeneratorActions>)[def.key];
      for (const g of list) {
        if (!open(state, g)) continue;
        out.push({
          id: `${def.key}:${g.id}`,
          cost: { currency: g.pays, amount: costAt(g.cost, ownedOf(s, g)) },
          value: (st) => toNumber(unitRate(st as unknown as G, g)),
          apply: (store) => actions(store).buy(g.id),
        });
        if (g.cycle && ownedOf(s, g) > 0 && !own(s).running[g.id] && !automated(state, g))
          out.push({
            id: `${def.key}:run:${g.id}`,
            // Worth what the cycle pays; never nothing, so the auto-player starts even a cycle that pays little.
            value: (st) =>
              Math.max(Number.MIN_VALUE, toNumber(unit(st as unknown as G, g).mul(ownedOf(st, g)))),
            apply: (store) => actions(store).run(g.id),
          });
      }
      return out;
    },
  });
  const helpers: GeneratorHelpers = {
    buy: (draft, id, count = 1) => buyDraft(draft as Draft<Own>, id, count, false),
    buyMax: (draft, id, limit = Number.POSITIVE_INFINITY) => buyDraft(draft as Draft<Own>, id, limit, true),
  };
  return Object.assign(made, helpers, { rules });
}
