import { type UniformKinds, type Uniforms } from "./uniforms";
/** The context options every canvas asks for: no depth, no stencil, no antialias, premultiplied alpha. */
export declare const CONTEXT_ATTRIBUTES: WebGLContextAttributes;
/** What a frame draws with besides the game's uniforms: the target size, the time, the pixel ratio, the pointer. */
export interface FrameInputs {
    width: number;
    height: number;
    /** Seconds. */
    time: number;
    pixelRatio: number;
    /** 0..1 from the bottom-left. */
    pointer: readonly [number, number];
}
/** A program built from `SHADER_HEAD` and a game's fragment, or the reason it could not be. */
export declare class ShaderProgram {
    readonly program: WebGLProgram | null;
    /** The driver's log with the game's line numbers, when compile or link failed. */
    readonly error: string | null;
    private readonly gl;
    private readonly locations;
    constructor(gl: WebGL2RenderingContext, fragment: string);
    private loc;
    /** Draws one frame into the bound framebuffer's bottom-left `width` x `height`. */
    draw(frame: FrameInputs, uniforms?: Uniforms, kinds?: UniformKinds): void;
    /** Frees the program (not after a context loss: the context already dropped it). */
    dispose(lost?: boolean): void;
}
/** How big to make a canvas for a CSS box: the device ratio capped at `dpr`, the whole capped at `maxPixels`. Pure. */
export declare function canvasSize(cssWidth: number, cssHeight: number, deviceRatio: number, dpr: number, maxPixels: number): {
    width: number;
    height: number;
    ratio: number;
};
