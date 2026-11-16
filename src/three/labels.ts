// DOM labels pinned to points in the world, so words a player has to read are drawn by the browser at the screen's
// own sharpness instead of on a small tilted card across a dim scene. A label registers its element and its point;
// the stage projects them all each frame, after whatever moves the camera.
import { type Camera, Vector3 } from "three/webgpu";

type Pin = {
  at: Vector3;
  el: HTMLElement;
  /** Asked each frame: false hides the label. */
  when?: () => boolean;
};

/** A set of pinned labels and the projection that places them. */
export interface LabelBoard {
  /** Pins `el` to the world point `at`, shown while `when` (asked each frame) is true. Returns the remover. */
  pin(el: HTMLElement, at: readonly [number, number, number], when?: () => boolean): () => void;
  /** Places every pinned label for this frame's camera in a view of `width`×`height` CSS pixels. */
  project(camera: Camera, width: number, height: number): void;
  /** How many labels are pinned. */
  readonly size: number;
}

/** How far past the view's edge (in normalised device units) a label's point may be and still show. */
const MARGIN = 1.2;

/**
 * Where a point at normalised device coordinates lands in a view of `width`×`height` CSS pixels, in whole pixels
 * (text on a half pixel is soft), or null when it is behind the camera or well outside the view.
 */
export function labelPlacement(
  ndc: { x: number; y: number; z: number },
  width: number,
  height: number,
): { x: number; y: number } | null {
  if (!(ndc.z < 1) || Math.abs(ndc.x) >= MARGIN || Math.abs(ndc.y) >= MARGIN) return null;
  return { x: Math.round((ndc.x * 0.5 + 0.5) * width), y: Math.round((-ndc.y * 0.5 + 0.5) * height) };
}

/** A board of its own; most games use the shared one through `pinLabel` and `<LabelProjector />`. */
export function createLabelBoard(): LabelBoard {
  const pins = new Set<Pin>();
  const scratch = new Vector3();
  return {
    pin(el, at, when) {
      const pin: Pin = { at: new Vector3(...at), el, when };
      pins.add(pin);
      return () => void pins.delete(pin);
    },
    project(camera, width, height) {
      for (const pin of pins) {
        scratch.copy(pin.at).project(camera);
        const place = labelPlacement(scratch, width, height);
        const shown = place !== null && (pin.when?.() ?? true);
        const s = pin.el.style;
        s.visibility = shown ? "visible" : "hidden";
        if (!shown || !place) continue;
        s.transform = `translate(${place.x}px, ${place.y}px) translate(-50%, -50%)`;
      }
    },
    get size() {
      return pins.size;
    },
  };
}

/** The shared board. */
export const labels: LabelBoard = createLabelBoard();

/** Pins `el` to a world point on the shared board. Returns the remover. */
export function pinLabel(
  el: HTMLElement,
  at: readonly [number, number, number],
  when?: () => boolean,
): () => void {
  return labels.pin(el, at, when);
}

/** Places the shared board's labels for `camera` in a view of `width`×`height` CSS pixels. */
export function projectLabels(camera: Camera, width: number, height: number): void {
  labels.project(camera, width, height);
}
