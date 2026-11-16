import type { Decimal, DecimalSource } from "../decimal";
import type { LiveEffect } from "../graph/live";
import type { StatDef } from "../graph/stats";
import type { LayerQuery } from "./query";
/**
 * The layer model's types: what a layer is, what it holds, and what a game's content declares. Three type
 * parameters run through it: `L` the layer ids, `S` the stat ids and `B` the base resource's id. Everything a layer
 * does to another is an effect on a stat or a flag, so the rules never name a layer.
 */
/** Something held, measured or spent: the base resource, a layer's amount, or a layer's power (`<layer>.power`). */
export type LayerResourceRef<L extends string, B extends string> = B | L | `${L}.power`;
/** The flag kinds the rules read, each about one layer. */
export declare const LAYER_FLAG_KINDS: readonly ["keep", "bulk", "auto", "quiet", "autobuy", "autolevel", "free"];
/** A flag kind: `keep`, `bulk`, `auto`, `quiet`, `autobuy`, `autolevel` or `free`. */
export type LayerFlagKind = (typeof LAYER_FLAG_KINDS)[number];
/**
 * A flag the rules read. `keep:<layer>`: its upgrades and buyables survive a wipe. `bulk:<layer>`: a static layer
 * takes every unit it can afford in one reset (once established). `auto:<layer>`: a static layer resets on its own.
 * `quiet:<layer>`: its reset wipes nothing beneath it. `autobuy:<layer>` / `autolevel:<layer>`: its upgrades /
 * buyables buy themselves. `free:<layer>`: its buyables spend nothing.
 */
export type LayerFlag<L extends string> = `${LayerFlagKind}:${L}`;
/** A flag a source raises: one the rules read, or any other string the game reads itself. */
export type AnyLayerFlag<L extends string> = LayerFlag<L> | (string & {});
/** The groups a challenge can silence while it is entered: a layer's upgrades, holding, power or buyables. */
export type LayerMuteGroup<L extends string> = `${L}.${"upgrades" | "holding" | "power" | "buyables"}`;
/** One push on one stat, valued from the query. `add` lands on the base before any `mul`. */
export type LayerEffect<L extends string, S extends string, B extends string> = LiveEffect<S, LayerQuery<L, S, B>>;
/** Anything that carries effects and flags while it counts. */
export interface LayerSource<L extends string, S extends string, B extends string> {
    readonly effects?: readonly LayerEffect<L, S, B>[];
    readonly flags?: readonly AnyLayerFlag<L>[];
}
/** A one-time purchase in a layer's shop, priced in the layer's `shop` resource. */
export interface LayerUpgradeDef<L extends string, S extends string, B extends string> extends LayerSource<L, S, B> {
    readonly id: string;
    /** The breakdown's label (default: the id). */
    readonly name?: string;
    readonly text?: string;
    readonly cost: DecimalSource;
    /** Hidden (and unbuyable) until this holds. */
    readonly shown?: (q: LayerQuery<L, S, B>) => boolean;
    /** Bought only while this holds. */
    readonly open?: (q: LayerQuery<L, S, B>) => boolean;
}
/** What a milestone counts: the layer's `total` gathered since the last wipe, its `best` ever, or its `resets`. */
export type LayerMilestoneCount = "total" | "best" | "resets";
export declare const LAYER_MILESTONE_COUNTS: readonly LayerMilestoneCount[];
/** A permanent unlock, reached the first time the count reaches `at`, and never lost. */
export interface LayerMilestoneDef<L extends string, S extends string, B extends string> extends LayerSource<L, S, B> {
    readonly id: string;
    readonly name?: string;
    readonly text?: string;
    readonly at: DecimalSource;
    /** Default: `best` for a static layer, `total` for a normal one. */
    readonly on?: LayerMilestoneCount;
}
/** A purchase with levels: level `n` costs `first × growth ^ (n ^ curve)`. Effects read `q.level(layer, id)`. */
export interface LayerBuyableDef<L extends string, S extends string, B extends string> {
    readonly id: string;
    readonly name?: string;
    readonly text?: string;
    readonly pay: LayerResourceRef<L, B>;
    readonly first: DecimalSource;
    readonly growth: number;
    /** Default 1. */
    readonly curve?: number;
    /**
     * Hidden until the most of `pay` ever held (a layer's `best`; the base or a power as held now) reaches this share
     * of the first price. Shown from the start without it.
     */
    readonly reveal?: number;
    readonly shown?: (q: LayerQuery<L, S, B>) => boolean;
    readonly effects: readonly LayerEffect<L, S, B>[];
    readonly flags?: readonly AnyLayerFlag<L>[];
}
/**
 * A challenge: entered from its layer, it wipes the rows beneath, holds its `penalties` and `mutes` until the base
 * resource reaches `goal`, then counts a completion; its own `effects` and `flags` hold from the first completion on.
 */
