import type { Draft } from "immer";
import type { CurrenciesFeature } from "./currencies";
import { type Decimal, type DecimalSource } from "./decimal";
import { type Feature, type NeedsOf, type ReachOf, type ReachShape, type ResetRule } from "./feature";
import type { CallbackContext } from "./gauge";
import { type RngState } from "./rng";
/**
 * The clicker: a press pays a currency. What one press pays is the game's (`power`, often a base plus a share of
 * income per second, `clickShare`); on top of it a press may crit (rolled on the feature's own saved rng stream, so a
 * reload cannot reroll it) and may ride a combo, a streak multiplier that grows while presses land close together
 * and falls back to 1 after a pause. `maxPerSecond` drops presses past a cap, against an auto-clicker. Every time is
 * game time.
 */
/** A crit: the chance a press crits (0 to 1) and what a crit multiplies it by. */
export interface ClickCrit {
    readonly chance: number;
    readonly mult: DecimalSource;
}
/** A combo: each press within `windowMs` of the last adds `step` to the multiplier, up to `max`; after it, 1 again. */
export interface ClickCombo {
    readonly windowMs: number;
    readonly step: number;
    readonly max: number;
}
/** The clicker's saved state. */
export interface ClickerState {
    /** Presses paid, ever. */
    clicks: number;
    /** What presses paid, ever. */
    earned: Decimal;
    /** The most one press paid, ever. */
    best: Decimal;
    /** Crits, ever. */
    crits: number;
    /** Presses paid this run. */
    runClicks: number;
    /** What presses paid this run. */
    runEarned: Decimal;
    /** The combo multiplier the last press paid at (1 without a combo). */
    combo: number;
    /** Game time of the last press paid (0 for none). */
    lastAt: number;
    /** The crit stream. */
    rng: RngState;
    /** The start of the current one-second window, for `maxPerSecond`. */
    windowAt: number;
    /** Presses paid inside the current window. */
    windowCount: number;
}
/** What one press paid: the amount, whether it crit, and the combo multiplier it paid at. */
export interface ClickResult {
    readonly amount: Decimal;
    readonly crit: boolean;
    readonly combo: number;
}
/** The clicker's actions. */
export interface ClickerActions {
    /** One press at game time now: what it paid, or null when the rate cap dropped it. */
    click(): ClickResult | null;
}
/** "A base plus a share of income per second": `base + perSecond × share`. */
export declare function clickShare(base: DecimalSource, perSecond: DecimalSource, share: number): Decimal;
/** The combo a press at `now` would pay at: one step up inside the window, else 1. */
export declare function comboAt(state: Pick<ClickerState, "combo" | "lastAt">, now: number, combo?: ClickCombo): number;
/** The combo shown at `now`: the last press's, until its window runs out. */
export declare function comboShown(state: Pick<ClickerState, "combo" | "lastAt">, now: number, combo?: ClickCombo): number;
/** A state holding the clicker's slice under its key. */
export type ClickerSlice<K extends string> = {
    readonly [P in K]: Pick<ClickerState, "combo" | "lastAt">;
};
/** The clicker's read-only questions over state. `now` is game time (default the state's `gameNow()`, else 0). */
export interface ClickerSelect<K extends string, G> {
    /** What one press would pay now, before the combo and a crit: the definition's `power`. */
    power(state: G, now?: number): Decimal;
    /** The combo a press at `now` would pay at: one step up inside the window, else 1 (`comboAt` over the slice). */
    comboAt(state: ClickerSlice<K>, now: number): number;
    /** The combo shown at `now`: the last press's, until its window runs out (`comboShown` over the slice). */
    comboShown(state: ClickerSlice<K>, now: number): number;
}
/** The fixed configuration of a clicker feature. */
export interface ClickerFixed {
    /** The combo rule, when there is one. */
    readonly combo: ClickCombo | undefined;
}
/** The helpers that take a draft first and change it, named like the actions they mirror. */
export interface ClickerDraftHelpers {
    /** One press at `now` inside a recipe, paid to the wallet. Null when the rate cap dropped it. */
    click(draft: object, now: number): ClickResult | null;
}
/** The three namespaces of a clicker feature. */
export interface ClickerHelpers<K extends string, G> {
    readonly select: ClickerSelect<K, G>;
    readonly def: ClickerFixed;
    readonly draft: ClickerDraftHelpers;
}
/** A `clicker` feature: the feature plus `select`, `def` and `draft`. */
export type ClickerFeature<K extends string, G = object> = Feature<K, ClickerState, ClickerActions> & ClickerHelpers<K, G>;
/** The definition `clicker` takes. */
export interface ClickerDef<K extends string, WK extends string, C extends string, WS extends object, WA extends object, G extends object, R extends ReachShape = readonly []> {
    /** The saved key. */
    readonly key: K;
    /** The features the callbacks read, as `feature`'s `reach`; the wallet is reached already. */
    readonly reach?: R | (() => R);
    /** The currencies feature a press pays into. */
    readonly wallet: CurrenciesFeature<WK, C, WS, WA>;
    readonly currency: C;
    /** What one press pays before a crit and the combo, read off the whole game state at the press's game time. */
    readonly power: (state: G, ctx: CallbackContext) => DecimalSource;
    /** The crit, read off the whole game state at the press's game time. None without it. */
    readonly crit?: (state: G, ctx: CallbackContext) => ClickCrit;
    readonly combo?: ClickCombo;
    /** The most presses paid in one second of game time; the rest are dropped. No cap without it. */
    readonly maxPerSecond?: number;
    /** Runs in the same recipe as a press pays. */
    readonly onClick?: (draft: Draft<G>, result: ClickResult, now: number) => void;
    /** Default: a run reset clears the run counters and the combo, and keeps the lifetime totals and the stream. */
    readonly reset?: ResetRule<ClickerState>;
}
/**
 * A press that pays as a feature. It saves `ClickerState` under `key`, and its action `click()` pays `power(state)`
 * × the combo × the crit's `mult` (on a crit) into `wallet`. No steps. Its auto-player move is a free `click` worth `power`
 * that goes through once per look (it refuses a second press at the same game time), so the sim's look
 * cadence is the click rate. The callbacks read the whole game state (the feature's own slice, the wallet's and what
 * `reach` names), typed with no annotation.
 */
export declare function clicker<const K extends string, WK extends string, C extends string, WS extends object, WA extends object, const R extends ReachShape = readonly [], G extends object = Record<K, ClickerState> & Record<WK, WS> & ReachOf<R>>(def: ClickerDef<K, WK, C, WS, WA, G, R>): ClickerFeature<K, G> & {
    readonly needs?: NeedsOf<R>;
};
