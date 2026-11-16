import { Decimal } from "../decimal";
import { LayerQuery } from "./query";
import type { LayerDef, LayerModelDef, LayerResourceRef, LayerState, LayersState } from "./types";
/**
 * The layer rules: pure functions over a plain layer state (an immer draft inside a store, a plain object in a test
 * or a sim). Each rule writes the state it is given and reads it through a fresh query, since a query caches what it
 * works out. `layerModel(def)` checks and indexes the definitions once and returns the rules over them.
 */
/** The rules and readers of one set of layer definitions. */
export interface LayerModel<L extends string, S extends string, B extends string> {
    readonly def: LayerModelDef<L, S, B>;
    /** Every layer, in definition order (lowest row first). */
    readonly list: readonly LayerDef<L, S, B>[];
    /** A layer's definition; throws on an unknown id. */
    layer(id: L): LayerDef<L, S, B>;
    /** A new state: nothing held, the lowest row sighted. */
    fresh(): LayersState<L>;
    /** One layer's fresh state. */
    freshLayer(id: L): LayerState;
    /** The query over a finished state, cached per state object (a draft gets a new, uncached one). */
    query(state: LayersState<L>): LayerQuery<L, S, B>;
    /** A new, uncached query: for a state that is about to change. */
    read(state: LayersState<L>): LayerQuery<L, S, B>;
    /** What a resource reference holds now. */
    resource(state: LayersState<L>, ref: LayerResourceRef<L, B>): Decimal;
    /**
     * Empties every row beneath `row`: amounts, totals and powers, and upgrades and buyables unless the layer's
     * `keep:` flag is raised (read through `q`, lazily). The base resource goes to 0. Milestones, completions, best,
     * sighted, established, order and reset counts survive.
     */
    wipeBelow(state: LayersState<L>, row: number, q?: LayerQuery<L, S, B>): void;
    /** Resets into a layer: pays its gain and wipes the rows beneath (unless `quiet:`). False when it cannot. */
    resetInto(state: LayersState<L>, id: L): boolean;
    buyUpgrade(state: LayersState<L>, id: L, upgrade: string, q?: LayerQuery<L, S, B>): boolean;
    /** One level, or with `max` every level the resource covers (at most 200). Returns the levels bought. */
    buyLevel(state: LayersState<L>, id: L, buyable: string, max?: boolean): number;
    /** Enters a challenge: wipes the rows beneath its layer; its penalties and mutes hold until completed or left. */
    enterChallenge(state: LayersState<L>, id: L, challenge: string): boolean;
    /** Leaves the challenge entered, uncompleted: wipes beneath its layer again and pays nothing. */
    leaveChallenge(state: LayersState<L>): boolean;
    /** Switches a layer's automation off (`true`) or back on. */
    setManual(state: LayersState<L>, id: L, manual: boolean): void;
    /** Adds a tag once; false when it was already added. */
    tag(state: LayersState<L>, id: string): boolean;
    /**
     * Everything that follows from the state with no time passing, in order: per layer (definition order) sighting
     * and milestones; tags whose `when` holds; the entered challenge completed once the base reaches its goal; then
     * automation, highest row first (and within a row, the later definition first), skipping a layer switched to
     * manual or not yet sighted: `autobuy:` upgrades, `autolevel:` buyables (max), an `auto:` static layer's reset.
     */
    settle(state: LayersState<L>): void;
    /**
     * One step of time: every rate is read off the state before any income lands (the base, each power with its cap,
     * each passive share of a normal layer's raw gain), then all of it lands, `playedMs` moves and the state settles.
     */
    advance(state: LayersState<L>, dtMs: number): void;
    /** Time away: `catchUpSteps` over the model's `away` options, then `advance` once per step. Returns the credited ms. */
    advanceAway(state: LayersState<L>, awayMs: number): number;
}
/** Checks the definitions (throwing on the first problem) and returns the rules over them. */
export declare function layerModel<L extends string, S extends string, B extends string>(def: LayerModelDef<L, S, B>): LayerModel<L, S, B>;
