import { type CanvasProps } from "@react-three/fiber";
import { type ReactNode } from "react";
import { type Camera, Color, type ColorRepresentation, type Object3D, type Scene, WebGPURenderer } from "three/webgpu";
import { type PaceClock } from "../core/pace";
import type { Prefs } from "../core/prefs";
import type { FrameRate } from "./fps";
import { type StageParams } from "./params";
import { type PerfReport } from "./perf";
import { type Post, type PostOptions, type RayLight } from "./post";
import { type Quality, type StagePreset } from "./quality";
import type { View } from "./view";
/** Why the stage stopped: the GPU device or the WebGL context was lost. */
export interface StageLost {
    readonly api: "WebGL" | "WebGPU";
    readonly message: string;
    readonly reason: string | null;
}
/** Where the boot is (`StageBoot`): none mounted, waiting on the game, compiling, drawing its settle frames, done. */
export type BootPhase = "none" | "waiting" | "compiling" | "settling" | "ready";
/** What the stage is doing, for UI outside the canvas. */
export interface StageStatus {
    /** The first frame is plain, then the post stack's first compile, then drawing. */
    readonly start: "plain" | "compiling" | "drawing";
    readonly boot: BootPhase;
    /** Set once the GPU device or context is lost; the stage draws nothing after. */
    readonly lost: StageLost | null;
    /** Three fell back to WebGL2: the lowest tier runs whatever was chosen. */
    readonly webgl: boolean;
    /** The page is hidden and the stage is not drawing. */
    readonly hidden: boolean;
}
/** What a pre-pass is handed each drawn frame. */
export interface PrePassContext<P extends StagePreset = StagePreset> {
    readonly renderer: WebGPURenderer;
    readonly scene: Scene;
    readonly camera: Camera;
    /** The preset the stack on screen was built for. */
    readonly preset: P;
    /** This frame's real seconds since the last, clamped. */
    readonly dt: number;
    /** True on the stage's one plain first frame. */
    readonly first: boolean;
}
/** The imperative face of a stage: what a game sets each frame and what it reads. */
export interface StageHandle {
    /** The stage's pace clock: read `now()` in `useFrame` so one `setScale` slows the whole scene. */
    readonly clock: PaceClock;
    /** What the address asked of this load. */
    readonly params: StageParams;
    /** Reduced motion: hold still what can hold still. */
    readonly reduced: boolean;
    /** This frame's real seconds since the last, clamped (a hidden page or a stall never jumps a frame). */
    dt(): number;
    /** The renderer once it is up. */
    renderer(): WebGPURenderer | null;
    /** Where depth of field is sharp, world. */
    setFocus(point: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
    }): void;
    /** Depth of field on or off; it eases open and closed. The view's own setting still gates it. */
    setDepthOfField(on: boolean): void;
    /**
     * The eye's adaptation in stops (under zero darker than it will settle). Each `channel` is summed: one for the
     * scene's light, another for something bright held close. Already eased by the caller.
     */
    setAdaptation(stops: number, channel?: string): void;
    /** Exposure as a multiple of the picture's own. Overridden by a `view` passed to the stage. */
    setBrightness(v: number): void;
    /** Film grain on or off. Overridden by a `view` passed to the stage. */
    setGrain(on: boolean): void;
    /** The god rays' colour, linear. */
    setRayColour(colour: ColorRepresentation | Color): void;
    /** Compiles `object` as the stack on screen will draw it; before the stack is up, it compiles on first sight. */
    compile(object: Object3D): Promise<void>;
    /** How many frames the post stack has drawn. */
    frames(): number;
    /** The post stack on screen, if built. */
    post(): Post | null;
    /** A capture of the next drawn frame, scaled by `scale`, as a JPEG blob (a WebGPU canvas is read in-frame). */
    capture(scale?: number): Promise<Blob | null>;
    /** Holds the frame loop (nothing draws) until the returned release is called. Holds stack. */
    hold(): () => void;
    /** What the stage is doing. */
    status(): StageStatus;
    /** Calls `listener` when the status changes. */
    subscribe(listener: () => void): () => void;
    /** For a boot component: its phase. */
    setBoot(phase: BootPhase): void;
}
/** The stage's handle, inside the canvas or anywhere under `<Stage>`. */
export declare function useStage(): StageHandle;
/** The stage's status in React: the boot phase, a lost device, the WebGL fallback, a hidden page. */
export declare function useStageStatus(): StageStatus;
/** The god-ray light and the rest of `PostOptions`, as the stage takes them. */
export interface StagePostOptions extends Omit<PostOptions, "light" | "focus"> {
    /** Asked when a stack is built: the light god rays fall from (its shadow map exists by then), or none. */
    readonly light?: () => RayLight | null;
}
/** What `<Stage>` takes. */
export interface StageProps<P extends StagePreset = StagePreset> {
    readonly children?: ReactNode;
    /** DOM over the canvas (a boot cue, a HUD): it sits under the stage's context, so it can read `useStageStatus`. */
    readonly overlay?: ReactNode;
    /** The tier store. Default: `DEFAULT_TIERS` at `high`, kept in memory. */
    readonly quality?: Quality<P>;
    /** The frame cap and fps reading. Default: none (every frame drawn, nothing counted). */
    readonly frameRate?: FrameRate | null;
    /** The player's view settings, read each frame (brightness, grain, depth of field). Or use the setters. */
    readonly view?: Prefs<Pick<View, "brightness" | "grain" | "depthOfField">> | null;
    /** The r3f camera: position, fov, near, far. */
    readonly camera?: CanvasProps["camera"];
    /** Frame by horizontal field of view in degrees: the vertical one follows the window. Default: off. */
    readonly horizontalFov?: number;
    /** Default "percentage" (PCF shadows). */
    readonly shadows?: CanvasProps["shadows"];
    /** Reduced motion, the game's own setting (the stage reads no media query). */
    readonly reduced?: boolean;
    /** The pace clock. Default: one over `performance.now()`. */
    readonly clock?: PaceClock;
    /** Default: read from the page's address (`readStageParams`). */
    readonly params?: StageParams;
    readonly post?: StagePostOptions;
    /** Runs every drawn frame after the renderer is reset to the canvas and before the picture: a game's own passes. */
    readonly prePasses?: (ctx: PrePassContext<P>) => void;
    /** Called once when the GPU device or the WebGL context is lost. */
    readonly onLost?: (lost: StageLost) => void;
    /** Puts a dev handle on `window` under this name (renderer, scene, camera, clock, capture). Default: none. */
    readonly consoleName?: string;
    /** Real seconds depth of field takes to open out or close in. Default 0.6. */
    readonly dofEase?: number;
    /** The longest frame `dt` reports, seconds. Default 0.1. */
    readonly maxDelta?: number;
    /** Milliseconds the first compile may hold the picture before the stage draws regardless. Default 20000. */
    readonly compilePatience?: number;
    /** Where a perf run's result goes (`line` ends with the tier and the size). Default: one `console.info` line. */
    readonly onPerf?: (report: PerfReport, line: string) => void;
    /** Default "high-performance". */
    readonly powerPreference?: "high-performance" | "low-power";
}
/** The stage: a canvas on the WebGPU renderer, the post stack, and the frame loop. Mount the scene inside. */
export declare function Stage<P extends StagePreset = StagePreset>(props: StageProps<P>): import("react").JSX.Element;
