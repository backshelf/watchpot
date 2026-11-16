import { type Feature, type ResetRule } from "./feature";
/**
 * Loadouts: a few slots, the items a player holds, and what the items in the slots do together. An item fits a slot
 * of its `kind`; every slotted item gives its own effects, and a `LoadoutSet` gives more once enough slotted items
 * carry its tag. `loadout({ id, slots, items, sets })` is the rules over a slots record the game keeps wherever it
 * saves it; `loadoutFeature({ key, …, owns })` is a feature that owns the record. The effects are the game's own
 * type: with the engine's `Effect`, `contributions` feeds a `stats` feature as a tree's do.
 */
/** One slot. With a `kind` it takes only items of that kind; without one it takes anything. */
export interface LoadoutSlot {
    readonly id: string;
    readonly kind?: string;
}
/** One item that can be slotted: its kind (which slots take it), its tags (which sets count it) and its effects. */
export interface LoadoutItem<E> {
    readonly id: string;
    readonly kind?: string;
    readonly tags?: readonly string[];
    readonly effects?: readonly E[];
}
/** A set: slotted items carrying `tag` are counted, and the highest tier whose `count` is reached gives its effects. */
export interface LoadoutSet<E> {
    readonly id: string;
    readonly tag: string;
    /** Lowest count first. */
    readonly tiers: readonly {
        readonly count: number;
        readonly effects: readonly E[];
    }[];
}
/** What sits in each slot: an item id, or null for an empty slot. A slot absent is empty. */
export type Slotted = Readonly<Record<string, string | null>>;
/** Why an item cannot go in a slot. */
export type LoadoutFailure = "unknown-slot" | "unknown-item" | "wrong-kind" | "not-owned";
/** A set as it stands: how many slotted items carry its tag, the tier reached (-1 for none) and the next count. */
export interface SetStanding<E> {
    readonly set: LoadoutSet<E>;
    readonly count: number;
    /** The index of the tier reached, or -1. */
    readonly tier: number;
    /** The count the next tier needs, or null at the last. */
    readonly next: number | null;
}
/** The definition `loadout` takes. */
export interface LoadoutDef<E> {
    /** The contributions' source prefix: `<id>:<item>` for an item, `<id>:set:<set>` for a set. */
    readonly id: string;
    readonly slots: readonly LoadoutSlot[];
    readonly items: readonly LoadoutItem<E>[];
    readonly sets?: readonly LoadoutSet<E>[];
}
/** A loadout's rules. */
export interface Loadout<E> {
    readonly id: string;
    readonly slots: readonly LoadoutSlot[];
    readonly items: readonly LoadoutItem<E>[];
    readonly sets: readonly LoadoutSet<E>[];
    item(id: string): LoadoutItem<E> | undefined;
    /** Whether the item's kind suits the slot. */
    fits(slot: string, item: string): boolean;
    /** Why `item` cannot go in `slot`, or null when it can. `owns` is the game's answer to "does the player hold it". */
    check(slot: string, item: string, owns: (item: string) => boolean): LoadoutFailure | null;
    /** Puts `item` in `slot`; an item already in another slot moves. Returns the failure, or null when it went in. */
    equip(slotted: Record<string, string | null>, slot: string, item: string, owns: (item: string) => boolean): LoadoutFailure | null;
    /** Empties a slot. False for a slot the loadout lacks. */
    clear(slotted: Record<string, string | null>, slot: string): boolean;
    /** The slotted items, in slot order. An id the loadout no longer knows is skipped. */
    equipped(slotted: Slotted): LoadoutItem<E>[];
    /** Every set as it stands. */
    standings(slotted: Slotted): SetStanding<E>[];
    /** Every effect in play: each slotted item's, then each reached set tier's. */
    contributions(slotted: Slotted): {
        source: string;
        effect: E;
    }[];
}
/** A loadout's rules over a slots record the game keeps. Throws on a repeated slot, item or set id. */
export declare function loadout<E>(def: LoadoutDef<E>): Loadout<E>;
/**
 * A good loadout for `score` (higher is better, read over a whole slots record): from `start` (default empty), the
 * best exchange of up to `depth` slots at once (default 3) for items the player owns and has not slotted, again and
 * again until none scores higher. A single exchange fills and upgrades; a pair or a triple finds a set that pays only
 * once two or three of it are in. `slots` limits it to the slots that are open (default all). The cost is a scoring
 * per exchange tried, which grows with the depth's power of the items owned: tens of items and a handful of slots
 * take milliseconds, so call it on a press or a change, never every tick.
 */
export declare function fillLoadout<E>(rules: Loadout<E>, options: {
    owns: (item: string) => boolean;
    score: (slotted: Slotted) => number;
    slots?: readonly string[];
    start?: Slotted;
    depth?: number;
}): Record<string, string | null>;
/** A loadout feature's state: what sits in each slot. */
export interface LoadoutState {
    slotted: Record<string, string | null>;
}
/** The loadout feature's actions. */
export interface LoadoutActions {
    /** Puts an item the player holds in a slot. Returns the failure, or null when it went in. */
    equip(slot: string, item: string): LoadoutFailure | null;
    /** Empties a slot. */
    clear(slot: string): boolean;
}
/** A `loadoutFeature`, carrying its rules as `.loadout`. */
export type LoadoutFeature<K extends string, E> = Feature<K, LoadoutState, LoadoutActions> & {
    readonly loadout: Loadout<E>;
};
/**
 * A loadout as a feature: it saves `{ slotted }` under `key` (the contributions' source prefix too). `owns(state, item)`
 * is the game's rule for what the player holds, read off the whole game state. A prestige reset keeps the slots
 * unless `reset` says otherwise.
 */
export declare function loadoutFeature<const K extends string, E, G extends object = object>(def: {
    readonly key: K;
    readonly slots: readonly LoadoutSlot[];
    readonly items: readonly LoadoutItem<E>[];
    readonly sets?: readonly LoadoutSet<E>[];
    readonly owns: (state: G, item: string) => boolean;
    readonly reset?: ResetRule<LoadoutState>;
}): LoadoutFeature<K, E>;
