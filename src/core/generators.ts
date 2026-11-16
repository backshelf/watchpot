import type { Draft } from "immer";
import { offlineCredit } from "./clock";
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
import {
  defineFeature,
  type Feature,
  type FeatureApi,
  type Move,
  type NeedsOf,
  type ReachOf,
  type ReachShape,
  type ResetRule,
} from "./feature";

/**
 * Generators: the building list every idle game has. Buy N of a thing, each one makes a currency a second, and the
 * price climbs on a cost curve. A generator either pays a steady `rate` per one owned, or runs a timed `cycle` that
 * pays `cycle.pays × owned` each time it completes: started by hand with `run(id)`, or restarting itself once the
 * game's `automated` says so. Milestones on the owned count (25, 50, 100) multiply the output or speed the cycle, and
 * `global` milestones do the same for every generator once the lowest owned count across the list reaches them.
 *
 * `cyclesIn` is the pure kernel for a cycle: how many complete over a stretch, in closed form, so a tick of 50 ms and
 * an absence of a week land the same. `defineGenerators({ key, wallet, list })` is the feature: its `select` answers
 * questions over state (`burners.select.price(s, "stove")`), its `def` holds the list, and its `draft` buys inside
 * a recipe (`burners.draft.buy(d, "stove")`).
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

/** A generator that makes `rate` a second per one owned. Extend it for a game's own fields on a rate list. */
export type RateGeneratorDef<C extends string = string> = GeneratorBase<C> & {
  readonly rate: DecimalSource;
  readonly cycle?: undefined;
};

/** A generator that completes a cycle of `cycle.ms` and pays `cycle.pays` per one owned. */
export type CycleGeneratorDef<C extends string = string> = GeneratorBase<C> & {
  readonly cycle: GeneratorCycle;
  readonly rate?: undefined;
};

/**
 * One generator. With `rate` it makes that much a second per one owned; with `cycle` it completes a cycle of
 * `cycle.ms` and pays `cycle.pays` per one owned. The game's own fields (a name, a line) ride along: a game that adds
 * them writes `(RateGeneratorDef<C> | CycleGeneratorDef<C>) & Extra`, or extends one of the two.
 */
export type GeneratorDef<C extends string = string> = RateGeneratorDef<C> | CycleGeneratorDef<C>;

/** What every generators callback is given after its own arguments: game time now (a buff's clock). */
export interface GeneratorsCallbackContext {
  readonly now: number;
}

/** A buy mode, as `watchpot/ui`'s `BuyMode`: a fixed count, as many as affordable, or up to the next milestone. */
export type GeneratorBuyMode = number | "max" | "next";

/** One buy row, worked out: how many the mode buys (at least 1, for the price shown), their price, and whether it can. */
export interface GeneratorRow {
  readonly count: number;
  readonly price: Decimal;
  readonly canBuy: boolean;
}

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

/**
 * A generator list's read-only questions over state. A question that reads a callback takes game time as a trailing
 * `now`, handed to the callback as `{ now }`: default the state's `gameNow()` when it carries one (a store's state
 * does), else 0. A screen that reads a buff in `mult` passes the `now` it renders at.
 */
export interface GeneratorsSelect<G> {
  /** Whether it can be bought now. */
  open(state: G, id: string, now?: number): boolean;
  /** How many are owned. */
  owned(state: G, id: string): number;
  /** The price of the next `count` (default 1). */
  price(state: G, id: string, count?: number): Decimal;
  /** How many more the balance covers (0 when it is not open). */
  affordable(state: G, id: string, now?: number): number;
  /**
   * Every milestone reached, its own and the global ones, folded: the product of the mults and of the speeds (1 and
   * 1 while the definition's `milestones` gate is shut).
   */
  boost(state: G, id: string, now?: number): { readonly mult: number; readonly speed: number };
  /** The cycle's length now, after the speed (null for a rate generator). */
  cycleMs(state: G, id: string, now?: number): number | null;
  /** Whether a cycle generator restarts itself. */
  automated(state: G, id: string, now?: number): boolean;
  /** What one cycle pays now, all owned (zero for a rate generator). */
  cyclePays(state: G, id: string, now?: number): Decimal;
  /** What the generator makes a second, all owned, every multiplier applied; a cycle by its average rate. */
  rate(state: G, id: string, now?: number): Decimal;
  /** How many more reach its next milestone, or null past the last. */
  untilMilestone(state: G, id: string): number | null;
  /** What the list makes a second, per currency: rate generators and automated cycles (a hand cycle is not income). */
  perSecond(state: G, now?: number): Record<string, Decimal>;
  /**
   * How an absence counts now: the definition's `away`, or all of it (`{ rate: 1 }`). A game's own produce step runs
   * its catch-up through `offlineCredit(dtMs, away.rate, away.capMs)` to credit what the list is credited.
   */
  away(state: G, now?: number): GeneratorAway;
  /**
   * One buy row for `mode` (`watchpot/ui`'s `BuyMode`): `count` is what the mode buys, at least 1 so the row always
   * shows a price; `price` is the price of `count`; `canBuy` is whether the mode buys anything and the balance covers
   * it (false when it is closed, or for `"next"` past the last milestone).
   */
  row(state: G, id: string, mode: GeneratorBuyMode, now?: number): GeneratorRow;
}

