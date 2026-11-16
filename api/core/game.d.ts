import { type ClockFeature, type ClockLens, type ClockSpec } from "./clock-feature";
import type { DataOf, FeatureApi, FeatureSpec, Migration, NeedsOfAll, StateOf } from "./feature";
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
/** The feature tuple the game ends up with: the built-in clock joins it when the game names no clock fields. */
export type FeaturesOf<F extends readonly FeatureSpec[], C> = C extends undefined ? [...F, ClockFeature] : F;
/**
 * Checks every reach given by type against the features listed: `unknown` when each key named exists with that
 * state, else a shape no feature list satisfies, whose text is the error.
 */
export type ReachCheck<F extends readonly FeatureSpec[]> = DataOf<F> extends NeedsOfAll<F> ? unknown : {
    readonly "a feature reaches, by type, state this game does not have": NeedsOfAll<F>;
};
/** The definition `defineGame` takes: id, save key and version, features, clock, vocabulary and the game's extras. */
export interface GameDef<F extends readonly FeatureSpec[], R extends object, C extends ClockSpec<F> | undefined, G extends object, V extends AnyVocab | undefined> {
    readonly id: string;
    readonly save: SaveSpec;
    readonly features: F & ReachCheck<F>;
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
 * Declares a game: its features in order and where its clock lives.
 *
 * Steps run phase by phase (`PHASES`), whatever the list says; inside one phase they run in feature-list order
 * unless a step says `after` or `before`. A step that acts on what another step of the same phase wrote names it
 * (`after: "wallet"`); a value worked out from the state is a `derived` value instead, which needs no order.
 *
 * Checks at definition time, naming the feature in the error: keys are unique, transient and kept keys exist in
 * `initial`, no action or derived value is named like a key of its feature's `initial` (or a game action like a
 * feature's key), every `after` and `before` names a feature or a step of the same phase and they do not go
 * round, and the migrations, when there are any, step through every version from the oldest they declare to the
 * save's. It calls every `initial` and builds every `actions` once to check them, so both stay pure and cheap.
 */
export declare function defineGame<const F extends readonly FeatureSpec[], R extends object = Record<never, never>, C extends ClockSpec<F> | undefined = undefined, G extends object = StateOf<FeaturesOf<F, C>>, V extends AnyVocab | undefined = undefined>(def: GameDef<F, R, C, G, V>): Game<FeaturesOf<F, C>, R, V>;
