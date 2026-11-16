import { SURFACE } from "../content/words";
import type { Surface } from "./surface";
// @if weather
import { WEATHER } from "./weather";
// @end
// @if print
import { PRINT } from "./print";
// @end
// @if signal
import { SIGNAL } from "./signal";
// @end
// @if cells
import { CELLS } from "./cells";
// @end

/** The starter backdrops this game has, by `look.surface.base`. */
export const STARTERS = {
  // @if weather
  weather: WEATHER,
  // @end
  // @if print
  print: PRINT,
  // @end
  // @if signal
  signal: SIGNAL,
  // @end
  // @if cells
  cells: CELLS,
  // @end
} satisfies Record<string, Surface>;

/**
 * The page's backdrop: the starter the game was scaffolded with, or null for a page with none. The shader pass
 * replaces it with the game's own.
 */
export const BACKDROP: Surface | null = SURFACE === null ? null : ((STARTERS as Record<string, Surface>)[SURFACE] ?? null);
