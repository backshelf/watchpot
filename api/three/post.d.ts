import { type Camera, Color, type ColorRepresentation, type DirectionalLight, type Node, type Object3D, type PointLight, type Scene, type SpotLight, Vector3, type WebGPURenderer } from "three/webgpu";
import type { StagePreset } from "./quality";
/** A built post stack: render it each frame instead of `renderer.render`, and set what it draws with. */
export interface Post {
    /** Renders one frame through the stack. */
    render(): void;
    /** Where depth of field is sharp, in world space. */
    setFocus(point: Vector3): void;
    /** How much depth of field shows, 0 (everything sharp) to 1 (the lens's own range). */
    setDepthOfField(amount: number): void;
    /** The player's brightness: exposure as a multiple of the picture's own. */
    setBrightness(v: number): void;
    /**
     * How far the eye is from adapted to what it looks at, in stops: under zero the picture is darker than it will
     * settle, over zero brighter. The caller eases it.
     */
    setAdaptation(stops: number): void;
    /** Film grain over the picture, on or off. */
    setGrain(on: boolean): void;
    /** The god rays' colour, linear (a share of the light's own colour and strength reads as dust in the beam). */
    setRayColour(colour: Color): void;
    /**
     * The bounce-light pass's size as a share of the frame's, each way (0.25 to 1). It is most of a frame's GPU time
     * at SSGI and grows with the pixel count, while what it draws is soft: on a dense screen the stage holds it to
     * one sample a CSS pixel.
     */
    setIndirectScale(scale: number): void;
    /**
     * Compiles `object` as the scene pass will draw it, lit by the scene's lights. A shader is built for the render
     * target and the outputs it draws into, so a compile against the canvas would build one the pass never uses.
     * Frames may go on drawing meanwhile.
     */
    compile(object: Object3D): Promise<void>;
    /**
     * Compiles the whole scene for the scene pass, before the stack's first frame: all of it, in view or not. Drawn
     * uncompiled, every object would have its pipeline built as it is first drawn, each one stalling the GPU in
     * turn; compiled, they are built side by side and off the frame.
     */
    compileScene(): Promise<void>;
    dispose(): void;
}
/** The light god rays fall from. */
export type RayLight = SpotLight | DirectionalLight | PointLight;
/** Everything `buildPost` takes beyond the preset. Every number defaults to the value it was tuned at. */
export interface PostOptions {
    /** The light god rays fall from; none, and the rays are off. Its shadow map must exist already. */
    readonly light?: RayLight | null;
    /** Where depth of field is sharp at first. Default the origin. */
    readonly focus?: Vector3;
    /** Draw this instead of the picture (a debug view of some pass), or "rays" for the god rays alone. */
    readonly debug?: Node | "rays" | null;
    /** Screen-space GI (`gi: "ssgi"`). Defaults: radius 1.2, thickness 0.08, intensity 6 (a room a few metres). */
    readonly gi?: {
        readonly radius?: number;
        readonly thickness?: number;
        readonly intensity?: number;
    };
    /** Ambient occlusion alone (`gi: "gtao"`). Defaults: radius 0.12, scale 1.1, samples 12. */
    readonly ao?: {
        readonly radius?: number;
        readonly scale?: number;
        readonly samples?: number;
    };
    /**
     * God rays. GodraysNode's density multiplies the march length in world units (its demo is hundreds of metres
     * across), so a scene a metre or two across wants a hundred times the demo's. Defaults: density 20, maxDensity
     * 0.06, distanceAttenuation 3.2, colour #ffb97b.
     */
    readonly rays?: {
        readonly density?: number;
        readonly maxDensity?: number;
        readonly distanceAttenuation?: number;
        readonly colour?: ColorRepresentation;
    };
    /**
     * Depth of field. `range` is how far from the focal plane things go fully soft at `reference` metres of focus
     * (it grows with the square of the distance past that); `bokeh` the lens's blur scale. Defaults 0.7, 1.3, 3.2.
     */
    readonly dof?: {
        readonly range?: number;
        readonly reference?: number;
        readonly bokeh?: number;
    };
    /**
     * Bloom: only what is brighter than `threshold` (linear, so over 1 is brighter than white paper under the main
     * light) glows, and only a little. Defaults: strength 0.2, radius 0.3, threshold 1.15.
     */
    readonly bloom?: {
        readonly strength?: number;
        readonly radius?: number;
        readonly threshold?: number;
    };
    /** Vignette, the pmndrs formula. Defaults: offset 0.22, darkness 0.8. */
    readonly vignette?: {
        readonly offset?: number;
        readonly darkness?: number;
    };
    /** How much of the film's noise the picture takes while grain is on. Default 0.035. */
    readonly grain?: number;
}
/**
 * The out-of-focus range at a focus distance: depth of field grows with the square of the distance, as a lens's
 * does, so a far corner seen from across the scene reads sharp while something up close keeps a shallow focus.
 * Never tighter than at `reference`, so a thing held up to the eye does not go soft around its edges.
 */
export declare function focalRangeAt(distance: number, range?: number, reference?: number): number;
/** Builds the post stack for `preset` over `scene` seen by `camera`. */
export declare function buildPost(renderer: WebGPURenderer, scene: Scene, camera: Camera, preset: StagePreset, options?: PostOptions): Post;
