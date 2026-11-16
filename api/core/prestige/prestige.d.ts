import type { Draft } from "immer";
import { Decimal, type DecimalSource } from "../decimal";
import { type Feature, type FeatureApi, type FeatureSpec, type FeatureSteps, type InitialContext, type Migration, type ResetRule, type ResetRunContext, type StateOf } from "../feature";
import type { RngState } from "../rng";
/**
 * The prestige primitive: a feature that sits above the run. It owns the prestige currency, the lifetime record
 * (every unit ever paid) and the number of resets, and one action that pays the gain and calls the store's
 * `resetRun`. The game says what the reset pays, when it may happen and what follows it; the rest of its
 * prestige layer (a tree to spend on, offers, a phase) is the feature's own extra state and actions.
 */
/** The fields the primitive owns. Never reset: the layer is above the run. */
export interface PrestigeCore {
    /** Resets so far; the first run has 0. */
    runs: number;
    /** Unspent prestige currency. */
    currency: Decimal;
    /** Every unit ever paid. */
    lifetime: Decimal;
}
/** What `afterReset` is told: the gain paid, the game time the reset ran at, and the reset's number (from 1). */
export interface PrestigeResult {
    readonly gain: Decimal;
    readonly now: number;
    readonly run: number;
}
/** The reset action: pays the gain and resets the run at game time `now` (default: now). Returns whether it ran. */
export type PrestigeReset = (now?: number) => boolean;
/** The definition `prestige` takes: key, gain, the reset hooks, and the layer's own state, actions and steps. */
export interface PrestigeDef<K extends string, N extends string, X extends object, A extends object, R extends readonly FeatureSpec[], G extends object> {
    /** The saved key. */
    readonly key: K;
    /** The reset action's name on the feature (default `"reset"`). */
    readonly action?: N;
    readonly reach?: R;
    /** The feature's own fields beside `runs`, `currency` and `lifetime`. */
    readonly initial?: (ctx: InitialContext) => X;
    /** What a reset pays now. Pure: the preview and the reset both read it. */
    readonly gain: (draft: Draft<G>) => Decimal;
    /**
     * Whether the reset may happen. It sees the draft inside the reset's recipe and may settle it first (the write
     * stands even when it refuses). Default: the gain is above zero.
     */
    readonly canReset?: (draft: Draft<G>) => boolean;
    /** Writes after the check and before the gain is read (end what the gain should count), at game time `now`. */
    readonly beforeReset?: (draft: Draft<G>, now: number) => void;
    /** Writes after the run is reset and `runs` counted (a phase, a record of what was paid). */
    readonly afterReset?: (draft: Draft<G>, result: PrestigeResult) => void;
    /**
     * The rng label of reset number `run` (from 1), so a seeded store's runs draw the same on every load.
     * Default: `run<n>`.
     */
    readonly runLabel?: (run: number) => string;
    /**
     * How deep the reset reaches (default 1). A layer above another resets at depth 2: it also resets every feature
     * whose rule says `{ depth: 2 }`, the layer beneath it among them.
     */
    readonly depth?: number;
    /**
     * What a reset does to this layer's own state (default `"never"`: a layer is above the run). A layer with another
     * above it says `{ depth: 2 }`, so the higher layer's reset starts it over.
     */
    readonly reset?: ResetRule<PrestigeCore & X>;
    /** The feature's own actions beside the reset; `reset` is the reset action, to wrap or call. */
    readonly actions?: (api: FeatureApi<G>, reset: PrestigeReset) => A;
    readonly steps?: FeatureSteps<G>;
    readonly transient?: readonly (keyof X & string)[];
    readonly migrations?: Readonly<Record<number, Migration>>;
    readonly merge?: (merged: PrestigeCore & X, fresh: PrestigeCore & X) => PrestigeCore & X;
}
/** What the draft helper needs from the recipe it runs in: the game time, and the run reset (a step's `ctx.resetRun`). */
export interface PrestigeDraftContext {
    readonly now: number;
    resetRun(draft: object, ctx?: ResetRunContext): void;
    /** The reset's rng; left out, the reset draws its own default. */
    readonly rng?: RngState;
}
/** A prestige layer's draft helper. */
export interface PrestigeHelpers {
    /**
     * The reset inside a recipe or a step (an autobuyer that resets for the player): the same checks, gain, run reset
     * and hooks as the action. Returns whether it ran.
     */
    resetDraft(draft: object, ctx: PrestigeDraftContext): boolean;
}
/**
 * Declares a prestige layer. Its state is `PrestigeCore` plus the extras `initial` returns; its actions are the
 * reset under `action`'s name plus its own. The reset, inside one recipe: `canReset`, `beforeReset`, the gain
 * added to `currency` and `lifetime`, the store's `resetRun` at `now` with the rng `runLabel(runs + 1)`, `runs`
 * counted, `afterReset`.
 */
export declare function prestige<const K extends string, X extends object = Record<never, never>, A extends object = Record<never, never>, const N extends string = "reset", const R extends readonly FeatureSpec[] = readonly [], G extends object = Record<K, PrestigeCore & X> & StateOf<R>>(def: PrestigeDef<K, N, X, A, R, G>): Feature<K, PrestigeCore & X, Record<N, PrestigeReset> & A> & PrestigeHelpers;
/** The standing multiplier lifetime currency gives: `1 + k × lifetime ^ exp`. Exactly 1 with nothing earned. */
export declare function lifetimeMultiplier(lifetime: Decimal, t: {
    k: number;
    exp: number;
}): number;
/**
 * The usual prestige curve: `floor(k × (amount / per) ^ exp × mult)`, never negative. `per` is the amount that
 * pays `k`; an `exp` below 1 makes each further `per` worth a little less.
 */
export declare function powerGain(amount: Decimal, t: {
    k: number;
    exp: number;
    per: DecimalSource;
    mult?: DecimalSource;
}): Decimal;
/**
 * How fast a reset would grow what it pays into, in orders of magnitude a second:
 * `log10(1 + gain / kept) / seconds`. While the gain is small beside what is kept this is the gain a second (over
 * `kept × ln 10`), so its peak is the best rate; while the gain dwarfs what is kept it is the leap a second, so a
 * reset worth many times everything held is taken once it stops leaping rather than sat in. One figure for "reset
 * now?" on both sides: track its best since the last reset and reset when it falls to a share of that. `floorS` is
 * the least seconds counted (default 1): before it the pace only rises, so nothing peaks in its first moments.
 */
export declare function resetPace(gain: Decimal, kept: Decimal, seconds: number, floorS?: number): number;
