import { type Camera, Group, type Object3D, type Scene, type Texture, type WebGPURenderer } from "three/webgpu";
/** Settles when the GPU has done everything asked of it so far (at once where there is no queue to ask). */
export declare function drained(renderer: WebGPURenderer): Promise<void>;
/** How long each part of the boot took, in milliseconds from `performance.now()`'s origin. */
export interface BootTiming {
    readonly precompiled: boolean;
    /** When the boot started (the renderer was up). */
    readonly started: number;
    /** When the warm set and the game's preparation were done and the frame loop let go. */
    readonly compiled: number;
    /** When the settle frames had been asked for. */
    readonly framed: number;
    /** When the GPU had caught up: ready. */
    readonly ready: number;
}
/** What the game hands the boot. */
export interface StageBootOptions {
    /** Objects for every shader the scene will need but does not show yet; added under one group out of view. */
    readonly warm?: () => readonly Object3D[];
    /** Settles before anything else (the game's fonts, its first content in the scene). */
    readonly before?: () => Promise<unknown>;
    /** Runs once the warm set is in the scene, before the stage compiles: the game's own passes' prewarms. */
    readonly prepare?: (ctx: {
        readonly renderer: WebGPURenderer;
        readonly scene: Scene;
        readonly camera: Camera;
        readonly warm: Group;
    }) => Promise<unknown>;
    /** Textures to upload ahead of the first draw (`renderer.initTexture`), once loaded. */
    readonly textures?: () => readonly Texture[] | Promise<readonly Texture[]>;
    /** Frames the post stack draws before the boot calls the scene ready: it builds its own passes in the first two. */
    readonly settleFrames?: number;
    /** Where the warm set stands, world y: out of every view. Default -20. */
    readonly warmY?: number;
    /** Called once the GPU has caught up; the warm set has left the scene. */
    readonly onReady?: (timing: BootTiming) => void;
    /** The console line's prefix, or false for none. Default "boot". */
    readonly log?: string | false;
    /** Compile ahead. Default: the stage's `precompile` param. */
    readonly precompile?: boolean;
}
/**
 * The boot, as a hook inside the canvas: holds the frame loop until the warm set is in and prepared, lets the stage
 * compile and draw its settle frames, waits for the GPU, then reports ready (`useStageStatus().boot`).
 */
export declare function useStageBoot(options?: StageBootOptions): void;
/** `useStageBoot` as a component: mount once inside the canvas, after the scene. */
export declare function StageBoot(props: StageBootOptions): null;
