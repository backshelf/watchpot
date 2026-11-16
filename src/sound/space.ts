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
import { encode, SPACE_MODE } from "./protocol";
import type { Placement, PlayOptions, Space } from "./types";

/** The space as `engine.ts` holds it. */
export interface SpaceCore {
  /** What a game sees: `sound.space`. `engine.ts` calls its `resolve` for every placed play. */
  api: Space;
  /** Sends the listener's mode. Called each time the core comes up. */
  boot(): void;
}

/** The share of the viewport, from its middle, that is all at distance 0. */
const NEAR = 1 / 3;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const isElement = (at: NonNullable<PlayOptions["at"]>): at is Element =>
  typeof (at as Element).getBoundingClientRect === "function";

/** Builds the space. `spread` scales the pan (default 0.7: the screen's edge is not hard left). */
export function createSpace(port: CorePort, options: { spread?: number } = {}): SpaceCore {
  const spread = clamp(Number.isFinite(options.spread) ? (options.spread ?? 0.7) : 0.7, 0, 1);
  let mode: keyof typeof SPACE_MODE = "speakers";
  const occluded = new WeakMap<Element, number>();

  const sendMode = () => port.send(encode("SPACE_SET", { mode: SPACE_MODE[mode] }));

  function occlusionOf(el: Element): number {
    for (let at: Element | null = el; at; at = at.parentElement) {
      const value = occluded.get(at);
      if (value !== undefined) return value;
    }
    return 0;
  }

  function resolve(at: NonNullable<PlayOptions["at"]>): Placement {
    const occlusion = isElement(at) ? occlusionOf(at) : 0;
    const centre: Placement = { pan: 0, distance: 0, occlusion };
    if (typeof window === "undefined") return centre;
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (!(width > 0) || !(height > 0)) return centre;
    let x: number;
    let y: number;
    let outside = false;
    if (isElement(at)) {
      if (!at.isConnected) return centre;
      const rect = at.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
      outside = rect.bottom < 0 || rect.top > height || rect.right < 0 || rect.left > width;
    } else {
      if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) return centre;
      x = at.x;
      y = at.y;
    }
    // -1..1 from the middle on each axis.
    const across = (x / width) * 2 - 1;
    const down = (y / height) * 2 - 1;
    const edge = Math.max(Math.abs(across), Math.abs(down));
    return {
      pan: clamp(across * spread, -1, 1),
      distance: outside ? 1 : clamp((edge - NEAR) / (1 - NEAR), 0, 1),
      occlusion,
    };
  }

  return {
    api: {
      listener(options) {
        if (!(options.mode in SPACE_MODE)) return;
        mode = options.mode;
        sendMode();
      },
      place(at, options) {
        const value = options.occluded;
        if (value === undefined || !Number.isFinite(value) || value <= 0) occluded.delete(at);
        else occluded.set(at, clamp(value, 0, 1));
      },
      resolve,
    },
    boot: sendMode,
  };
}
