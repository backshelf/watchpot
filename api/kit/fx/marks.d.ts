import { type CSSProperties } from "react";
/** `keyframes` with every property but transform, opacity, translate, scale and rotate taken out. Pure. */
export declare function compositorOnly(keyframes: readonly Keyframe[]): Keyframe[];
/**
 * The default mark's run: it pops up from 60% and rises as it fades; under reduced motion it only fades in place.
 * The mark is centred on its point by `translate(-50%, -50%)` in every frame.
 */
export declare function markKeyframes(reduced: boolean): Keyframe[];
/** How a mark runs: keyframes (or a function of reduced motion), duration and easing. */
export interface MarkRun {
    /** The run's keyframes, or a function of reduced motion; null leaves the animation to the game's CSS. */
    keyframes?: readonly Keyframe[] | ((reduced: boolean) => readonly Keyframe[] | null) | null;
    /** Default 600 (half under reduced motion). */
    duration?: number;
    /** Default `cubic-bezier(0.2, 0.8, 0.2, 1)`. */
    easing?: string;
}
/** One mark: its kind, its step up a streak, a word to print, its own class, and its run. */
export interface MarkOptions extends MarkRun {
    /** Written as `data-mark`. */
    kind?: string;
    /** Written as `--step`. Default 0. */
    step?: number;
    /** The mark's text (a figure lifting off: `×12`). */
    text?: string;
    /** A class beside the layer's mark class. */
    className?: string;
    /** Custom properties of its own (`{ "--tilt": "4deg" }`), for the game's CSS. */
    vars?: Readonly<Record<`--${string}`, string | number>>;
}
/** Options of `createMarks`: the cap, every mark's class and default run, and the gates. */
export interface MarksOptions extends MarkRun {
    /** The most marks at once; the oldest goes first. Default 18. */
    max?: number;
    /** Every mark's class. */
    className?: string;
    /** How long a mark the game's CSS animates lives, ms. Default 1600. */
    lifetime?: number;
    /** Default `prefersReducedMotion`. */
    reduced?: () => boolean;
    /** No mark is made while this holds. Default: the document is hidden. */
    hidden?: () => boolean;
}
/** What `createMarks` returns. */
export interface Marks {
    /** The layer marks go into (the `MarkLayer` attaches itself); returns the detach. */
    attach(layer: HTMLElement): () => void;
    /** Leaves a mark at a client point (px). Null when nothing is attached or the page is hidden. */
    at(x: number, y: number, options?: MarkOptions): HTMLElement | null;
    /** Leaves a mark at an element's middle. */
    on(el: Element, options?: MarkOptions): HTMLElement | null;
    /** Removes every mark. */
    clear(): void;
    /** How many marks are up. */
    live(): number;
}
/** A pool of marks for one layer; module level, so a handler anywhere can leave one. */
export declare function createMarks(options?: MarksOptions): Marks;
/** Props of `MarkLayer`: the marks it holds, and its class and style (its stacking order is the game's). */
export interface MarkLayerProps {
    marks: Marks;
    className?: string;
    style?: CSSProperties;
}
/** The layer a `Marks` draws into: over the viewport by default, never taking the pointer, hidden from assistive tech. */
export declare function MarkLayer({ marks, className, style }: MarkLayerProps): import("react").JSX.Element;
/** Options of `kick`. */
export interface KickOptions {
    /** A second kick on the same element and name within this is skipped, ms. Default 160. */
    gapMs?: number;
    now?: () => number;
}
/**
 * Restarts a CSS animation on `el`: `data-<name>` flips between `a` and `b`, so a keyframe keyed on each value starts
 * over even while the last is running (a balance's pill kicking as a payout lands). At most once per `gapMs` per
 * element and name; true when it kicked.
 */
export declare function kick(el: Element | null, name?: string, options?: KickOptions): boolean;
