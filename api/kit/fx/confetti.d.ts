/**
 * Confetti presets by rung, on canvas-confetti. The rule is one loud thing: five presets climb with the rung's
 * height (`tierStep(tier, 5)`), so the lowest rung gets nothing, the next a polite puff, and the storm is kept for
 * the top; on a five-rung ladder each rung has its own. Colours are read from the tokens at fire time (the rung's
 * hue is `--rarity-<id>`), so the same call in another theme comes out in its colours. Nothing fires while motion is
 * reduced (the OS or the in-game setting, `prefersReducedMotion`), and every shot still passes
 * `disableForReducedMotion`.
 */
import { type Options } from "canvas-confetti";
import { type RarityTier } from "./rarity";
/** One call to canvas-confetti, `delay` ms after the preset starts. */
export interface Shot {
    delay: number;
    options: Options;
}
/** The token colours a preset draws from. An empty string means the token was not found. */
export interface ConfettiColors {
    paper: string;
    /** The rung's own hue. */
    hue: string;
    muted: string;
    foil: string[];
}
/** Options for a confetti burst: where it starts, the canvas to draw on and the element whose theme it reads. */
export interface FireOptions {
    /** Where the burst starts, as fractions of the canvas (default: the middle, a little low). */
    origin?: {
        x: number;
        y: number;
    };
    /** Draw on this canvas instead of the full-window one (for example inside the game tab frame). */
    canvas?: HTMLCanvasElement;
    /** Read the colours from this element's theme instead of the document root. */
    scope?: Element | null;
}
/** Reads the colours the presets use from the tokens: `--paper`, the rung's hue, `--ink-muted`, the foil stops. */
export declare function readConfettiColors(tier: RarityTier | null, scope?: Element | null): ConfettiColors;
/**
 * The shots for a rung: none, a puff of paper, a burst in its hue, a rain of its hue and the gold stop, a storm of
 * every foil stop. Pure: no canvas, no timers. Empty when the preset is none or its colours are missing.
 */
export declare function confettiShots(tier: RarityTier, colors: ConfettiColors, origin?: {
    x: number;
    y: number;
}): Shot[];
/** One grey square (`--ink-muted`), popped a little way up, falling flat: the sad confetti. Pure, like `confettiShots`. */
export declare function centsShots(colors: ConfettiColors, origin?: {
    x: number;
    y: number;
}): Shot[];
/** Fires the rung's preset (the lowest does nothing). */
export declare function burst(tier: RarityTier, options?: FireOptions): void;
/** Fires the single sad grey square. */
export declare function cents(options?: FireOptions): void;
