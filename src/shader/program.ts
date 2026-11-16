// One linked program for a game's fragment: built (or failed with a readable log), drawn with the standard and the
// game's uniforms, disposed. Shared by `ShaderCanvas` and the pool.
import { fixLog, SHADER_HEAD, VERTEX_SHADER } from "./head";
import { inferKind, setUniform, type UniformKinds, type Uniforms } from "./uniforms";

/** The context options every canvas asks for: no depth, no stencil, no antialias, premultiplied alpha. */
export const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
};

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
export class ShaderProgram {
  readonly program: WebGLProgram | null = null;
  /** The driver's log with the game's line numbers, when compile or link failed. */
  readonly error: string | null = null;
  private readonly gl: WebGL2RenderingContext;
  private readonly locations = new Map<string, WebGLUniformLocation | null>();

  constructor(gl: WebGL2RenderingContext, fragment: string) {
    this.gl = gl;
    const shader = (type: number, source: string): WebGLShader | string => {
      const sh = gl.createShader(type);
      if (!sh) return "could not create a shader";
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      if (gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return sh;
      const log = gl.getShaderInfoLog(sh) ?? "compile failed";
      gl.deleteShader(sh);
      return log;
    };
    const vertex = shader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const frag = shader(gl.FRAGMENT_SHADER, SHADER_HEAD + fragment);
    if (typeof vertex === "string" || typeof frag === "string") {
      this.error = typeof frag === "string" ? fixLog(frag) : `vertex: ${vertex}`;
      if (typeof vertex !== "string") gl.deleteShader(vertex);
      if (typeof frag !== "string") gl.deleteShader(frag);
      return;
    }
    const program = gl.createProgram();
    if (!program) {
      this.error = "could not create a program";
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    // Linked programs keep their code: the shaders can go.
    gl.deleteShader(vertex);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      this.error = fixLog(gl.getProgramInfoLog(program) ?? "link failed");
      gl.deleteProgram(program);
      return;
    }
    this.program = program;
  }

  private loc(name: string): WebGLUniformLocation | null {
    let loc = this.locations.get(name);
    if (loc === undefined && this.program) {
      loc = this.gl.getUniformLocation(this.program, name);
      this.locations.set(name, loc);
    }
    return loc ?? null;
  }

  /** Draws one frame into the bound framebuffer's bottom-left `width` x `height`. */
  draw(frame: FrameInputs, uniforms: Uniforms = {}, kinds: UniformKinds = {}): void {
    const gl = this.gl;
    if (!this.program) return;
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram is not a React hook
    gl.useProgram(this.program);
    gl.viewport(0, 0, frame.width, frame.height);
    gl.uniform1f(this.loc("u_time"), frame.time);
    gl.uniform2f(this.loc("u_resolution"), frame.width, frame.height);
    gl.uniform1f(this.loc("u_pixelRatio"), frame.pixelRatio);
    gl.uniform2f(this.loc("u_pointer"), frame.pointer[0], frame.pointer[1]);
    for (const [name, value] of Object.entries(uniforms))
      setUniform(gl, this.loc(name), kinds[name] ?? inferKind(value), value);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Frees the program (not after a context loss: the context already dropped it). */
  dispose(lost = false): void {
    if (this.program && !lost) this.gl.deleteProgram(this.program);
  }
}

/** How big to make a canvas for a CSS box: the device ratio capped at `dpr`, the whole capped at `maxPixels`. Pure. */
export function canvasSize(
  cssWidth: number,
  cssHeight: number,
  deviceRatio: number,
  dpr: number,
  maxPixels: number,
): { width: number; height: number; ratio: number } {
  let ratio = Math.max(0.1, Math.min(deviceRatio || 1, dpr));
  const area = cssWidth * cssHeight * ratio * ratio;
  if (area > maxPixels && area > 0) ratio *= Math.sqrt(maxPixels / area);
  return {
    width: Math.max(1, Math.floor(cssWidth * ratio)),
    height: Math.max(1, Math.floor(cssHeight * ratio)),
    ratio,
  };
}
