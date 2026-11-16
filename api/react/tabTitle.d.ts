/** Sets `owner`'s title. A claim already held keeps its place; a new one goes on top. */
export declare function claimTabTitle(owner: string, title: string): void;
/** Drops `owner`'s claim: the claim under it shows, or the page's own title once none is left. */
export declare function releaseTabTitle(owner: string): void;
/** Options of `useAwayTitle`. */
export interface AwayTitleOptions {
    /** How long each title shows before the next, ms. Default 20 000. */
    everyMs?: number;
    /** The claim's owner id (`claimTabTitle`). Default "away". */
    owner?: string;
    /** False leaves the tab's title alone. Default true. */
    enabled?: boolean;
}
/**
 * While the tab is hidden, the browser tab shows `titles` in turn (the game's own words: what it says to a player
 * who has looked away), and the page's own title comes back on the return. `titles` may be a function, called each
 * time the tab hides, so the words can be made from the state at that moment. Nothing is claimed while it is empty.
 */
export declare function useAwayTitle(titles: readonly string[] | (() => readonly string[]), options?: AwayTitleOptions): void;
