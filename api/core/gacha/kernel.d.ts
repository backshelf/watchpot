import { type RngState } from "../rng";
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
export declare function freshPity<R extends string>(rule: PityRule<R>): PityState<R>;
/** Whether the table can drop `rarity` or anything above it: a floor only applies where it can pay out. */
export declare function canReach<R extends string>(ladder: Ladder<R>, odds: OddsTable<R>, rarity: R): boolean;
/** One draw from a table, no pity. A table with no weight draws the lowest rung. */
export declare function rollRarity<R extends string>(ladder: Ladder<R>, odds: OddsTable<R>, rng: RngState): [R, RngState];
/** A floor's extra chance (0..1) on a pull, `pull` 1-based since its rung last dropped: its soft ramp, else 0. */
export declare function softPityExtra<R extends string>(pull: number, floor: PityFloor<R>): number;
/**
 * One rarity draw: the highest hard floor due, then each soft ramp above it (highest first, one float each while
 * its extra is above 0), then the weighted draw, which the floor lifts if it fell below.
 */
export declare function drawRarity<R extends string>(ladder: Ladder<R>, rng: RngState, odds: OddsTable<R>, pity: PityState<R>, rule: PityRule<R>): RarityDraw<R>;
/** Odds as a UI prints them: highest rung first, zero rows dropped. */
export declare function publishedOdds<R extends string>(ladder: Ladder<R>, odds: OddsTable<R>): {
    rarity: R;
    percent: number;
}[];
/** Pulls until each reachable guarantee ("Guaranteed Epic in 3 opens"); a rung the table cannot reach has none. */
export declare function pullsUntilPity<R extends string>(ladder: Ladder<R>, pity: PityState<R>, rule: PityRule<R>, odds: OddsTable<R>): Partial<Record<R, number>>;
