import type { Draft } from "immer";
import type { FeatureApi } from "../feature";
/**
 * A board: what one event keeps beyond the runtime every event shares (a dig's layer, a road's token), saved
 * inside the game's events feature under the board's own `key`. Boards register from the event's own folder
 * (`boardRegistry().register`), and the events feature composes the registered ones (`composeBoards`) in the
 * order the game lists its events. `G` is the game state the board's recipes see; `Bag`, what its `prepare`
 * reads of the modifiers in force.
 */
export interface EventBoard<G extends object = object, Bag = unknown, K extends string = string, S = unknown, A extends object = object> {
    /** The event it belongs to: its `prepare` runs once that event's runtime exists. */
    readonly id: string;
    /** Where its state is saved inside the events feature: explicit and stable, never a position. */
    readonly key: K;
    /** Its state for a fresh profile, and after a run reset (unless the events feature keeps it). */
    readonly initial: () => S;
    /** The sync's per-event setup once the runtime exists: create or catch up the board. */
    readonly prepare?: (draft: Draft<G>, bag: Bag) => void;
    /** Its actions, merged into the events feature's. */
    readonly createActions: (api: FeatureApi<G>) => A;
}
/** A set of boards as the events feature runs them. */
export interface BoardSet<G extends object, Bag> {
    readonly boards: readonly EventBoard<G, Bag>[];
    /** Every board's initial state under its key, in board order. */
    initial(): Record<string, unknown>;
    /** The `prepare` of the board for event `eventId`, when it has one. */
    prepare(eventId: string): ((draft: Draft<G>, bag: Bag) => void) | undefined;
    /** Every board's actions, merged. Throws when two boards name the same action. */
    actions(api: FeatureApi<G>): object;
}
/**
 * Composes boards in the order given. Throws on a repeated event id, key or action name, or one the events feature
 * keeps for itself (`reserved`), so no board can write over another's saved state or shadow an action.
 */
export declare function composeBoards<G extends object, Bag>(boards: readonly EventBoard<G, Bag>[], reserved?: {
    readonly keys?: readonly string[];
    readonly actions?: readonly string[];
}): BoardSet<G, Bag>;
/** The boards a game's event folders register, read back in the order the game lists its events. */
export interface BoardRegistry<G extends object, Bag> {
    /** Registers a board and returns it. Throws on a second board for the same event. */
    register<B extends EventBoard<G, Bag>>(board: B): B;
    /**
     * The registered boards in `order` (event ids). Throws on a board whose event is not in it: a board for an
     * event the game does not list is a mistake, not a board to drop.
     */
    list(order: readonly string[]): readonly EventBoard<G, Bag>[];
}
/** Makes the registry a game's event folders register their boards with. */
export declare function boardRegistry<G extends object, Bag>(): BoardRegistry<G, Bag>;
