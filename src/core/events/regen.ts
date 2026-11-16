import { D, type Decimal, ZERO } from "../decimal";
import type { EventBag, EventDefinition, EventRuntime } from "./definition";

/**
 * What the modifiers in force do to an event: its trickle's speed, its caps, the autopilot's share. All of it is
 * read through an `EventBag`, which the game builds from its own stats.
 */

/** The neutral bag: no faster trickle, no cap additions, every event-local stat at its base. */
export const NO_BAG: EventBag = { regenMult: () => 1, capAdd: () => ZERO, stat: (_e, _k, base = 0) => base };

/** The event-stat the autopilot reads: the share of a benched event's fuel it plays, 0 (off) to 1. */
export const AUTOPILOT = "autopilot";

/** The autopilot's share as every reader takes it: the `AUTOPILOT` stat, at most 1. */
export const autopilotShare = (bag: EventBag, eventId: string): number =>
  Math.min(1, bag.stat(eventId, AUTOPILOT));

/**
 * A currency's cap with the bag's additions, or null when it has none. Regeneration and fuel from play both stop
 * at it; a reward can still land above it, and the trickle then waits until it is spent down.
 */
export function eventCurrencyCap(
  def: EventDefinition,
  currencyId: string,
  bag: EventBag = NO_BAG,
): Decimal | null {
  const c = def.currencies.find((x) => x.id === currencyId);
  if (c?.cap === undefined) return null;
  return D(c.cap).add(bag.capAdd(def.id, currencyId));
}

/**
 * Regenerates each currency by wall time. Whole periods only; the remainder stays on the timer. At the cap the timer
 * is parked at `now`, so spending starts a fresh period. Returns the same runtime when nothing changed.
 */
export function regenEventCurrencies(
  def: EventDefinition,
  runtime: EventRuntime,
  now: number,
  bag: EventBag = NO_BAG,
): EventRuntime {
  let changed = false;
  const currencies = { ...runtime.currencies };
  const regenAt = { ...runtime.regenAt };
  for (const c of def.currencies) {
    if (!c.regen) continue;
    const cap = eventCurrencyCap(def, c.id, bag);
    const current = currencies[c.id] ?? ZERO;
    const since = regenAt[c.id] ?? now;
    if (cap !== null && current.gte(cap)) {
      if (since !== now) {
        regenAt[c.id] = now;
        changed = true;
      }
      continue;
    }
    const every = c.regen.everyMs / Math.max(1e-9, bag.regenMult(def.id, c.id));
    const periods = Math.floor((now - since) / every);
    if (periods <= 0) continue;
    let next = current.add(D(c.regen.amount).mul(periods));
    if (cap !== null && next.gt(cap)) next = cap;
    currencies[c.id] = next;
    regenAt[c.id] = cap !== null && next.gte(cap) ? now : since + periods * every;
    changed = true;
  }
  return changed ? { ...runtime, currencies, regenAt } : runtime;
}

/** Milliseconds until the next unit of a regenerating currency, or null when it does not regenerate or is capped. */
export function msUntilRegen(
  def: EventDefinition,
  runtime: EventRuntime,
  currencyId: string,
  now: number,
  bag: EventBag = NO_BAG,
): number | null {
  const c = def.currencies.find((x) => x.id === currencyId);
  if (!c?.regen) return null;
  const cap = eventCurrencyCap(def, c.id, bag);
  if (cap !== null && (runtime.currencies[c.id] ?? ZERO).gte(cap)) return null;
  const every = c.regen.everyMs / Math.max(1e-9, bag.regenMult(def.id, c.id));
  const since = runtime.regenAt[c.id] ?? now;
  return Math.max(0, since + every - now);
}
