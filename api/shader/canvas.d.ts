import { type CSSProperties, type ReactNode, type Ref } from "react";
import { type UniformKinds, type Uniforms } from "./uniforms";
/** What a `ShaderCanvas` ref holds: the canvas, a way to push uniforms without a render, and a one-off draw. */
export interface ShaderHandle {
    readonly canvas: HTMLCanvasElement | null;
    /**
     * Merges values into the uniforms and draws them (on the next frame while animating, now otherwise). A pushed
     * value stays until it is pushed again; a later render's `uniforms` wins only for the names it passes.
     */
    setUniforms: (values: Uniforms) => void;
    /** Draws one frame now. */
    frame: () => void;
    /**
     * Pins this canvas's clock (`u_time`) at `seconds` and holds that frame, over `time`, `reduced` and the page's
     * pin, until `pin(null)` lets it run on from where it was. For development: a screenshot of one instant of a
     * transition, repeatable.
     */
    pin: (seconds: number | null) => void;
}
/**
 * Pins every `ShaderCanvas` on the page at `seconds` of its clock (`u_time`), each holding that frame, until
 * `pinShaderClock(null)` lets them run on. For development: a screenshot of one instant, the backdrop and the hero
 * together. A canvas's own `pin` wins over it.
 */
export declare function pinShaderClock(seconds: number | null): void;
/**
 * The page's pin as `pinShaderClock` left it (seconds, or null while the clocks run): for a surface that keeps a
 * clock of its own (`useSteppedFrame`, a game's timeline) to hold the same instant the canvases do.
 */
export declare function shaderClockPin(): number | null;
/** Props of `ShaderCanvas`: the fragment, its uniforms, time and budget controls, the still and the canvas's class. */
export interface ShaderCanvasProps {
    /** The game's GLSL ES 3.00 fragment, written after `SHADER_HEAD` (declare its uniforms; write `main`). */
    fragment: string;
    /** The game's uniforms; pushed to the GPU when they change by value, without a React render of their own. */
    uniforms?: Uniforms;
    /** Kinds for values inference gets wrong (an `int`, a 3-float array). */
    kinds?: UniformKinds;
    /** Drive time yourself (seconds): the canvas then draws on change instead of looping. */
    time?: number;
    /** The highest pixel ratio drawn at. Default 2. */
    dpr?: number;
    /** The most pixels drawn; the ratio drops past it. Default 1,000,000. */
    maxPixels?: number;
    /**
     * The most frames drawn a second while it loops (a surface that moves slowly, or in steps on purpose). The clock
     * keeps the display's time; only the draws are fewer. Default: every display frame.
     */
    fps?: number;
    /** Hold the current frame. */
    paused?: boolean;
    /** Reduced motion (the game passes its setting): one frame at `reducedTime`, held. */
    reduced?: boolean;
    /** The time drawn under `reduced`, seconds. Default 0. */
    reducedTime?: number;
    /** Track the pointer over the canvas into `u_pointer`. Default false (it stays in the middle). */
    pointer?: boolean;
    /** Drawn instead of the canvas when WebGL2 is missing or the shader fails (a CSS gradient). */
    still?: ReactNode;
    /** Told why there is no shader: "WebGL2 is unavailable" or the driver's log with the fragment's line numbers. */
    onError?: (log: string) => void;
    className?: string;
    style?: CSSProperties;
    ref?: Ref<ShaderHandle>;
}
/**
 * A fragment shader filling its canvas (size the canvas with CSS). WebGL2, one triangle, the game's GLSL after
 * `SHADER_HEAD`. It renders only while on screen and the tab is visible, at most `maxPixels` at up to `dpr` and
 * `fps` times a second; under `reduced` it draws one frame and holds; a lost context is rebuilt on restore.
 * Without WebGL2, or when the shader fails to build, `still` renders in its place and `onError` hears why. The
 * canvas is `aria-hidden`: it is decoration.
 */
export declare function ShaderCanvas({ fragment, uniforms, kinds, time, dpr, maxPixels, fps, paused, reduced, reducedTime, pointer, still, onError, className, style, ref, }: ShaderCanvasProps): import("react").JSX.Element;
