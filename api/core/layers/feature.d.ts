import { type Decimal } from "../decimal";
import { type Feature, type Migration } from "../feature";
import { type LayerModel } from "./rules";
import type { LayerModelDef, LayersState } from "./types";
/**
 * The layers feature: a layer model saved under one key. Its own resets are the system's: the store's run reset
 * never touches it (`reset: "never"`). Every action applies a rule to the draft and, when the rule went through,
 * settles what follows (sightings, milestones, a completion, automation).
 */
/** The layers feature's actions. */
export interface LayersActions<L extends string> {
    /** Resets into a layer; false when it cannot. */
    reset(id: L): boolean;
    /** Buys an upgrade from a layer's shop. */
    buy(id: L, upgrade: string): boolean;
    /** Buys a level of a buyable (every level the resource covers with `max`); returns the levels bought. */
    level(id: L, buyable: string, max?: boolean): number;
    /** Enters a challenge. */
    enter(id: L, challenge: string): boolean;
    /** Leaves the challenge entered, uncompleted. */
    leave(): boolean;
    /** Switches a layer's automation off (`true`) or back on. */
    manual(id: L, off: boolean): void;
    /** Adds a tag by hand (one without a `when`, or ahead of it). */
    tag(id: string): boolean;
}
/** What `layers` takes: the model's definition, the saved key and the save's migrations. */
export interface LayersDef<K extends string, L extends string, S extends string, B extends string> extends LayerModelDef<L, S, B> {
    readonly key: K;
    readonly migrations?: Readonly<Record<number, Migration>>;
}
/** Any state or draft holding the layers' state under its key. */
export type LayersHost<K extends string, L extends string> = {
    readonly [P in K]: LayersState<L>;
};
/** The read-only questions over state. */
export interface LayersSelect<K extends string, L extends string> {
    /** What a game state holds of a resource (the auto-player's `balance`): the base, a layer's amount or a power. */
    balance(state: LayersHost<K, L>, currency: string): Decimal;
}
/** The fixed configuration of a layers feature. */
export interface LayersFixed<L extends string, S extends string, B extends string> {
    /** The layer model: its rules and its query, pure over the saved `LayersState` (`def.model.query(state.climb)`). */
    readonly model: LayerModel<L, S, B>;
}
/** The layers feature: the feature plus `select`, `def` and `draft` (which is empty: the actions are the changes). */
export type LayersFeature<K extends string, L extends string, S extends string, B extends string> = Feature<K, LayersState<L>, LayersActions<L>> & {
    readonly select: LayersSelect<K, L>;
    readonly def: LayersFixed<L, S, B>;
    readonly draft: Record<never, never>;
};
/**
 * A layer system as a feature. Saves `LayersState` under `key`, loads an older save through `fillDeep` (a layer or a
 * field added since takes its fresh value; a challenge entered in a layer that is gone is dropped), and steps it:
 * `<key>.produce.advance` on every tick, `<key>.produce.away` over an absence (`advanceAway`). The rules and the
 * query are `def.model`; `select.balance` reads a resource off a game state.
 *
 * Its auto-player moves, valued simply: every upgrade and buyable level it can afford (and is not automated) is worth
 * 1, so the auto-player buys the cheapest share of each balance first; a reset is a free move worth its row (the
 * highest first), taken when a static layer is not `auto:` (or is switched to manual), or when a normal layer is not
 * established yet or would pay at least what it holds. Challenges are never entered.
 */
export declare function layers<const K extends string, L extends string, S extends string, const B extends string>(def: LayersDef<K, L, S, B>): LayersFeature<K, L, S, B>;
