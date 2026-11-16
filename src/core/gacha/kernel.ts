import { nextFloat, pickWeighted, type RngState } from "../rng";
import type { Ladder, OddsTable } from "../vocab";

/**
 * The gacha kernel: a rarity draw over a game's ladder with hard pity floors, soft pity ramps and published odds.
 * A caller owns its ladder, odds table, pity rule, pity counters and rng stream, and passes them in; the kernel
 * names no rarity and reads no tuning. Draw order is fixed (each soft ramp from the highest rung down, then the
 * weighted rarity) so a saved rng state replays the same pull, and every function is pure.
 */

/**
 * One guarantee: a pull of `rarity` or better within `within` pulls of the last one. With `softFrom`, the pulls
 * after the `softFrom`-th also carry an extra chance of it, ramping evenly to certain at `within`.
 */
export interface PityFloor<R extends string> {
  readonly rarity: R;
  readonly within: number;
  readonly softFrom?: number;
}

/** A box's guarantees, one floor per rung that has one. */
export type PityRule<R extends string> = readonly PityFloor<R>[];

/** Pulls since the last pull at or above each floor's rung; a rung with no entry counts as 0. */
export type PityState<R extends string> = Readonly<Partial<Record<R, number>>>;

/** The guarantee that raised a pull: a hard floor's rung, `soft-<rung>` for a soft ramp, or null. */
export type PityTrigger<R extends string> = R | `soft-${R}` | null;

/** One draw: the rarity, the counters and rng after it, and the guarantee that raised it. */
export interface RarityDraw<R extends string> {
  rarity: R;
  pity: PityState<R>;
  rng: RngState;
  triggered: PityTrigger<R>;
}

/** Counters at zero for every floor of the rule. */
export function freshPity<R extends string>(rule: PityRule<R>): PityState<R> {
  const out: Partial<Record<R, number>> = {};
  for (const floor of rule) out[floor.rarity] = 0;
  return out;
}

/** Whether the table can drop `rarity` or anything above it: a floor only applies where it can pay out. */
export function canReach<R extends string>(ladder: Ladder<R>, odds: OddsTable<R>, rarity: R): boolean {
  return ladder.atLeast(rarity).some((r) => odds[r] > 0);
}

/** One draw from a table, no pity. A table with no weight draws the lowest rung. */
export function rollRarity<R extends string>(
  ladder: Ladder<R>,
  odds: OddsTable<R>,
  rng: RngState,
): [R, RngState] {
  const [idx, next] = pickWeighted(
    rng,
    ladder.ids.map((r) => odds[r]),
  );
  return [(ladder.at(idx) ?? ladder.ids[0]) as R, next];
}

/** A floor's extra chance (0..1) on a pull, `pull` 1-based since its rung last dropped: its soft ramp, else 0. */
export function softPityExtra<R extends string>(pull: number, floor: PityFloor<R>): number {
  if (floor.softFrom === undefined || pull <= floor.softFrom) return 0;
  if (pull >= floor.within) return 1;
  return (pull - floor.softFrom) / (floor.within - floor.softFrom);
}

const since = <R extends string>(pity: PityState<R>, rarity: R): number => pity[rarity] ?? 0;

/** The rule's floors, highest rung first: the order the hard floors and the soft ramps are checked in. */
const highestFirst = <R extends string>(ladder: Ladder<R>, rule: PityRule<R>): PityFloor<R>[] =>
  [...rule].sort((a, b) => ladder.compare(b.rarity, a.rarity));

/** Counters after a pull of `rarity`: a floor's resets at its rung or above. */
function advancePity<R extends string>(ladder: Ladder<R>, rule: PityRule<R>, pity: PityState<R>, rarity: R) {
  const out: Partial<Record<R, number>> = {};
  for (const floor of rule)
    out[floor.rarity] = ladder.isAtLeast(rarity, floor.rarity) ? 0 : since(pity, floor.rarity) + 1;
  return out;
}

/**
 * One rarity draw: the highest hard floor due, then each soft ramp above it (highest first, one float each while
 * its extra is above 0), then the weighted draw, which the floor lifts if it fell below.
 */
export function drawRarity<R extends string>(
  ladder: Ladder<R>,
  rng: RngState,
  odds: OddsTable<R>,
  pity: PityState<R>,
  rule: PityRule<R>,
): RarityDraw<R> {
  const floors = highestFirst(ladder, rule).filter((f) => canReach(ladder, odds, f.rarity));
  const due = floors.find((f) => since(pity, f.rarity) + 1 >= f.within);
  let floor: R | null = due?.rarity ?? null;
  let trigger: PityTrigger<R> = floor;

  let state = rng;
  for (const f of floors) {
    if (floor !== null && ladder.isAtLeast(floor, f.rarity)) continue;
    const extra = softPityExtra(since(pity, f.rarity) + 1, f);
    if (extra <= 0) continue;
    const [roll, next] = nextFloat(state);
    state = next;
    if (roll < extra) {
      floor = f.rarity;
      trigger = `soft-${f.rarity}`;
    }
  }

  const [drawn, afterRarity] = rollRarity(ladder, odds, state);
  let rarity = drawn;
  let triggered: PityTrigger<R> = null;
  if (floor !== null && !ladder.isAtLeast(drawn, floor)) {
    rarity = floor;
    triggered = trigger;
  }
  return { rarity, pity: advancePity(ladder, rule, pity, rarity), rng: afterRarity, triggered };
}

/** Odds as a UI prints them: highest rung first, zero rows dropped. */
export function publishedOdds<R extends string>(
  ladder: Ladder<R>,
  odds: OddsTable<R>,
): { rarity: R; percent: number }[] {
  return [...ladder.ids]
    .reverse()
    .filter((r) => odds[r] > 0)
    .map((r) => ({ rarity: r, percent: odds[r] }));
}

/** Pulls until each reachable guarantee ("Guaranteed Epic in 3 opens"); a rung the table cannot reach has none. */
export function pullsUntilPity<R extends string>(
  ladder: Ladder<R>,
  pity: PityState<R>,
  rule: PityRule<R>,
  odds: OddsTable<R>,
): Partial<Record<R, number>> {
  const out: Partial<Record<R, number>> = {};
  for (const floor of rule)
    if (canReach(ladder, odds, floor.rarity))
      out[floor.rarity] = Math.max(1, floor.within - since(pity, floor.rarity));
  return out;
}