/** The fixed configuration of a generators feature: the list as given, and a generator by id. */
export interface GeneratorsFixed<T extends GeneratorDef> {
  readonly list: readonly T[];
  /** A generator by id. */
  generator(id: string): T | undefined;
}

/**
 * The helpers that take a draft first and change it, named like the actions they mirror, for a recipe or a step (an
 * autobuyer's purchase). `now` reaches the callbacks (default as `select`'s).
 */
export interface GeneratorsDraftHelpers {
  /** Buys exactly `count` (default 1) inside a recipe, or nothing. Returns how many it bought. */
  buy(draft: object, id: string, count?: number, now?: number): number;
  /** Buys as many as the balance covers inside a recipe, `limit` at most. Returns how many. */
  buyMax(draft: object, id: string, limit?: number, now?: number): number;
  /** Buys exactly what reaches the generator's next milestone inside a recipe, or nothing. Returns how many. */
  buyNext(draft: object, id: string, now?: number): number;
  /** Starts a cycle generator's cycle inside a recipe, as the action `run` does. False when it cannot start. */
  run(draft: object, id: string, now?: number): boolean;
}

/** The three namespaces of a generators feature. */
export interface GeneratorsHelpers<G, T extends GeneratorDef> {
  readonly select: GeneratorsSelect<G>;
  readonly def: GeneratorsFixed<T>;
  readonly draft: GeneratorsDraftHelpers;
}

/** A `generators` feature: the feature plus `select`, `def` and `draft`. */
export type GeneratorsFeature<K extends string, G, T extends GeneratorDef> = Feature<
  K,
  GeneratorsState,
  GeneratorActions
> &
  GeneratorsHelpers<G, T>;

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
  R extends ReachShape = readonly [],
> {
  /** The saved key. */
  readonly key: K;
  /** The features the callbacks read, as `feature`'s `reach`; the wallet is reached already. */
  readonly reach?: R | (() => R);
  /** The currencies feature the list buys from and pays into. */
  readonly wallet: CurrenciesFeature<WK, C, WS, WA>;
  readonly list: readonly T[];
  /**
   * The game's multiplier on one generator's output (a stat's value from the `stats` feature, say), read off the
   * whole game state. `ctx.now` is game time, so a buff multiplies here: `(s, g, { now }) => buffActive(s.buffs, "rush", now) ? 2 : 1`.
   */
  readonly mult?: (state: G, def: T, ctx: GeneratorsCallbackContext) => DecimalSource;
  /** Milestones every generator gets once the lowest owned count across the list reaches them. */
  readonly global?: readonly Threshold<GeneratorBoost>[];
  /**
   * Whether a generator's milestones count, its own and the global ones: a rule of the game's that turns them off
   * (a challenge). Default: always.
   */
  readonly milestones?: (state: G, def: T, ctx: GeneratorsCallbackContext) => boolean;
  /** Whether a generator can be bought. Default: always. */
  readonly open?: (state: G, def: T, ctx: GeneratorsCallbackContext) => boolean;
  /** Whether a cycle generator restarts itself (a manager bought). Default: never; `run(id)` starts each cycle. */
  readonly automated?: (state: G, def: T, ctx: GeneratorsCallbackContext) => boolean;
  /** How an absence counts. Default: all of it. */
  readonly away?: (state: G, ctx: GeneratorsCallbackContext) => GeneratorAway;
  readonly reset?: ResetRule<GeneratorsState>;
}

