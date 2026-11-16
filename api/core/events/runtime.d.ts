import type { EventDefinition, EventEffect, EventFailure, EventMastery, EventMilestone, EventNode, EventPassDefinition, EventPassLane, EventPassState, EventRuntime } from "./definition";
/**
 * The runtime's rules: a cycle's fresh runtime, the cycle tree and the mastery tree, the shop, milestones, the
 * pass and the band a finished cycle earned. Every function is pure: it takes the runtime (or the mastery) and
 * returns the next one, or the failure.
 */
/**
 * A tree's row builder, its prices in one currency: a node from one row, rank one at `cost`, each further rank
 * times `costGrowth`, which a row of more than one rank must give (a row of one rank may leave it out). Bind `E` to
 * the game's modifier union, so an effect literal is checked against it: `eventNodeRow<Modifier>("ore")`.
 */
export declare function eventNodeRow<E extends EventEffect>(currency: string): EventNodeRow<E>;
/** The row builder `eventNodeRow` returns: `costGrowth` is optional for one rank and required above it. */
export interface EventNodeRow<E extends EventEffect> {
    (id: string, name: string, line: string, cost: number, maxLevel: 1, requires: readonly string[], effects: readonly E[], costGrowth?: number): EventNode<E>;
    (id: string, name: string, line: string, cost: number, maxLevel: number, requires: readonly string[], effects: readonly E[], costGrowth: number): EventNode<E>;
}
/** A mastery tree with nothing bought. */
export declare const emptyMastery: () => EventMastery;
/** The event's fuel: its first yield's currency, or null for an event fuelled by nothing. */
export declare function fuelCurrency(def: EventDefinition): string | null;
/** Whether an event currency survives into the next cycle. */
export declare function isPersistent(def: EventDefinition, currencyId: string): boolean;
/** Finds a mastery node by id. */
export declare function masteryNodeById<E extends EventEffect>(def: EventDefinition<E>, nodeId: string): EventNode<E> | undefined;
/** Whether a mastery node can be bought: null, or the failure. */
export declare function checkMasteryNode(def: EventDefinition, mastery: EventMastery, nodeId: string): EventFailure | null;
/** Buys one rank of a mastery node: the new mastery, or the failure. */
export declare function buyMasteryNode(def: EventDefinition, mastery: EventMastery, nodeId: string): EventMastery | EventFailure;
/** A pass with nothing claimed. */
export declare const emptyPassState: () => EventPassState;
/** A runtime's pass state, or an empty one. */
export declare function passStateOf(runtime: EventRuntime | undefined): EventPassState;
/**
 * A cycle's first runtime: each cycle currency at its start plus the mastery's head starts, and the cycle tree at
 * the ranks the mastery keeps. Persistent currencies are not on it (`EventMastery`).
 */
export declare function freshRuntime(def: EventDefinition, cycleStart: number, now?: number, mastery?: EventMastery): EventRuntime;
/** Tiers reached (0..N) for a stat value. */
export declare function passTiersReached(pass: EventPassDefinition, value: number): number;
/** Where the stat stands between the last tier reached and the next: for the track's bar. */
export declare function passProgress(pass: EventPassDefinition, value: number): {
    tier: number;
    into: number;
    needed: number;
};
/** Why a tier's reward cannot be claimed, or null when it can. */
export declare function checkPassClaim(pass: EventPassDefinition, state: EventPassState, value: number, tier: number, lane: EventPassLane): "no-tier" | "not-reached" | "premium-required" | "claimed" | "no-reward" | null;
/** Price of buying the next rank of an event node when `level` are owned. */
export declare const eventNodeCost: (node: EventNode, level: number) => {
    currency: string;
    amount: import("break_eternity.js").default;
}[];
/** Finds a cycle-tree node by id. */
export declare function eventNodeById<E extends EventEffect>(def: EventDefinition<E>, nodeId: string): EventNode<E> | undefined;
/** Whether a cycle-tree node can be bought: null, or the failure. */
export declare function checkEventNode(def: EventDefinition, runtime: EventRuntime, nodeId: string): EventFailure | null;
/** Buys one rank of a cycle-tree node: the new runtime, or the failure. */
export declare function buyEventNode(def: EventDefinition, runtime: EventRuntime, nodeId: string): EventRuntime | EventFailure;
/** Whether a result is an `EventFailure`. */
export declare function isEventFailure<T extends object>(value: T | EventFailure): value is EventFailure;
/** Whether the player already holds a reward outright; such an item reads as sold out. */
export type OwnsReward<R = unknown> = (reward: R) => boolean;
/** Whether a shop item can be bought: null, or the failure. */
export declare function checkEventShopItem<R>(def: EventDefinition<EventEffect, R>, runtime: EventRuntime, itemId: string, owns?: OwnsReward<R>): EventFailure | null;
/** Charges the item and records the purchase; the caller grants `item.reward`. */
export declare function buyEventShopItem<R>(def: EventDefinition<EventEffect, R>, runtime: EventRuntime, itemId: string, owns?: OwnsReward<R>): EventRuntime | EventFailure;
/** Milestones whose threshold is met and which are not yet claimed, in definition order. */
export declare function dueMilestones<R>(def: EventDefinition<EventEffect, R>, runtime: EventRuntime): EventMilestone<R>[];
/** How well a cycle went, read off its milestones: one cleared, half of them, all of them. */
export type CycleBand = "bronze" | "silver" | "gold";
/** The band a finished cycle earned: gold at every milestone, silver at half, bronze at one; null at none. */
export declare function cycleBand(def: EventDefinition, runtime: EventRuntime): CycleBand | null;
