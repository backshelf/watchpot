/**
 * The pity a box carries, as a shelf and an odds sheet show it. The kit computes no guarantee (the game's gacha
 * does, `pullsUntilPity`); it takes each guarantee's window and the opens left to it, and reads the ladder of rungs,
 * the nearest one for the box's pity line, and the shelf's light from them.
 */
/** A guarantee as the game's gacha reports it: its rung, its window, and the opens left (absent where it cannot pay). */
export interface Guarantee<R extends string> {
    rarity: R;
    /** The guarantee lands within this many opens. */
    within: number;
    /** Opens left until it; 1 means the next open. Null or undefined where the box cannot pay it. */
    left: number | null | undefined;
}
/** One rung of a box's pity ladder: the guarantee, and where the player stands on it. */
export interface PityRung<R extends string> {
    rarity: R;
    within: number;
    /** Opens since the last one that paid it. */
    since: number;
    /** Opens left until the guarantee; 1 means the next open. */
    left: number;
}
/** The ladder of a box's guarantees, in the order given (lowest rung first); one the box cannot pay is absent. */
export declare function pityRungs<R extends string>(guarantees: readonly Guarantee<R>[]): PityRung<R>[];
/** The guarantee a pity line names: the nearest; a tie goes to the higher rung (the later, lowest first). */
export declare function nearestGuarantee<R extends string>(rungs: readonly PityRung<R>[]): PityRung<R> | null;
/**
 * How a box stands on its shelf: lit from below in its shelf colour, as strong as `fill` (0..1, the game's measure
 * of what the box is worth: 0.45 at none, 1 from 1), and charged as its nearest guarantee comes round (0 with none
 * to come, 1 when the next open is guaranteed), so the shelf shows the pity line the lot prints.
 */
export interface ShelfLight<R extends string> {
    rarity: R;
    strength: number;
    charge: number;
}
/** How a box stands on its shelf: strength by how full its pity is, and a charge when the next open pays. */
export declare function shelfLight<R extends string>(colour: R, fill: number, rungs: readonly PityRung<R>[]): ShelfLight<R>;
