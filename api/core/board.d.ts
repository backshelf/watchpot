import { type Feature, type NeedsOf, type ReachOf, type ReachShape, type ResetRule } from "./feature";
/**
 * Boards: a grid of cells, pieces placed on it, and what each piece does read from where it sits: its neighbours,
 * its row and column, the edge, how many of a kind are down. A garden, a reactor, a sheet of stickers, a beacon grid.
 * `board({ id, width, height, pieces })` is the rules, pure over a cells record the game keeps; `boardFeature` saves
 * the cells and carries the rules as `def.board`, with the state-reading questions under `select`. The effect type is
 * the game's own.
 */
/** What a piece sees from its cell: itself, where it is, and what is around it. */
export interface BoardView<E> {
    readonly cell: number;
    readonly x: number;
    readonly y: number;
    readonly piece: BoardPiece<E>;
    /** The pieces on the four cells sharing a side, in the order up, right, down, left (empty cells left out). */
    readonly beside: readonly BoardPiece<E>[];
    /** The pieces on the eight cells around (empty cells left out). */
    readonly around: readonly BoardPiece<E>[];
    /** The other pieces in its row, and in its column. */
    readonly row: readonly BoardPiece<E>[];
    readonly column: readonly BoardPiece<E>[];
    /** On the outer ring of the open cells; and on one of its corners. */
    readonly edge: boolean;
    readonly corner: boolean;
    /** The piece `dx` across and `dy` down from here, or null (empty, closed or off the grid). */
    at(dx: number, dy: number): BoardPiece<E> | null;
    /** How many pieces down carry the id or the tag (this one counted). */
    count(idOrTag: string): number;
}
/** A kind of piece: its id, its tags, and what one does where it sits. */
export interface BoardPiece<E> {
    readonly id: string;
    readonly tags?: readonly string[];
    /** The most that may be down at once, whatever is held. */
    readonly limit?: number;
    readonly effects: (view: BoardView<E>) => readonly E[];
}
/** A board's definition: its size and its kinds of piece. */
export interface BoardDef<E> {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly pieces: readonly BoardPiece<E>[];
}
/** What is down: a piece id per occupied cell (`y × width + x`). */
export type BoardCells = Record<number, string>;
/** Which cells may be used (default: all of the grid) and how many of a piece are held (default: no end of them). */
export interface BoardLimits {
    readonly open?: (x: number, y: number) => boolean;
    readonly held?: (piece: string) => number;
}
/** Why a placement was refused. */
export type BoardFailure = "unknown-piece" | "closed" | "occupied" | "none-left" | "limit" | "empty";
/** One piece down, with what it sees and what it does there. */
export interface PlacedPiece<E> {
    readonly view: BoardView<E>;
    readonly effects: readonly E[];
}
/** A board's rules over a cells record. */
export interface Board<E> {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly pieces: readonly BoardPiece<E>[];
    piece(id: string): BoardPiece<E> | undefined;
    cellOf(x: number, y: number): number;
    xy(cell: number): {
        x: number;
        y: number;
    };
    /** How many of a piece are down. */
    used(cells: BoardCells, piece: string): number;
    /** Why the piece cannot go on the cell, or null when it can. */
    check(cells: BoardCells, cell: number, piece: string, limits?: BoardLimits): BoardFailure | null;
    /** Puts the piece on the cell (mutating `cells`), or says why not. */
    place(cells: BoardCells, cell: number, piece: string, limits?: BoardLimits): BoardFailure | null;
    /** Takes up what is on the cell: its piece id, or null for an empty one. */
    lift(cells: BoardCells, cell: number): string | null;
    /** Moves what is on `from` to `to`, swapping with whatever is there. */
    move(cells: BoardCells, from: number, to: number, limits?: BoardLimits): BoardFailure | null;
    /** Every piece down, in cell order, with its view and effects. Pieces on closed cells do nothing and are left out. */
    placed(cells: BoardCells, limits?: BoardLimits): PlacedPiece<E>[];
    /** Every effect on the board, sourced `<id>:<piece>@<x>,<y>`. */
    contributions(cells: BoardCells, limits?: BoardLimits): {
        source: string;
        effect: E;
    }[];
    /** `cells` with whatever the limits no longer allow taken up (a closed cell, more of a piece than is held). */
    settle(cells: BoardCells, limits?: BoardLimits): BoardCells;
}
/** A board's rules. Throws on a repeated piece id or a size under one cell. */
export declare function board<E>(def: BoardDef<E>): Board<E>;
/** How a filled board is scored: higher is better. */
export type BoardScore<E> = (contributions: readonly {
    source: string;
    effect: E;
}[]) => number;
/**
 * A good layout, found greedily: from `start` (default an empty board), put down whichever piece on whichever open
 * cell scores highest, as long as it does not lower `score` (a piece that only pays beside its own kind has to go
 * down alone first); then try moving each piece to every other cell and lifting each one, keeping what scores
 * higher, for `passes` rounds (default 3). Not the best layout, a good one: what an auto-arrange button or a sim's
 * player does. The cost is cells x pieces scorings a placement, so call it on a change, not every tick.
 */