export interface LayerChallengeDef<L extends string, S extends string, B extends string> extends LayerSource<L, S, B> {
    /** Unique across every layer. */
    readonly id: string;
    readonly name?: string;
    readonly text?: string;
    /** The base resource to reach inside. */
    readonly goal: DecimalSource;
    /** Units of the layer held before it can be entered (default 0). */
    readonly needs?: number;
    /** Completions it allows (default 1). */
    readonly limit?: number;
    readonly penalties?: readonly LayerEffect<L, S, B>[];
    readonly mutes?: readonly LayerMuteGroup<L>[];
}
/** A layer's own second resource: it builds at `rate` a second, up to `cap`, and has its own effects. */
export interface LayerPowerDef<L extends string, S extends string, B extends string> extends LayerSource<L, S, B> {
    readonly name?: string;
    readonly text?: string;
    readonly rate: (q: LayerQuery<L, S, B>) => DecimalSource;
    readonly cap?: (q: LayerQuery<L, S, B>) => DecimalSource;
}
/** What holding the layer's amount does: active while any unit counts or any was gathered since the last wipe. */
export interface LayerHoldingDef<L extends string, S extends string, B extends string> extends LayerSource<L, S, B> {
    readonly name?: string;
    readonly text?: string;
}
/**
 * One layer. `normal`: a reset pays `floor((from / requirement) ^ exponent × stat(gain))`, nothing below the
 * requirement. `static`: a reset buys the next unit once `from` covers `requirement × scale ^ (held ^ curve) ÷
 * stat(cost)` (or the next of `prices`, each multiplied by the row's toll and divided by `stat(cost)`).
 */
