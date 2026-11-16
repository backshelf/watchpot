/**
 * A season's or an event's colours, as content data (hex): the accent, the raised ground and the glow. `src/ui/world.ts`
 * turns it into custom properties on a root. Defined here so the engine's definitions can carry it without importing
 * from `src/ui`; `src/ui/world.ts` re-exports it.
 */
export interface WorldOverlay {
  /** The fill for primary buttons and the active marker; ivory text on it must hold 4.5:1. */
  accent: string;
  /** A dark surface, the world's `ground-raised`; ivory text on it must hold 4.5:1. */
  ground: string;
  /** The light that spills from the title and the primary button. Never a rarity hue. */
  glow: string;
}
