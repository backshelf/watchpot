import { type Feature, type NeedsOf, type ReachOf, type ReachShape, type ResetRule } from "./feature";
/**
 * Loadouts: a few slots, the items a player holds, and what the items in the slots do together. An item fits a slot
 * of its `kind`; every slotted item gives its own effects, and a `LoadoutSet` gives more once enough slotted items
 * carry its tag. `loadout({ id, slots, items, sets })` is the rules over a slots record the game keeps wherever it
 * saves it; `defineLoadout({ key, …, owns })` is a feature that owns the record, with the rules under `def.loadout`.
 * The effects are the game's own type: with the stats feature's `{ stat, add }` / `{ stat, mul }` effects,
 * `contributions` feeds its `contributions` as a tree's do.
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
    /** The source prefix of its contributions: `<id>:<item>` for an item, `<id>:set:<set>` for a set. */
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
/** A loadout search under way, run a slice at a time so a page can show it working. */
export interface LoadoutSearch {
    /** Runs up to `count` more scorings. True while the search is not done. */
    step(count: number): boolean;
    /** The best loadout found so far. */
    best(): Record<string, string | null>;
    /** What `score` gave the best loadout. */
    bestScore(): number;
}
/** What `fillLoadout` and `searchLoadout` take. */
export interface LoadoutSearchOptions {
    owns: (item: string) => boolean;
    score: (slotted: Slotted) => number;
    slots?: readonly string[];
    start?: Slotted;
    depth?: number;
}
/**
 * A good loadout for `score` (higher is better, read over a whole slots record), a slice at a time: from `start`
 * (default empty), any exchange of up to `depth` slots at once (default 3) for items the player owns and has not
 * slotted that scores higher is taken, smallest exchanges first, until none does. A single exchange fills and
 * upgrades; a pair or a triple finds a set that pays only once two or three of it are in. `slots` limits it to the
 * slots that are open (default all). The cost is a scoring per exchange tried: proving no triple pays costs
 * (slots choose 3) × (spare items choose 3) of them, so a handful of slots and tens of items is a few hundred
 * thousand. Run it over frames with `step`, keep `score` cheap (work out what each item is worth once), and never
 * call it every tick.
 */
export declare function searchLoadout<E>(rules: Loadout<E>, options: LoadoutSearchOptions): LoadoutSearch;
/**
 * `searchLoadout` run to the end at once: the loadout it settles on. For a sim's player or a test; a page runs
 * `searchLoadout` over frames instead, since proving a large loadout cannot be bettered takes a while.
 */
export declare function fillLoadout<E>(rules: Loadout<E>, options: LoadoutSearchOptions): Record<string, string | null>;
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
/**
 * The read-only questions over state. A loadout feature has none of its own: what sits in the slots is
 * `state[key].slotted`, and `def.loadout` answers over it (`kit.def.loadout.contributions(s.kit.slotted)`).
 */
export type LoadoutSelect = Record<never, never>;
/** The fixed configuration of a loadout feature. */
export interface LoadoutFixed<E> {
    /** The loadout's rules: pure over a slots record (`def.loadout.equip(slotted, …)`). */
    readonly loadout: Loadout<E>;
}
/** A `loadoutFeature`: the feature plus `select`, `def` and `draft` (both empty but `def`: the actions are the changes). */
export type LoadoutFeature<K extends string, E> = Feature<K, LoadoutState, LoadoutActions> & {
    readonly select: LoadoutSelect;
    readonly def: LoadoutFixed<E>;
    readonly draft: Record<never, never>;
};
/**
 * A loadout as a feature: it saves `{ slotted }` under `key` (the stat source prefix too). `owns(state, item)` is
 * the game's rule for what the player holds, read off the whole game state (its own slice plus what `reach` names). A
 * prestige reset keeps the slots unless `reset` says otherwise.
 */
export declare function defineLoadout<const K extends string, E, const R extends ReachShape = readonly [], G extends object = Record<K, LoadoutState> & ReachOf<R>>(def: {
    readonly key: K;
    /** The features `owns` reads, as `feature`'s `reach`. */
    readonly reach?: R | (() => R);
    readonly slots: readonly LoadoutSlot[];
    readonly items: readonly LoadoutItem<E>[];
    readonly sets?: readonly LoadoutSet<E>[];
    readonly owns: (state: G, item: string) => boolean;
    readonly reset?: ResetRule<LoadoutState>;
}): LoadoutFeature<K, E> & {
    readonly needs?: NeedsOf<R>;
};
