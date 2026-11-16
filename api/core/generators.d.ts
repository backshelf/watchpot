import { type CostCurve, type Threshold } from "./cost";
import type { CurrenciesFeature } from "./currencies";
import { type Decimal, type DecimalSource } from "./decimal";
import type { DimensionAway } from "./dimensions";
import { type Feature, type ResetRule } from "./feature";
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
export declare function cyclesIn(progress: number, dtMs: number, cycleMs: number, once?: boolean): CycleStep;
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
 * A generator list's rules, read off the game state. A rule that reads a callback takes game time as a trailing
 * `now`, handed to the callback as `{ now }`: default the state's `gameNow()` when it carries one (a store's state
 * does), else 0. A screen that reads a buff in `mult` passes the `now` it renders at.
 */
export interface GeneratorRules<G, T extends GeneratorDef> {
    readonly list: readonly T[];
    /** A generator by id. */
    generator(id: string): T | undefined;
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
    boost(state: G, id: string, now?: number): {
        readonly mult: number;
        readonly speed: number;
    };
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
/**
 * The draft helpers, for a recipe or a step (an autobuyer's purchase). Each returns how many it bought. `now` reaches
 * the `open` callback (default as the rules').
 */
export interface GeneratorHelpers {
    /** Buys exactly `count` (default 1) inside a recipe, or nothing. */
    buy(draft: object, id: string, count?: number, now?: number): number;
    /** Buys as many as the balance covers inside a recipe, `limit` at most. */
    buyMax(draft: object, id: string, limit?: number, now?: number): number;
}
/** A `generators` feature, carrying its rules as `.rules` and the draft helpers `buy` and `buyMax`. */
export type GeneratorsFeature<K extends string, G, T extends GeneratorDef> = Feature<K, GeneratorsState, GeneratorActions> & GeneratorHelpers & {
    readonly rules: GeneratorRules<G, T>;
};
/** The share of an absence the list is credited, and the most of it that counts. */
export type GeneratorAway = DimensionAway;
/** The definition `generators` takes. */
export interface GeneratorsDef<K extends string, T extends GeneratorDef<C>, WK extends string, C extends string, WS extends object, WA extends object, G extends object> {
    /** The saved key. */
    readonly key: K;
    /** The currencies feature the list buys from and pays into. */
    readonly wallet: CurrenciesFeature<WK, C, WS, WA>;
    readonly list: readonly T[];
    /**
     * The game's multiplier on one generator's output (its stat bus), read off the whole game state. `ctx.now` is game
     * time, so a buff multiplies here: `(s, g, { now }) => buffActive(s.buffs, "rush", now) ? 2 : 1`.
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
 * buys from `wallet` and carries its rules as `.rules`. Its auto-player moves buy one of each open generator,
 * valued at the income it adds a second, and start every idle hand cycle for free. A run reset starts the list
 * over (the `free` ones owned again) unless `reset` says otherwise. The callbacks read the whole game state, so
 * annotate one of them with the game's state type.
 */
export declare function generators<const K extends string, T extends GeneratorDef<C>, WK extends string, C extends string, WS extends object, WA extends object, G extends object = object>(def: GeneratorsDef<K, T, WK, C, WS, WA, G>): GeneratorsFeature<K, G, T>;
export {};
