import type { Draft } from "immer";
import type { CurrenciesFeature, Purse } from "./currencies";
import { type Decimal, type DecimalSource } from "./decimal";
import { type Feature, type NeedsOf, type ReachOf, type ReachShape, type ResetRule } from "./feature";
/**
 * Recipes: crafting, inputs to outputs. A recipe takes amounts of some currencies and gives amounts of others, all
 * or nothing, as many times over as asked; a yield multiplier scales what it gives. The pure rules work over a
 * `Purse` that can also be credited; `defineCrafting({ key, wallet, list })` is a feature over a currencies feature, with
 * an optional timed queue: a recipe with `takesMs` makes one at a time on game time, so a queue finishes during an
 * absence.
 */
/** An amount per currency; a currency absent is none. */
export type Amounts<C extends string = string> = {
    readonly [P in C]?: DecimalSource;
};
/** What a recipe takes and gives, per craft. */
export interface Recipe<C extends string = string> {
    readonly inputs: Amounts<C>;
    readonly outputs: Amounts<C>;
}
/** A purse that can also be credited: what a craft pays from and pays into. */
export interface CraftPurse<C extends string = string> extends Purse<C> {
    credit(currency: C, amount: DecimalSource): void;
}
/** Whether the purse covers every input of `times` crafts (at least one). */
export declare function canCraft<C extends string>(recipe: Recipe<C>, purse: Purse<C>, times?: number): boolean;
/**
 * How many crafts the purse covers, `limit` at most: the fewest whole crafts any input allows. A recipe that takes
 * nothing is bounded by `limit` alone (0 without one).
 */
export declare function maxCraftable<C extends string>(recipe: Recipe<C>, purse: Purse<C>, limit?: number): number;
/**
 * Takes the inputs of `times` crafts from the purse, all or nothing: false, with nothing taken, when it is short (a
 * purse that refuses a debit the check passed, by a rule of its own, gets back what was already taken).
 */
export declare function payRecipe<C extends string>(recipe: Recipe<C>, purse: CraftPurse<C>, times?: number): boolean;
/** Credits the outputs of `times` crafts, scaled by `yieldMult`. Returns what was made. */
export declare function giveRecipe<C extends string>(recipe: Recipe<C>, purse: Pick<CraftPurse<C>, "credit">, times?: number, yieldMult?: DecimalSource): Partial<Record<C, Decimal>>;
/**
 * Crafts `times` over: takes every input, gives every output scaled by `yieldMult`, and returns what was made, or
 * null (nothing touched) when the purse is short. Multi-input, multi-output, Decimal amounts.
 */
export declare function craft<C extends string>(recipe: Recipe<C>, purse: CraftPurse<C>, times?: number, yieldMult?: DecimalSource): Partial<Record<C, Decimal>> | null;
/** One recipe of a crafting feature. The game's own fields (a name, a line) ride along. */
export interface RecipeDef<C extends string, G> extends Recipe<C> {
    readonly id: string;
    /** Whether it can be crafted now. Default: always. */
    readonly unlocked?: (state: G) => boolean;
    /** The multiplier on its outputs, read when they are given (default 1). */
    readonly yield?: (state: G) => DecimalSource;
    /**
     * How long one craft takes: the inputs are paid at once and the outputs given one at a time on game time. A
     * function of the state is read at each pass (a queue that speeds up): the craft under way keeps the progress it
     * has made, and the rest runs at the new time from that pass on.
     */
    readonly takesMs?: number | ((state: G) => number);
}
/**
 * A timed recipe's crafts under way: how many were asked, how many are given, and when the first began. For a
 * recipe whose time reads the state, `msEach` is the time per craft the job was last worked at, and `startedAt` is
 * where the job would have begun had every craft taken that long.
 */
