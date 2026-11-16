import { type CSSProperties, type ReactNode } from "react";
import { type ShaderScheduler } from "./scheduler";
import { type UniformKinds, type Uniforms } from "./uniforms";
/** Props of `ShaderPool`: the tiles inside, the live cap, reduced motion, and an injected scheduler for tests. */
export interface ShaderPoolProps {
    children?: ReactNode;
    /** How many tiles animate at once; the oldest live ones past it hold a frame. Default 12. */
    maxLive?: number;
    /** Reduced motion (the game's setting): every tile draws one frame and holds. */
    reduced?: boolean;
    /** How far outside the viewport a tile wakes, as an IntersectionObserver root margin. Default "128px". */
    rootMargin?: string;
    /** A scheduler of your own (tests inject one with a fake clock); the pool makes one by default. */
    scheduler?: ShaderScheduler;
}
/**
 * One WebGL2 context for every `ShaderTile` inside, made on the first draw. Tiles sleep off screen and while the tab
 * is hidden; at most `maxLive` animate at once (the newest win). Programs are cached by fragment; a lost context is
 * rebuilt on restore and every tile redraws.
 */
export declare function ShaderPool({ children, maxLive, reduced, rootMargin, scheduler, }: ShaderPoolProps): import("react").JSX.Element;
/** Props of `ShaderTile`: the fragment and uniforms, time and budget controls, the still and the canvas's class. */
export interface ShaderTileProps {
    fragment: string;
    uniforms?: Uniforms;
    kinds?: UniformKinds;
    /** Drive time yourself (seconds): the tile then draws on change instead of animating. */
    time?: number;
    /** The highest pixel ratio drawn at. Default 2. */
    dpr?: number;
    /** The most pixels drawn for this tile. Default 250,000. */
    maxPixels?: number;
    /** Hold the current frame (the tile stops animating). */
    paused?: boolean;
    /** The time drawn under the pool's reduced motion, seconds. Default 0. */
    reducedTime?: number;
    /** Drawn instead of the canvas when the pool has no WebGL2 or this fragment fails. */
    still?: ReactNode;
    onError?: (log: string) => void;
    className?: string;
    style?: CSSProperties;
}
/**
 * A small shader drawn by the nearest `ShaderPool` into its own 2D canvas (size it with CSS): a card's foil, a
 * button's shimmer. It animates while live and visible within the pool's cap, draws on change otherwise, and shows
 * `still` when the pool cannot draw it. `aria-hidden`: decoration.
 */
export declare function ShaderTile({ fragment, uniforms, kinds, time, dpr, maxPixels, paused, reducedTime, still, onError, className, style, }: ShaderTileProps): import("react").JSX.Element;