/**
 * A building list as a feature. It saves `{ owned, progress, running }` under `key`, works out `perSecond` in the
 * step `<key>.rates.perSecond` and pays in `<key>.produce.make` (over a tick, and over an absence through `away`),
 * buys from `wallet`. Its auto-player moves buy one of each open generator, valued at the income it adds a second,
 * and start every idle hand cycle for free. A run reset starts the list over (the `free` ones owned again) unless
 * `reset` says otherwise. The callbacks read the whole game state (the feature's own slice, the wallet's and what
 * `reach` names), typed with no annotation.
 */
export function defineGenerators<
  const K extends string,
  T extends GeneratorDef<C>,
  WK extends string,
  C extends string,
  WS extends object,
  WA extends object,
  const R extends ReachShape = readonly [],
  G extends object = Record<K, GeneratorsState> & Record<WK, WS> & ReachOf<R>,
>(
  def: GeneratorsDef<K, T, WK, C, WS, WA, G, R>,
): GeneratorsFeature<K, G, T> & { readonly needs?: NeedsOf<R> } {
  const { list, wallet } = def;
  const byId = new Map<string, T>();
  for (const g of list) {
    if (byId.has(g.id)) throw new Error(`generators "${def.key}": the generator "${g.id}" appears twice`);
    if (g.cycle && !(g.cycle.ms > 0))
      throw new Error(`generators "${def.key}": the cycle of "${g.id}" must be above zero`);
    byId.set(g.id, g);
  }

  type Own = Record<K, GeneratorsState> & CurrencyDraft<WK>;
  type At = GeneratorsCallbackContext;
  const own = (state: unknown): GeneratorsState => (state as Record<K, GeneratorsState>)[def.key];
  const ownedOf = (state: unknown, g: T): number => own(state).owned[g.id] ?? 0;
  const lowest = (state: unknown): number =>
    list.length === 0 ? 0 : Math.min(...list.map((g) => ownedOf(state, g)));
  /** The callbacks' context: `now` as given, else the state's own game clock, else 0. */
  const at = (state: unknown, now?: number): At => ({
    now: now ?? (state as { gameNow?: () => number }).gameNow?.() ?? 0,
  });

  const open = (state: G, g: T, c: At): boolean => def.open?.(state, g, c) ?? true;
  const automated = (state: G, g: T, c: At): boolean =>
    g.cycle !== undefined && (def.automated?.(state, g, c) ?? false);
  const boost = (state: G, g: T, c: At): { mult: number; speed: number } => {
    let mult = 1;
    let speed = 1;
    if (def.milestones && !def.milestones(state, g, c)) return { mult, speed };
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
  const multOf = (state: G, g: T, c: At): Decimal =>
    D(def.mult?.(state, g, c) ?? 1).mul(boost(state, g, c).mult);
  const cycleMs = (state: G, g: T, c: At): number | null =>
    g.cycle ? g.cycle.ms / Math.max(Number.MIN_VALUE, boost(state, g, c).speed) : null;
  /** What one owned makes a second, or pays a cycle. */
  const unit = (state: G, g: T, c: At): Decimal =>
    g.cycle
      ? D(g.cycle.pays).mul(multOf(state, g, c))
      : D(g.rate ?? 0)
          .mul(multOf(state, g, c))
          .mul(boost(state, g, c).speed);
  /** What one owned makes a second, a cycle by its average. */
  const unitRate = (state: G, g: T, c: At): Decimal => {
    const ms = cycleMs(state, g, c);
    return ms === null ? unit(state, g, c) : unit(state, g, c).mul(1000 / ms);
  };
  const rate = (state: G, g: T, c: At): Decimal => unitRate(state, g, c).mul(ownedOf(state, g));
  const perSecond = (state: G, c: At): Record<string, Decimal> => {
    const out: Record<string, Decimal> = {};
    for (const g of list) {
      if (g.cycle && !automated(state, g, c)) continue;
      out[g.makes] = (out[g.makes] ?? ZERO).add(rate(state, g, c));
    }
    return out;
  };
  const untilMilestone = (state: unknown, g: T): number | null => {
    const owned = ownedOf(state, g);
    const next = nextThreshold(g.milestones ?? [], owned);
    return next ? next.at - owned : null;
  };
  const affordable = (state: G, g: T, c: At): number => {
    if (!open(state, g, c)) return 0;
    const held = wallet.select.balance(state as unknown as CurrencyDraft<WK>, g.pays);
    return maxAffordable(g.cost, ownedOf(state, g), held);
  };
  const away = (state: G, c: At): GeneratorAway => def.away?.(state, c) ?? { rate: 1 };

  const select: GeneratorsSelect<G> = {
    open: (state, id, now) => {
      const g = byId.get(id);
      return g !== undefined && open(state, g, at(state, now));
    },
    owned: (state, id) => {
      const g = byId.get(id);
      return g ? ownedOf(state, g) : 0;
    },
    price: (state, id, count = 1) => {
      const g = byId.get(id);
      return g ? costOfMany(g.cost, ownedOf(state, g), count) : ZERO;
    },
    affordable: (state, id, now) => {
      const g = byId.get(id);
      return g ? affordable(state, g, at(state, now)) : 0;
    },
    boost: (state, id, now) => {
      const g = byId.get(id);
      return g ? boost(state, g, at(state, now)) : { mult: 1, speed: 1 };
    },
    cycleMs: (state, id, now) => {
      const g = byId.get(id);
      return g ? cycleMs(state, g, at(state, now)) : null;
    },
    automated: (state, id, now) => {
      const g = byId.get(id);
      return g !== undefined && automated(state, g, at(state, now));
    },
    cyclePays: (state, id, now) => {
      const g = byId.get(id);
      return g?.cycle ? unit(state, g, at(state, now)).mul(ownedOf(state, g)) : ZERO;
    },
    rate: (state, id, now) => {
      const g = byId.get(id);
      return g ? rate(state, g, at(state, now)) : ZERO;
    },
    untilMilestone: (state, id) => {
      const g = byId.get(id);
      return g ? untilMilestone(state, g) : null;
    },
    perSecond: (state, now) => perSecond(state, at(state, now)),
    away: (state, now) => away(state, at(state, now)),
    row: (state, id, mode, now) => {
      const g = byId.get(id);
      const can = g ? affordable(state, g, at(state, now)) : 0;
      const want = mode === "max" ? can : mode === "next" ? (g ? (untilMilestone(state, g) ?? 0) : 0) : mode;
      const whole = Number.isFinite(want) ? Math.max(0, Math.floor(want)) : 0;
      const count = Math.max(1, whole);
      return {
        count,
        price: g ? costOfMany(g.cost, ownedOf(state, g), count) : ZERO,
        canBuy: whole > 0 && can >= whole,
      };
    },
  };

  /** Buys up to `count` inside a recipe: all of them, or (`partial`) what the balance covers. */
  const buyDraft = (draft: Draft<Own>, id: string, count: number, partial: boolean, c: At): number => {
    const g = byId.get(id);
    if (!g || !open(draft as unknown as G, g, c)) return 0;
    const want = Math.max(0, Math.floor(count));
    const purse = draft as unknown as CurrencyDraft<WK>;
    const had = ownedOf(draft, g);
    const n = partial ? maxAffordable(g.cost, had, wallet.select.balance(purse, g.pays), want) : want;
    if (n <= 0 || !wallet.draft.debit(purse, g.pays, costOfMany(g.cost, had, n))) return 0;
    own(draft).owned[g.id] = had + n;
    return n;
  };

  /** Buys what reaches the next milestone inside a recipe. */
  const buyNextDraft = (draft: Draft<Own>, id: string, c: At): number => {
    const g = byId.get(id);
    const until = g ? untilMilestone(draft, g) : null;
    return until === null ? 0 : buyDraft(draft, id, until, false, c);
  };

  /** Starts a cycle inside a recipe. */
  const runDraft = (draft: Draft<Own>, id: string, c: At): boolean => {
    const g = byId.get(id);
    const s = own(draft);
    if (!g?.cycle || ownedOf(draft, g) <= 0 || s.running[g.id] || automated(draft as unknown as G, g, c))
      return false;
    s.running[g.id] = true;
    s.progress[g.id] = 0;
    return true;
  };

  /** Pays every generator over `ms` of credited time. */
  const make = (draft: Draft<Own>, ms: number, c: At): void => {
    if (!(ms > 0)) return;
    const state = draft as unknown as G;
    const purse = draft as unknown as CurrencyDraft<WK>;
    const s = own(draft);
    for (const g of list) {
      const owned = ownedOf(draft, g);
      if (owned <= 0) continue;
      const length = cycleMs(state, g, c);
      if (length === null) {
        wallet.draft.credit(purse, g.makes, rate(state, g, c).mul(ms / 1000));
        continue;
      }
      const auto = automated(state, g, c);
      if (!auto && !s.running[g.id]) continue;
      const step = cyclesIn(s.progress[g.id] ?? 0, ms, length, !auto);
      s.progress[g.id] = step.progress;
      if (step.completed > 0) {
        wallet.draft.credit(purse, g.makes, unit(state, g, c).mul(owned).mul(step.completed));
        if (!auto) s.running[g.id] = false;
      }
    }
  };

  const toNumber = (d: Decimal): number => {
    const n = d.toNumber();
    return Number.isFinite(n) ? n : Number.MAX_VALUE;
  };

  const made = defineFeature<K, GeneratorsState, GeneratorActions, ReachShape, Record<never, never>, Own>({
    reach: def.reach,
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
        const c = { now: api.now() };
        api.set((d) => {
          n = buyDraft(d, id, count, partial, c);
        });
        return n;
      };
      return {
        buy: (id, count = 1) => run(id, count, false) > 0,
        buyMax: (id, limit = Number.POSITIVE_INFINITY) => run(id, limit, true),
        buyNext: (id) => {
          let n = 0;
          const c = { now: api.now() };
          api.set((d) => {
            n = buyNextDraft(d, id, c);
          });
          return n > 0;
        },
        run: (id) => {
          let ok = false;
          const c = { now: api.now() };
          api.set((d) => {
            ok = runDraft(d, id, c);
          });
          return ok;
        },
      };
    },
    steps: {
      rates: {
        perSecond: (d: Draft<Own>, ctx) => {
          own(d).perSecond = perSecond(d as unknown as G, { now: ctx.now });
        },
      },
      produce: {
        make: {
          pass: "both",
          run: (d: Draft<Own>, ctx) => {
            const c = { now: ctx.now };
            if (ctx.pass === "tick") return make(d, ctx.dtMs, c);
            const a = away(d as unknown as G, c);
            make(d, offlineCredit(ctx.dtMs, a.rate, a.capMs ?? Number.POSITIVE_INFINITY).creditedMs, c);
          },
        },
      },
    },
    moves: (s) => {
      const state = s as unknown as G;
      const out: Move<typeof s>[] = [];
      const actions = (store: { getState(): unknown }) =>
        (store.getState() as Record<K, GeneratorActions>)[def.key];
      for (const g of list) {
        if (!open(state, g, at(s))) continue;
        out.push({
          id: `${def.key}:${g.id}`,
          cost: { currency: g.pays, amount: costAt(g.cost, ownedOf(s, g)) },
          worth: (st) => toNumber(unitRate(st as unknown as G, g, at(st))),
          apply: (store) => actions(store).buy(g.id),
        });
        if (g.cycle && ownedOf(s, g) > 0 && !own(s).running[g.id] && !automated(state, g, at(s)))
          out.push({
            id: `${def.key}:run:${g.id}`,
            // Worth what the cycle pays; never nothing, so the auto-player starts even a cycle that pays little.
            worth: (st) =>
              Math.max(Number.MIN_VALUE, toNumber(unit(st as unknown as G, g, at(st)).mul(ownedOf(st, g)))),
            apply: (store) => actions(store).run(g.id),
          });
      }
      return out;
    },
  });
  const helpers: GeneratorsHelpers<G, T> = {
    select,
    def: { list, generator: (id) => byId.get(id) },
    draft: {
      buy: (draft, id, count = 1, now) => buyDraft(draft as Draft<Own>, id, count, false, at(draft, now)),
      buyMax: (draft, id, limit = Number.POSITIVE_INFINITY, now) =>
        buyDraft(draft as Draft<Own>, id, limit, true, at(draft, now)),
      buyNext: (draft, id, now) => buyNextDraft(draft as Draft<Own>, id, at(draft, now)),
      run: (draft, id, now) => runDraft(draft as Draft<Own>, id, at(draft, now)),
    },
  };
  return Object.assign(made, helpers) as GeneratorsFeature<K, G, T> & { readonly needs?: NeedsOf<R> };
}
