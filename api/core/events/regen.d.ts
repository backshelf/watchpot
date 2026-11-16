import { type Decimal } from "../decimal";
import type { EventBag, EventDefinition, EventRuntime } from "./definition";
/**
 * What the modifiers in force do to an event: its trickle's speed, its caps, the autopilot's share. All of it is
 * read through an `EventBag`, which the game builds from its own stats.
 */
/** The neutral bag: no faster trickle, no cap additions, every event-local stat at its base. */
export declare const NO_BAG: EventBag;
/** The event-stat the autopilot reads: the share of a benched event's fuel it plays, 0 (off) to 1. */
export declare const AUTOPILOT = "autopilot";
/** The autopilot's share as every reader takes it: the `AUTOPILOT` stat, at most 1. */
export declare const autopilotShare: (bag: EventBag, eventId: string) => number;
/**
 * A currency's cap with the bag's additions, or null when it has none. Regeneration and fuel from play both stop
 * at it; a reward can still land above it, and the trickle then waits until it is spent down.
 */
export declare function eventCurrencyCap(def: EventDefinition, currencyId: string, bag?: EventBag): Decimal | null;
/**
 * Regenerates each currency by wall time. Whole periods only; the remainder stays on the timer. At the cap the timer
 * is parked at `now`, so spending starts a fresh period. Returns the same runtime when nothing changed.
 */
export declare function regenEventCurrencies(def: EventDefinition, runtime: EventRuntime, now: number, bag?: EventBag): EventRuntime;
/** Milliseconds until the next unit of a regenerating currency, or null when it does not regenerate or is capped. */
export declare function msUntilRegen(def: EventDefinition, runtime: EventRuntime, currencyId: string, now: number, bag?: EventBag): number | null;
