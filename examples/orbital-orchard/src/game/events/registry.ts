import { boardRegistry, type EventBag, type EventRuntime } from "watchpot/core";

/**
 * What an event's board sees of the game: the events feature (its runtime, the record kept across cycles and every
 * board's state under its key) and the wallet a board pays into. The events feature's own draft is wider; it hands
 * the boards this one (`events.ts`).
 */
export interface BoardGame {
  readonly wallet: object;
  events: {
    runtime: EventRuntime;
    /** Shards caught over every cycle, for the record. */
    caughtEver: number;
  } & Record<string, unknown>;
}

/** The one registry every event folder registers its board with; `events.ts` reads it when the store is built. */
export const boards = boardRegistry<BoardGame, EventBag>();
