import { type AnyGame, type RootActions } from "../core";
/**
 * Proof that a game's sim is the game: the same seed played through the real store and the plain one
 * (`createPlainStore`, which the sim runs on), compared after every stretch. A game calls it once in its tests;
 * null means every saved and transient field agreed all the way, and a string names the first that did not.
 */
export interface PlainParityOptions {
    /** The seed both stores draw from. Default `"parity"`. */
    seed?: string | number;
    /** The wall time both start at (epoch ms). Default 1,000,000. */
    start?: number;
    /** How many ticks to play. Default 600. */
    steps?: number;
    /** The length of a tick in ms. Default 1000. */
    tickMs?: number;
    /** Ticks between comparisons. Default 50. */
    compareEvery?: number;
    /**
     * What the player does before each tick, the same on both stores: usually the auto-player's look
     * (`(store) => player.look(store)`, with one auto-player made per store). Called with the tick's index.
     */
    act?(store: ParityStore, step: number, which: "real" | "plain"): void;
}
/** What `act` is handed: either store, by the part the two share. */
export interface ParityStore {
    getState(): RootActions & Record<string, unknown>;
}
/** Plays one seed through both stores and names the first field they disagree on, or null when they never do. */
export declare function plainParity(game: AnyGame, options?: PlainParityOptions): string | null;
