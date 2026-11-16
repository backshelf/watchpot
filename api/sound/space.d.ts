/**
 * The space: where on the screen a sound happened, as a pan, a distance and an occlusion, and how the listener
 * hears it.
 *
 * `resolve` reads the geometry when it is called (one `getBoundingClientRect` for an element), never a cached frame:
 * the pan runs -1..1 across the viewport's width, scaled by `spread`; the distance is 0 inside the viewport's central
 * third and rises to 1 at its edge, and is 1 for an element scrolled out of view; the occlusion is what `place` said
 * of the element or the nearest of its ancestors. A point or element with no viewport to measure, and an element no
 * longer in the document, is at the centre.
 */
import type { CorePort } from "./port";
import type { Space } from "./types";
/** The space as `engine.ts` holds it. */
export interface SpaceCore {
    /** What a game sees: `sound.space`. `engine.ts` calls its `resolve` for every placed play. */
    api: Space;
    /** Sends the listener's mode. Called each time the core comes up. */
    boot(): void;
}
/** Builds the space. `spread` scales the pan (default 0.7: the screen's edge is not hard left). */
export declare function createSpace(port: CorePort, options?: {
    spread?: number;
}): SpaceCore;
