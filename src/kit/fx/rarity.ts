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
export function tierOf(ladder: readonly string[], id: string): RarityTier {
  return { index: Math.max(0, ladder.indexOf(id)), count: ladder.length, id };
}

/**
 * How high a rung stands, 0 the lowest to 1 the top: `index / (count - 1)`; a ladder of one rung is its top, and
 * an empty ladder (no game's ladder given yet) its bottom.
 */
export function tierIntensity({ index, count }: RarityTier): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  return Math.min(1, Math.max(0, index / (count - 1)));
}

/** The step of `steps` (0..steps - 1) a rung's height lands nearest: the look an effect with fixed looks picks. */
export function tierStep(tier: RarityTier, steps: number): number {
  return Math.round(tierIntensity(tier) * (steps - 1));
}

/**
 * A value read off `stops` (spaced evenly from the lowest rung to the top) at a rung's height, linear between
 * stops: a ladder with as many rungs as stops lands on each stop exactly.
 */
export function tierRamp(stops: readonly number[], tier: RarityTier): number {
  const last = stops.length - 1;
  if (last <= 0) return stops[0] ?? 0;
  const at = tierIntensity(tier) * last;
  const lo = Math.floor(at);
  const a = stops[lo] ?? 0;
  const b = stops[Math.min(last, lo + 1)] ?? a;
  return a + (b - a) * (at - lo);
}

/** A rung's hue token, read from the scope it is drawn in. */
export const tierToken = (tier: RarityTier): string => `--rarity-${tier.id}`;

/** The ladder's last rung. */
export const isTopTier = (tier: RarityTier): boolean => tier.index === tier.count - 1;

/** The rung's word: its `label`, else its `id`. */
export const tierLabel = (tier: RarityTier): string => tier.label ?? tier.id;

/** The rung's hue token as a `var()` a style property takes (`var(--rarity-<id>)`). */
export const tierInk = (tier: RarityTier): string => `var(${tierToken(tier)})`;
