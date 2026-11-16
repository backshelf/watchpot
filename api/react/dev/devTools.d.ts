import type { RuntimeStore } from "../store";
/**
 * The dev panel's reads and actions on a store, pure of React so a test drives them. Every one goes through the
 * store; the clock moves by `warpClock` (its offset), never by the wall. Not in the entry's barrel: only the panel
 * reaches them, so a production bundle, which never loads the panel, carries none of this.
 */
/** The profile's day: 1 on the day it was made, counted in whole days of game time since. */
export declare function profileDay(store: RuntimeStore): number;
/** Warps to the same time on the profile's day `day` and catches up over the days between. A past day is refused. */
export declare function jumpToDay(store: RuntimeStore, day: number): void;
/** The features' keys in the store's game, in order: what the inspector lists. */
export declare function featureKeys(store: RuntimeStore): readonly string[];
/** One feature's saved data as indented JSON, Decimals as strings: what the inspector shows. */
export declare function featureJson(store: RuntimeStore, key: string): string;
/** What a check of a save found: fine (at the version it would load as), or the codec's reason. */
export type SaveCheck = {
    ok: true;
    version: number;
} | {
    ok: false;
    reason: string;
};
/** Reads an export through the store's codec (and its migrations) without loading it. */
export declare function checkSave(store: RuntimeStore, json: string): SaveCheck;
