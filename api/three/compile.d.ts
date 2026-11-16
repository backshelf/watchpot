import type { Camera, MRTNode, Object3D, RenderTarget, Scene, WebGPURenderer } from "three/webgpu";
/** Where a pass draws: its render target (null for the canvas) and its outputs (null for colour alone). */
export interface Destination {
    readonly target: RenderTarget | null;
    readonly outputs: MRTNode | null;
}
/** The canvas, colour alone. */
export declare const CANVAS: Destination;
/** Runs `compile` (a call of three's `compileAsync`, under whatever name) once the one before it has settled. */
export declare function compileInTurn(compile: () => Promise<void>): Promise<void>;
/**
 * Compiles `object` as a pass drawing into `to` will draw it, seen from `camera`; when `object` is not the scene
 * itself, `lights` is the scene whose lights it is drawn under. Safe to call while frames draw. Resolves once the
 * pipelines are built; what is compiled is `object` as it stands when its turn comes.
 */
export declare function compileFor(renderer: WebGPURenderer, to: Destination, object: Object3D, camera: Camera, lights?: Scene | null): Promise<void>;
