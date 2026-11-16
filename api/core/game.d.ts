import { type ClockFeature, type ClockLens, type ClockSpec } from "./clock-feature";
import type { FeatureApi, FeatureSpec, Migration, Phase, StateOf } from "./feature";
import type { AnyVocab } from "./vocab";
/**
 * The save's key in the storage, its version, and the game's own migrations over the whole saved state, keyed by
 * the version each produces (`3` takes a save at 2 to 3). With the features' own, they run on load and import.
 */
export interface SaveSpec {
    readonly key: string;
    readonly version: number;
    readonly migrations?: Readonly<Record<number, Migration>>;
}
/**
 * Per phase, the step ids (`<featureKey>.<phase>.<name>`) that run first, in this order; the phase's other
 * steps follow in feature-list order (the clock's last).
 */
export type StepOrder = {
    readonly [P in Phase]?: readonly string[];
};
/** The feature tuple the game ends up with: the built-in clock joins it when the game names no clock fields. */
export type FeaturesOf<F extends readonly FeatureSpec[], C> = C extends undefined ? [...F, ClockFeature] : F;
/** The definition `defineGame` takes: id, save key and version, features, clock, vocabulary and the game's extras. */
export interface GameDef<F extends readonly FeatureSpec[], R extends object, C extends ClockSpec<F> | undefined, G extends object, V extends AnyVocab | undefined> {
    readonly id: string;
    readonly save: SaveSpec;
    readonly features: F;
    readonly order?: StepOrder;
    /** Where the clock's fields already live; omitted, the engine keeps them under `clock`. */
    readonly clock?: C;
    /** Actions at the store's root, beside the engine's (`tick`, `catchUp`, …). */
    readonly actions?: (api: FeatureApi<G>) => R;
    /** The game's words (`vocab({ currencies, stats, rarities })`); a feature built over a vocabulary must name this one. */
    readonly vocab?: V;
}
/** A game. `V` is its vocabulary, or undefined when it declares none; written without it, any game. */
export interface Game<F extends readonly FeatureSpec[], R extends object = Record<never, never>, V extends AnyVocab | undefined = AnyVocab | undefined> {
    readonly id: string;
    readonly save: SaveSpec;
    readonly features: F;
    readonly order: StepOrder;
    readonly clock: ClockLens;
    readonly actions: (api: never) => R;
    readonly vocab: V;
}
/** A game's vocabulary type, for `CurrencyOf<GameVocab<typeof game>>` and the like. */
export type GameVocab<G> = G extends {
    readonly vocab: infer V extends AnyVocab;
} ? V : never;
/** Any game, as the runner and the store take it. */
export type AnyGame = Game<readonly FeatureSpec[], object>;
/**
 * Declares a game: its features in order, where its clock lives, and which steps run first in a phase.
 *
 * Steps run phase by phase (`PHASES`), whatever the list says; the feature list ranks steps only inside one phase,
 * after the ids `order` pulls to the front. A step that reads a slice another feature writes later in the same
 * phase reads the value from the pass before: put the writer in an earlier phase, earlier in the list, or in
 * `order`.
 *
 * Checks at definition time, naming the feature in the error: keys are unique, transient and kept keys exist in
 * `initial`, no action is named like a key of its feature's `initial` (or a game action like a feature's key),
 * every id in `order` is a step its feature (or the clock) declares in that phase, and the migrations, when there
 * are any, step through every version from the oldest they declare to the save's. It calls every `initial` and
 * builds every `actions` once to check them, so both stay pure and cheap.
 */
export declare function defineGame<const F extends readonly FeatureSpec[], R extends object = Record<never, never>, C extends ClockSpec<F> | undefined = undefined, G extends object = StateOf<FeaturesOf<F, C>>, V extends AnyVocab | undefined = undefined>(def: GameDef<F, R, C, G, V>): Game<FeaturesOf<F, C>, R, V>;
