import type { Draft } from "immer";
import { type Feature, type ResetRule, type StepContext } from "./feature";
/**
 * Autobuyers: automation as a system. Each autobuyer is something the game buys for the player on an interval once
 * it is unlocked and the player has it switched on: the next generator, the cheapest upgrade, a max-all. The game
 * writes the purchase (`run`, inside the tick's recipe); the feature owns the switches, the schedule and the count.
 *
 * `everyMs` is the pure schedule: firing is on game time from the last fire, not accumulated per tick, so an
 * interval of 2 s fires at 2, 4, 6 s whatever the tick length. `autobuyers({ key, list })` is the feature.
 */
/**
 * Whether an interval of `intervalMs` has passed since `lastAt` at `now`, and the new `lastAt` when it has (null when
 * it has not). Never fired (`lastAt` undefined) or an interval of 0 fires at once and lands on `now`; otherwise the
 * new `lastAt` keeps the phase, `lastAt + intervalMs × floor((now - lastAt) / intervalMs)`, so the schedule never
 * drifts with the tick, and a gap of many intervals fires once.
 */
export declare function everyMs(lastAt: number | undefined, intervalMs: number, now: number): number | null;
/** One autobuyer: when it is unlocked, how often it fires, and the purchase it makes. */
export interface AutobuyerDef<G> {
    readonly id: string;
    /** Whether the player has it: read off the whole game state. */
    readonly unlocked: (state: G) => boolean;
    /** Its interval now, in game ms (0 fires every tick). */
    readonly intervalMs: (state: G) => number;
    /** Makes the purchase inside the tick's recipe and returns how many it bought. */
    readonly run: (draft: Draft<G>, ctx: StepContext) => number;
    /** Higher fires first in a tick (default 0; ties keep the list order). */
    readonly priority?: number;
}
/** The feature's saved state: the player's switches, the last fire and the count bought, per autobuyer id. */
export interface AutobuyersState {
    /** The player's switches; an autobuyer starts on. */
    on: Record<string, boolean>;
    /** The game time it last fired; absent until it first does. */
    lastAt: Record<string, number>;
    /** How many it has bought. */
    bought: Record<string, number>;
}
/** The feature's actions. */
export interface AutobuyerActions {
    /** Flips an autobuyer's switch, or sets it to `on`. Returns the switch after; false for an unknown id. */
    toggle(id: string, on?: boolean): boolean;
    /** Sets every switch. */
    setAll(on: boolean): void;
}
/** An autobuyer list's rules. */
export interface AutobuyerRules<G> {
    readonly list: readonly AutobuyerDef<G>[];
    autobuyer(id: string): AutobuyerDef<G> | undefined;
    /** Whether it is unlocked and switched on. */
    active(state: G, id: string): boolean;
    /** Ms until it next fires (0 when it is due), or null when it is not active. */
    nextInMs(state: G, id: string, now: number): number | null;
}
/** An `autobuyers` feature, carrying its rules as `.rules`. */
export type AutobuyersFeature<K extends string, G> = Feature<K, AutobuyersState, AutobuyerActions> & {
    readonly rules: AutobuyerRules<G>;
};
/**
 * Autobuyers as a feature. It saves `{ on, lastAt, bought }` under `key` and fires in one step, `<key>.automate.fire`:
 * every unlocked autobuyer that is switched on and due by `everyMs`, highest `priority` first. A catch-up fires each
 * at most once at its end: purchases during an absence are not simulated, only the first one back. A prestige reset
 * keeps the player's switches and clears the rest, unless `reset` says otherwise. The callbacks read the whole game
 * state, so annotate one of them with the game's state type.
 */
export declare function autobuyers<const K extends string, G extends object = object>(def: {
    readonly key: K;
    readonly list: readonly AutobuyerDef<G>[];
    readonly reset?: ResetRule<AutobuyersState>;
}): AutobuyersFeature<K, G>;
