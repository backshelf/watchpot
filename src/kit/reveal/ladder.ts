import { type RarityTier, tierStep } from "../fx/rarity";

/**
 * The reveal's looks over a game's ladder. The room has five (`ROOM_STEPS`): 0 the ink alone, 1 a halo, 2 the pool
 * runs hot, 3 rays, 4 the foil. A rung picks the step its height lands nearest (`roomStep`), and everything the
 * reveal does by rarity reads that step: the room's light and look, the charge before a turn (from step 3), the
 * flash and the jolt (from step 3, hard on step 4), the lift's pop as a face lands (from step 3).
 */
export const ROOM_STEPS = 5;

/** The room's step for a rung: 0 for the lowest, 4 for the top of any ladder. */
export const roomStep = (tier: RarityTier): number => tierStep(tier, ROOM_STEPS);

/** The step from which a face charges the room before it turns, flashes, jolts the stage and pops as it lands. */
export const BIG_STEP = 3;

/** The highest rung among `ids` on `ladder` (lowest first); undefined for none. An id the ladder lacks never wins. */
export function bestOf<R extends string>(ladder: readonly R[], ids: Iterable<R>): R | undefined {
  let best: R | undefined;
  let at = -1;
  for (const id of ids) {
    const i = ladder.indexOf(id);
    if (i > at) {
      at = i;
      best = id;
    }
  }
  return best;
}

/** Whether rung `a` stands at or above rung `b` on `ladder`. */
export function rungAtLeast<R extends string>(ladder: readonly R[], a: R, b: R): boolean {
  return ladder.indexOf(a) >= ladder.indexOf(b);
}
