import { type RefObject } from "react";
/**
 * Any CSS colour as `#rrggbbaa` (`#abc`, `rgb()`, `hsl()`, `oklch()`, a name): hex is read directly, anything else
 * is painted to a 1x1 canvas and read back, so every colour space the browser knows lands in sRGB. Null for an empty
 * or unknown value, or for a non-hex value where there is no canvas.
 */
export declare function parseColour(value: string): string | null;
/** Reads `names` (custom properties, `--x`) at `el` as colours; null if any is not a colour there. */
export declare function readTokens<N extends string>(el: Element, names: readonly N[]): Record<N, string> | null;
/**
 * The colour tokens `names` at `ref`'s element, as `#rrggbbaa` strings a shader's uniforms take directly; null
 * until every one reads as a colour (no stylesheet: show the still). Read again when `data-theme`, `data-scheme`,
 * `class` or `style` changes on the element or any ancestor, and when the system colour scheme flips.
 */
export declare function useShaderTokens<N extends string>(ref: RefObject<Element | null>, names: readonly N[]): Record<N, string> | null;
