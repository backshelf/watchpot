/**
 * A rung of a game's rarity ladder, as the kit's effects take it: never a name the kit knows, only where the rung
 * stands (`index` of `count`, 0 the lowest) and its `id`, which names its hue token (`--rarity-<id>`). Each effect
 * reads the rung's height (`tierIntensity`) and picks its look from that, so a three-rung ladder and a five-rung one
 * both run from the plainest look to the loudest.
 */
export interface RarityTier {
    index: number;
    count: number;
    id: string;
    /** The rung's word as the game prints it ("Epic"), where the ui kit names the tier; the `id` without one. */
    label?: string;
}
/** The rung `id` stands on in `ladder` (lowest first); an id the ladder lacks is its lowest rung. */
export declare function tierOf(ladder: readonly string[], id: string): RarityTier;
/**
 * How high a rung stands, 0 the lowest to 1 the top: `index / (count - 1)`; a ladder of one rung is its top, and
 * an empty ladder (no game's ladder given yet) its bottom.
 */
export declare function tierIntensity({ index, count }: RarityTier): number;
/** The step of `steps` (0..steps - 1) a rung's height lands nearest: the look an effect with fixed looks picks. */
export declare function tierStep(tier: RarityTier, steps: number): number;
/**
 * A value read off `stops` (spaced evenly from the lowest rung to the top) at a rung's height, linear between
 * stops: a ladder with as many rungs as stops lands on each stop exactly.
 */
export declare function tierRamp(stops: readonly number[], tier: RarityTier): number;
/** A rung's hue token, read from the scope it is drawn in. */
export declare const tierToken: (tier: RarityTier) => string;
/** The ladder's last rung. */
export declare const isTopTier: (tier: RarityTier) => boolean;
/** The rung's word: its `label`, else its `id`. */
export declare const tierLabel: (tier: RarityTier) => string;
/** The rung's hue token as a `var()` a style property takes (`var(--rarity-<id>)`). */
export declare const tierInk: (tier: RarityTier) => string;
