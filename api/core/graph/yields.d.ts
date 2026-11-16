/**
 * Yields: what one part of the game pays into another. An action anywhere (a stage cleared, a keypress) grants a
 * currency somewhere else, `per` action, at a rate a stat sets, so any tree can raise it. Fractions carry, so a
 * fifth of a pickaxe a stage pays one every five stages. The data lives with what receives it (an event's `fuel`);
 * the store applies it where the action happens.
 */
/** A yield on one of the game's actions: `A` is the game's own union of them (a stage cleared, a keypress). */
export interface Yield<A extends string> {
    on: A;
    /** Units per action, before the rate. */
    per: number;
}
/** Whole units `count` actions pay at `per` each times `rate`, and the fraction left to carry. */
export declare function yieldUnits(per: number, count: number, rate: number, carry: number): {
    units: number;
    carry: number;
};
