import { type Camera } from "three/webgpu";
/** A set of pinned labels and the projection that places them. */
export interface LabelBoard {
    /** Pins `el` to the world point `at`, shown while `when` (asked each frame) is true. Returns the remover. */
    pin(el: HTMLElement, at: readonly [number, number, number], when?: () => boolean): () => void;
    /** Places every pinned label for this frame's camera in a view of `width`×`height` CSS pixels. */
    project(camera: Camera, width: number, height: number): void;
    /** How many labels are pinned. */
    readonly size: number;
}
/**
 * Where a point at normalised device coordinates lands in a view of `width`×`height` CSS pixels, in whole pixels
 * (text on a half pixel is soft), or null when it is behind the camera or well outside the view.
 */
export declare function labelPlacement(ndc: {
    x: number;
    y: number;
    z: number;
}, width: number, height: number): {
    x: number;
    y: number;
} | null;
/** A board of its own; most games use the shared one through `pinLabel` and `<LabelProjector />`. */
export declare function createLabelBoard(): LabelBoard;
/** The shared board. */
export declare const labels: LabelBoard;
/** Pins `el` to a world point on the shared board. Returns the remover. */
export declare function pinLabel(el: HTMLElement, at: readonly [number, number, number], when?: () => boolean): () => void;
/** Places the shared board's labels for `camera` in a view of `width`×`height` CSS pixels. */
export declare function projectLabels(camera: Camera, width: number, height: number): void;