export declare function fillBoard<E>(rules: Board<E>, options: BoardLimits & {
    score: BoardScore<E>;
    start?: BoardCells;
    passes?: number;
}): BoardCells;
/** A layout search run a slice at a time (`searchBoard`). */
export interface BoardSearch {
    /** Runs up to `count` more trials. True while trials are left. */
    step(count: number): boolean;
    /** The best layout found so far. */
    best(): BoardCells;
    /** What `score` gave the best layout. */
    bestScore(): number;
    /** How far through its trials the search is, 0..1. */
    progress(): number;
}
/**
 * A better layout than `fillBoard`'s, by simulated annealing: every piece held (as many as fit) sits either on an
 * open cell or in hand, and each trial swaps an open cell's content with any other cell's or a piece in hand, keeping
 * a worse layout now and then while the search is hot so it climbs out of a greedy layout's local best. It leaves a
 * piece in hand whenever the board scores higher without it. `trials` (default 60 000) costs a scoring each; the
 * search runs a slice at a time through `step`, so a page can spread it over frames and lay `best()` as it improves.
 * Starts from `start` (default empty); `random` (default `Math.random`) makes it repeatable. Never scores below the
 * start, and lays no more of a piece than its `limit`.
 */
export declare function searchBoard<E>(rules: Board<E>, options: BoardLimits & {
    score: BoardScore<E>;
    start?: BoardCells;
    trials?: number;
    random?: () => number;
}): BoardSearch;
/** A board feature's saved state: what is down. */
export interface BoardState {
    cells: BoardCells;
}
/** The board feature's actions. Each returns null, or why it was refused. */
export interface BoardActions {
    place(cell: number, piece: string): BoardFailure | null;
    lift(cell: number): string | null;
    move(from: number, to: number): BoardFailure | null;
    /** Takes everything up. */
    clear(): void;
    /** Lays the whole board at once (a saved layout, an auto-arrange): what the limits refuse is left off. */
    lay(cells: BoardCells): void;
}
/** The read-only questions over state. */
export interface BoardSelect<G, E> {
    /** The limits (`held`, `open`) the game's state gives. */
    limits(state: G): BoardLimits;
    /** Every effect on the board as a state has it, pieces no longer held or on a closed cell left out. */
    contributions(state: G): {
        source: string;
        effect: E;
    }[];
}
/** The fixed configuration of a board feature. */
export interface BoardFixed<E> {
    /** The board's rules: pure over a cells record (`def.board.place(cells, …)`). */
    readonly board: Board<E>;
}
/** A `boardFeature`: the feature plus `select`, `def` and `draft` (which is empty: the actions are the changes). */
export type BoardFeature<K extends string, G, E> = Feature<K, BoardState, BoardActions> & {
    readonly select: BoardSelect<G, E>;
    readonly def: BoardFixed<E>;
    readonly draft: Record<never, never>;
};
/**
 * A board as a feature: it saves `{ cells }` under `key`, with the actions `place`, `lift`, `move`, `clear` and
 * `lay`. `held(state, piece)` is how many of a piece the player has and `open(state, x, y)` which cells are unlocked,
 * both read off the whole game state (its own slice plus what `reach` names), so a board grows and its pieces are
 * earned however the game likes. A piece no longer held, or on a cell no longer open, simply stops counting
 * (`select.contributions` leaves it out). A prestige reset keeps the layout unless `reset` says otherwise.
 */
export declare function boardFeature<const K extends string, E, const R extends ReachShape = readonly [], G extends object = Record<K, BoardState> & ReachOf<R>>(def: {
    readonly key: K;
    /** The features `held` and `open` read, as `feature`'s `reach`. */
    readonly reach?: R | (() => R);
    readonly width: number;
    readonly height: number;
    readonly pieces: readonly BoardPiece<E>[];
    readonly held?: (state: G, piece: string) => number;
    readonly open?: (state: G, x: number, y: number) => boolean;
    readonly reset?: ResetRule<BoardState>;
}): BoardFeature<K, G, E> & {
    readonly needs?: NeedsOf<R>;
};
