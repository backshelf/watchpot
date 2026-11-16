import type { FeatureSpec } from "./feature";
/**
 * Derived values, kept the way a spreadsheet keeps its cells. A feature's `derived` block names values worked out
 * from the state; each is a cell. A cell remembers which slices and which other cells it read when it was last
 * worked out, and is worked out again only when one of those may have changed since, and only when something reads
 * it. One cell reading another gives the order; a cell that ends up reading itself is an error that names the loop.
 *
 * What "may have changed" means: every recipe and every step is handed the game through `view`, which notes the
 * slices it takes hold of. When the step ends, those slices count as written. So a cell is current as of the start
 * of the step or recipe that reads it: a step sees what every earlier step did, and not its own writes.
 */
export interface Cells {
    /** False when no feature declares a derived value: the game's state is then handed out as it is. */
    readonly any: boolean;
    /** The derived names of a feature, for the save (they never save) and the definition checks. */
    names(key: string): readonly string[];
    /**
     * The game as a step or a recipe sees it, over `root` (an immer draft or a plain state): a derived value read
     * through it is current, and the slices taken through it count as written once `close` is called.
     */
    view<T extends object>(root: T): T;
    /** The state under a view (or the value itself when it is not one): for the engine's own writes. */
    raw<T extends object>(view: T): T;
    /** Ends a step or a recipe: every slice taken through the view since the last close counts as written. */
    close(): void;
    /** Every slice counts as written: after a reset, a load or an import, which write under the view. */
    touchAll(): void;
    /** Works out every cell that is not current and writes it into its slice of `root`. */
    settle(root: object): void;
}
/** The cells of a game's features: one set per store (or per sim run), since it remembers what it has seen. */
export declare function createCells(features: readonly FeatureSpec[]): Cells;