export interface LayerDef<L extends string, S extends string, B extends string> {
    readonly id: L;
    /** 1 is the lowest row; a reset wipes every row beneath its own. */
    readonly row: number;
    readonly name?: string;
    readonly text?: string;
    readonly kind: "normal" | "static";
    /** What the layer is measured from: the base resource, a lower layer's amount, or a power. */
    readonly from: LayerResourceRef<L, B>;
    readonly requires: DecimalSource;
    /** A normal layer's exponent (default 0.5). */
    readonly exponent?: number;
    /** The stat a normal layer's gain is multiplied by. */
    readonly gain?: S;
    /** A static layer's price growth: required unless `prices` is given. */
    readonly scale?: number;
    /** A static layer's price curve (default 1). */
    readonly curve?: number;
    /** A static layer priced unit by unit; its length is the most it can hold. */
    readonly prices?: readonly DecimalSource[];
    /** The stat a static layer's price is divided by. */
    readonly cost?: S;
    /** The most units a static layer holds. */
    readonly max?: number;
    /** A stat whose value counts as units on top of those held (`q.units`). */
    readonly bonus?: S;
    /** The stat whose value is the share of the reset gain a normal layer earns each second without resetting. */
    readonly passive?: S;
    /**
     * The row's toll: the requirement of a layer not yet established is multiplied by `tolls[n - 1]` when `n` other
     * layers of its row are established (the last entry past the end).
     */
    readonly tolls?: readonly DecimalSource[];
    /** What its upgrades are priced in (default: the layer's own amount). */
    readonly shop?: LayerResourceRef<L, B>;
    /** Layers that must be established before it shows (default: none, shown from the start). */
    readonly parents?: readonly L[];
    readonly holding?: LayerHoldingDef<L, S, B>;
    readonly power?: LayerPowerDef<L, S, B>;
    readonly upgrades?: readonly LayerUpgradeDef<L, S, B>[];
    readonly milestones?: readonly LayerMilestoneDef<L, S, B>[];
    readonly buyables?: readonly LayerBuyableDef<L, S, B>[];
    readonly challenges?: readonly LayerChallengeDef<L, S, B>[];
}
/** The base resource: rises at `stat(rate) ^ stat(exponent)` a second. */
export interface LayerBaseDef<S extends string, B extends string> {
    readonly id: B;
    readonly rate: S;
    readonly exponent?: S;
}
/** A source outside any layer (a game's own bonus), indexed after every layer's. */
export interface LayerExtraSource<L extends string, S extends string, B extends string> extends LayerSource<L, S, B> {
    readonly label: string;
    readonly owner?: string;
    readonly active: (q: LayerQuery<L, S, B>) => boolean;
}
/** Which of a layer's sources a breakdown line stands for. */
export interface LayerSourceRef<L extends string> {
    readonly layer: L;
    readonly kind: "holding" | "power" | "upgrade" | "buyable" | "milestone" | "challenge" | "penalty";
    /** The source's id: the layer's for its holding, `<layer>.power` for its power, its challenge's for a penalty. */
    readonly id: string;
    /** The label it gets by default: its `name`, else its id; `inside <challenge>` for a penalty. */
    readonly label: string;
}
/** A one-time tag added by `settle` the first time `when` holds. Never wiped. */
export interface LayerTagDef<L extends string, S extends string, B extends string> {
    readonly id: string;
    readonly when?: (q: LayerQuery<L, S, B>) => boolean;
}
/** What the rules report as they run, for a log or a sound. `at` is `playedMs`. */
export type LayerEvent<L extends string> = {
    readonly kind: "sighted" | "established";
    readonly layer: L;
    readonly at: number;
} | {
    readonly kind: "milestone" | "upgrade" | "entered" | "completed";
    readonly layer: L;
    readonly id: string;
    readonly at: number;
}
/** Left uncompleted; `since` is when it was entered. */
 | {
    readonly kind: "left";
    readonly layer: L;
    readonly id: string;
    readonly since: number;
    readonly at: number;
}
/** Every reset, after it is paid and before it wipes. */
 | {
    readonly kind: "reset";
    readonly layer: L;
    readonly gain: Decimal;
    readonly at: number;
} | {
    readonly kind: "tagged";
    readonly id: string;
    readonly at: number;
}
/** After an absence is played: the time away, the time credited and the base risen over it. */
 | {
    readonly kind: "away";
    readonly ms: number;
    readonly creditedMs: number;
    readonly risen: Decimal;
    readonly at: number;
};
/** Time away: credited up to `capMs` (default 8 hours) at `rate` (default 1), in at most `maxSteps` steps. */
export interface LayerAwayOptions {
    readonly capMs?: number;
    readonly rate?: number;
    readonly maxSteps?: number;
    readonly minStepMs?: number;
}
/** Everything `layerModel` takes. */
export interface LayerModelDef<L extends string, S extends string, B extends string> {
    readonly base: LayerBaseDef<S, B>;
    /** Every layer, lowest row first. */
    readonly layers: readonly LayerDef<L, S, B>[];
    /** Stat bases (default 1, and 0 for every layer's `passive` stat). */
    readonly stats?: Partial<Record<S, DecimalSource>>;
    /** Softcaps and hardcaps per stat (as `liveIndex` takes them). */
    readonly caps?: Partial<Record<S, StatDef>>;
    readonly sources?: readonly LayerExtraSource<L, S, B>[];
    /** The breakdown's label for a layer's source, in the game's words (default: `source.label`). */
    readonly label?: (source: LayerSourceRef<L>) => string;
    readonly tags?: readonly LayerTagDef<L, S, B>[];
    readonly away?: LayerAwayOptions;
    /**
     * `next` of a normal layer is a closed form that floating point can leave a hair under the threshold, so the gain
     * there is still `n`. With this on, `next` is nudged up to the first value that pays `n + 1`. Off by default.
     */
    readonly exactNext?: boolean;
    /** Called as the rules write: inside a store, on the draft. */
    readonly onEvent?: (state: LayersState<L>, event: LayerEvent<L>) => void;
}
/** One layer's saved state. */
export interface LayerState {
    /** Its requirement has been met once while it was shown. Permanent. */
    sighted: boolean;
    /** Reset into at least once. Permanent, as `order` is. */
    established: boolean;
    /** How many layers of its row were established before it. */
    order: number;
    amount: Decimal;
    /** The most ever held. Never wiped. */
    best: Decimal;
    /** Gathered since the last wipe. */
    total: Decimal;
    resets: number;
    power: Decimal;
    upgrades: string[];
    buyables: Record<string, number>;
    milestones: string[];
    /** Completions by challenge id. Never wiped. */
    completions: Record<string, number>;
    /** The player switched this layer's automation off. */
    manual: boolean;
}
/** The challenge entered: its layer, its id and `playedMs` when it was entered. */
export interface LayerEnteredChallenge<L extends string> {
    layer: L;
    id: string;
    since: number;
}
/** What the layer model saves. */
export interface LayersState<L extends string> {
    /** The base resource held. Wiped by every reset. */
    base: Decimal;
    /** The base resource ever risen. Never wiped. */
    baseTotal: Decimal;
    layers: Record<L, LayerState>;
    challenge: LayerEnteredChallenge<L> | null;
    /** Tag ids added, in order. Never wiped. */
    tags: string[];
    /** Time played, away included, in ms. */
    playedMs: number;
}
