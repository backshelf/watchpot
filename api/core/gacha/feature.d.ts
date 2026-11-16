import { type Feature, type ResetRule } from "../feature";
import { type RngState } from "../rng";
import type { AnyVocab, Ladder, OddsTable } from "../vocab";
import { type PityRule, type PityState, type PityTrigger } from "./kernel";
/**
 * The gacha primitive: a feature that owns a set of boxes' pity counters, one rng stream, the opens per box, the
 * free opens held per box and the last open. A box draws its rarity through the kernel, then `roll` (the post-draw
 * roll: a card from a catalogue, a gear piece's slot and substats) turns the rarity into an item on the same stream.
 * The primitive charges nothing: a game's paying action takes the price in its own recipe and calls `draft.open`.
 */
/** The post-draw roll: the item a pull of `rarity` gives, and the rng after it. */
export type GachaRoll<R extends string, B extends string, P> = (pull: {
    rarity: R;
    box: B;
    triggered: PityTrigger<R>;
    rng: RngState;
}) => [P, RngState];
/** One pull: the rarity, the pity floor that fired and the item rolled. */
export interface GachaPull<R extends string, P> {
    rarity: R;
    triggered: PityTrigger<R>;
    item: P;
}
/** One open: the box, the count, the free tokens used and its pulls. */
export interface GachaOpen<B extends string, R extends string, P> {
    box: B;
    count: number;
    /** Free opens spent, before any the caller paid for. */
    tokensUsed: number;
    pulls: GachaPull<R, P>[];
}
/** A gacha's saved state: pity per box, the rng, opens, free tokens and the last open. */
export interface GachaState<B extends string, R extends string, P> {
    pity: Record<B, PityState<R>>;
    rng: RngState;
    /** Opens per box, ever. */
    opened: Record<B, number>;
    /** Free opens held per box; an open spends them first. */
    tokens: Record<B, number>;
    lastOpen: GachaOpen<B, R, P> | null;
}
/** A gacha's actions: `open` and `grant`. */
export interface GachaActions<B extends string, R extends string, P> {
    /** Opens `count` of a box for free (tokens first, then nothing owed): a game that charges uses `draft.open`. */
    open(box: B, count?: number): GachaOpen<B, R, P>;
    /** Hands out free opens of a box. */
    grant(box: B, count: number): void;
}
/** The definition `gacha` takes: key, ladder, odds, pity, roll, reset and vocabulary. */
export interface GachaDef<K extends string, R extends string, B extends string, P> {
    readonly key: K;
    readonly ladder: Ladder<R>;
    /** Each box's odds table. Its keys are the boxes. */
    readonly odds: Readonly<Record<B, OddsTable<R>>>;
    /** Each box's guarantees. */
    readonly pity: Readonly<Record<B, PityRule<R>>>;
    /** The post-draw roll; without it a pull's item is its rarity. */
    readonly roll?: GachaRoll<R, B, P>;
    /** What a prestige reset does to it: kept whole by default, as pity is account-level. */
    readonly reset?: ResetRule<GachaState<B, R, P>>;
    /** The vocabulary the ladder came from, for `defineGame`'s check. */
    readonly vocab?: AnyVocab;
}
/** Any state or draft holding the gacha's state under its key. */
export type GachaHost<K extends string, R extends string, B extends string, P> = {
    readonly [Q in K]: GachaState<B, R, P>;
};
/** The read-only questions over state. A gacha has none of its own: its counters are `state[key]`. */
export type GachaSelect = Record<never, never>;
/** The fixed configuration of a gacha: what it was declared with. */
export interface GachaFixed<R extends string, B extends string> {
    /** The rarity ladder. */
    readonly ladder: Ladder<R>;
    /** The boxes (the keys of `odds`), in declaration order. */
    readonly boxes: readonly B[];
    /** Each box's odds table. */
    readonly odds: Readonly<Record<B, OddsTable<R>>>;
    /** Each box's guarantees. */
    readonly pity: Readonly<Record<B, PityRule<R>>>;
}
/** The helpers that take a draft first and change it, named like the actions they mirror. */
export interface GachaDraftHelpers<K extends string, R extends string, B extends string, P> {
    /** Opens `count` of a box inside the caller's recipe (tokens first) and records it; a game's paying action calls it. */
    open(draft: GachaHost<K, R, B, P>, box: B, count: number): GachaOpen<B, R, P>;
}
/** A gacha feature: the feature plus `select`, `def` and `draft`. */
export type GachaFeature<K extends string, R extends string, B extends string, P> = Feature<K, GachaState<B, R, P>, GachaActions<B, R, P>> & {
    readonly select: GachaSelect;
    readonly def: GachaFixed<R, B>;
    readonly draft: GachaDraftHelpers<K, R, B, P>;
};
/**
 * `count` pulls in sequence from one box's table and rule, threading pity and rng: the rarity, then `roll`. Pure,
 * for a game that keeps its own state and calls the kernel itself.
 */
export declare function drawMany<R extends string, B extends string, P>(ladder: Ladder<R>, box: B, odds: OddsTable<R>, rule: PityRule<R>, pity: PityState<R>, rng: RngState, count: number, roll: GachaRoll<R, B, P>): {
    pulls: GachaPull<R, P>[];
    pity: PityState<R>;
    rng: RngState;
};
/** A post-draw roll that picks evenly among the catalogue's entries of the drawn rarity (any entry when none). */
export declare function catalogueRoll<R extends string, T extends {
    readonly rarity: R;
}>(catalogue: readonly T[]): GachaRoll<R, string, T>;
/** Declares a gacha. Its rng stream is seeded from the profile's first draws and its key, so a seeded store replays it. */
export declare function gacha<const K extends string, R extends string, B extends string, P = R>(def: GachaDef<K, R, B, P>): GachaFeature<K, R, B, P>;