export interface CraftJob {
    recipe: string;
    times: number;
    done: number;
    startedAt: number;
    msEach?: number;
}
/** The feature's saved state. */
export interface CraftingState {
    /** Crafts given per recipe id. */
    made: Record<string, Decimal>;
    /** Timed recipes under way, one job per recipe. */
    queue: CraftJob[];
}
/** Called once per batch of crafts given (instant, or off the queue in one pass), with how many. */
export type OnCraft<C extends string, G> = (draft: Draft<G>, recipe: RecipeDef<C, G>, times: number, now: number) => void;
/** The feature's actions. */
export interface CraftingActions {
    /** Crafts `times` (default 1), all or nothing: given now, or queued for a timed recipe. */
    craft(id: string, times?: number): boolean;
    /** Crafts as many as the wallet covers. Returns how many. */
    craftMax(id: string): number;
}
/** A crafting list's read-only questions over state. */
export interface CraftingSelect<G> {
    /** Whether it is unlocked now. */
    open(state: G, id: string): boolean;
    /** How many the wallet covers now (0 when locked). */
    craftable(state: G, id: string): number;
    /** A timed recipe's job, or null. */
    job(state: G, id: string): CraftJob | null;
    /** Ms until a timed recipe's next craft is given, or null when none is under way. */
    nextInMs(state: G, id: string, now: number): number | null;
}
/** The fixed configuration of a crafting feature: the recipes as given, and a recipe by id. */
export interface CraftingFixed<C extends string, G> {
    readonly list: readonly RecipeDef<C, G>[];
    /** A recipe by id. */
    recipe(id: string): RecipeDef<C, G> | undefined;
}
/**
 * The helpers that take a draft first and change it, named like the actions they mirror, for a step or a game's own
 * action. A timed craft starts at `now` (default the state's `gameNow()` when it carries one, else 0).
 */
export interface CraftingDraftHelpers {
    /** Crafts `times` (default 1) inside a recipe, all or nothing, as the action: false when locked or short. */
    craft(draft: object, id: string, times?: number, now?: number): boolean;
    /** Crafts as many as the wallet covers inside a recipe. Returns how many. */
    craftMax(draft: object, id: string, now?: number): number;
}
/** The three namespaces of a crafting feature. */
export interface CraftingHelpers<C extends string, G> {
    readonly select: CraftingSelect<G>;
    readonly def: CraftingFixed<C, G>;
    readonly draft: CraftingDraftHelpers;
}
/** A `crafting` feature: the feature plus `select`, `def` and `draft`. */
export type CraftingFeature<K extends string, C extends string, G> = Feature<K, CraftingState, CraftingActions> & CraftingHelpers<C, G>;
/**
 * Crafting as a feature over a currencies feature. It saves `{ made, queue }` under `key`. An instant recipe takes and
 * gives in the action's recipe. A timed recipe (`takesMs`) takes its inputs at once and joins its recipe's job (a
 * second craft of it extends the job); the step `<key>.produce.queue` gives each craft as its time passes, one at a
 * time, over a tick and over an absence alike. `onCraft` hears every batch given. A prestige reset clears it unless
 * `reset` says otherwise. The callbacks read the whole game state (the feature's own slice, the wallet's and what
 * `reach` names), typed with no annotation.
 */
export declare function defineCrafting<const K extends string, WK extends string, C extends string, WS extends object, WA extends object, const R extends ReachShape = readonly [], G extends object = Record<K, CraftingState> & Record<WK, WS> & ReachOf<R>>(def: {
    readonly key: K;
    /** The features the callbacks read, as `feature`'s `reach`; the wallet is reached already. */
    readonly reach?: R | (() => R);
    readonly wallet: CurrenciesFeature<WK, C, WS, WA>;
    readonly list: readonly RecipeDef<C, G>[];
    readonly reset?: ResetRule<CraftingState>;
    /** Called once per batch of crafts given, instant or off the queue, inside the recipe that gives them. */
    readonly onCraft?: OnCraft<C, G>;
}): CraftingFeature<K, C, G> & {
    readonly needs?: NeedsOf<R>;
};
