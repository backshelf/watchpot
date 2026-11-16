import { Decimal, type DecimalSource } from "../decimal";
import { type LiveBreakdown, type LiveIndex, type StatPart } from "../graph/live";
import type { AnyLayerFlag, LayerBuyableDef, LayerChallengeDef, LayerDef, LayerModelDef, LayerMuteGroup, LayerResourceRef, LayerState, LayersState, LayerUpgradeDef } from "./types";
/**
 * The query: every question the rules and a screen ask of one layer state. What a stat comes to and why, what a
 * reset would pay, what the next unit needs, where a layer stands. A query reads its state live and caches what it
 * works out, so make a new one after the state changes (`model.query(state)` does, per state object).
 */
/** Where a layer stands: `hidden` until its parents are established, `shown` until its requirement is first met
 * (sighted), then `open`, then `established` once reset into. */
export type LayerStatus = "hidden" | "shown" | "open" | "established";
/** What a query reads off the model: the definitions, indexed once. */
export interface LayerIndex<L extends string, S extends string, B extends string> {
    readonly def: LayerModelDef<L, S, B>;
    readonly list: readonly LayerDef<L, S, B>[];
    readonly byId: ReadonlyMap<string, LayerDef<L, S, B>>;
    /** Challenge id to its layer and definition. */
    readonly challenges: ReadonlyMap<string, {
        layer: L;
        def: LayerChallengeDef<L, S, B>;
    }>;
    readonly live: LiveIndex<S, AnyLayerFlag<L>, LayerQuery<L, S, B>, LayerMuteGroup<L>>;
}
/** Indexes a model's content: every source's effects and flags, in a fixed order (per layer: holding, power, upgrades,
 * buyables, milestones, challenges and their penalties; then the extra sources). */
export declare function indexLayers<L extends string, S extends string, B extends string>(def: LayerModelDef<L, S, B>): LayerIndex<L, S, B>;
/** One state's answers. Reads the state live; caches each stat and flag on first read. */
export declare class LayerQuery<L extends string, S extends string, B extends string> {
    private readonly index;
    /** The state read (a draft inside a rule). */
    readonly state: LayersState<L>;
    private readonly graph;
    private rate;
    constructor(index: LayerIndex<L, S, B>, 
    /** The state read (a draft inside a rule). */
    state: LayersState<L>);
    /** A layer's definition; throws on an unknown id. */
    layer(id: L): LayerDef<L, S, B>;
    /** The base resource held. */
    get base(): Decimal;
    data(id: L): LayerState;
    amount(id: L): Decimal;
    power(id: L): Decimal;
    /** Units that count toward the layer's effects: those held plus its `bonus` stat. */
    units(id: L): Decimal;
    owns(id: L, upgrade: string): boolean;
    /** Upgrades of the layer owned. */
    count(id: L): number;
    level(id: L, buyable: string): number;
    /** Every level of the layer's buyables, added up. */
    levels(id: L): number;
    reached(id: L, milestone: string): boolean;
    established(id: L): boolean;
    /** Whether any layer of the row is established. */
    rowEstablished(row: number): boolean;
    /** Times a challenge (by its id, unique across layers) has been completed. */
    completions(challenge: string): number;
    /** Challenges of one layer completed at least once. */
    passed(id: L): number;
    /** Whether a tag has been added. */
    tagged(id: string): boolean;
    /** The challenge entered, if any. */
    get inside(): LayerChallengeDef<L, S, B> | null;
    /** Whether the entered challenge silences a group. */
    muted(group: LayerMuteGroup<L>): boolean;
    /** What a resource reference holds now. */
    resource(ref: LayerResourceRef<L, B>): Decimal;
    /** A stat with every counting effect applied: `(base + adds) × muls`, then its caps. */
    stat(id: S): Decimal;
    /** The counting effects on a stat, in index order. */
    parts(id: S): StatPart[];
    explain(id: S): LiveBreakdown<S>;
    /** Whether any counting source raises the flag. Mute groups never silence a flag. */
    flag(id: AnyLayerFlag<L>): boolean;
    /** The base resource a second: `stat(rate) ^ stat(exponent)`. */
    get baseRate(): Decimal;
    /** Other layers of the row already established: the toll's index while this one is not. */
    private crowd;
    /** The layer's requirement, with the row's toll while it is not yet established. */
    requirement(id: L): Decimal;
    /** What the layer is measured from, now. */
    from(id: L): Decimal;
    private divisor;
    /** A static layer's price of the unit after `held` (infinite past its price list). */
    price(id: L, held: DecimalSource): Decimal;
    /** A normal layer's gain before it is floored: what passive income is a share of. */
    rawGain(id: L): Decimal;
    /** A normal layer's raw gain were `from` at `amount`. */
    private rawGainAt;
    /** What a reset would pay now: the amount for a normal layer, units for a static one. */
    gain(id: L): Decimal;
    /** What `from` must reach for the next unit (static) or for the gain to rise by one (normal). */
    next(id: L): Decimal;
    /** A static layer that holds all it can. */
    full(id: L): boolean;
    /** Whether a reset into the layer would go through. Inside a challenge, nothing at its row or above resets. */
    canReset(id: L): boolean;
    /** Sighted (open or established). */
    isOpen(id: L): boolean;
    status(id: L): LayerStatus;
    /** How far `from` is toward `next`, 0 to 1 (logarithmic past the first factor of ten). */
    progress(id: L): number;
    /** The layer's power a second (0 without one, or while it is muted). */
    powerRate(id: L): Decimal;
    powerCap(id: L): Decimal | null;
    upgradeShown(id: L, u: LayerUpgradeDef<L, S, B>): boolean;
    canBuy(id: L, u: LayerUpgradeDef<L, S, B>): boolean;
    buyableShown(id: L, b: LayerBuyableDef<L, S, B>): boolean;
    buyableCost(id: L, b: LayerBuyableDef<L, S, B>): Decimal;
    canLevel(id: L, b: LayerBuyableDef<L, S, B>): boolean;
    /** Whether a challenge can be entered now: none entered, enough units held, completions left. */
    canEnter(id: L, c: LayerChallengeDef<L, S, B>): boolean;
}
