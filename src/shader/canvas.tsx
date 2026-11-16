// One full-rect fragment shader on its own canvas: resized by observer, drawn only while it can be seen, held on one
// frame under reduced motion, rebuilt after a lost context, and a still in its place when WebGL2 or the shader fails.
import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CONTEXT_ATTRIBUTES, canvasSize, ShaderProgram } from "./program";
import { sameUniforms, type UniformKinds, type Uniforms } from "./uniforms";

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

/** The page's pin (`pinShaderClock`), and every mounted canvas's way to redraw when it moves. */
let pagePin: number | null = null;
const pinListeners = new Set<() => void>();

/**
 * Pins every `ShaderCanvas` on the page at `seconds` of its clock (`u_time`), each holding that frame, until
 * `pinShaderClock(null)` lets them run on. For development: a screenshot of one instant, the backdrop and the hero
 * together. A canvas's own `pin` wins over it.
 */
export function pinShaderClock(seconds: number | null): void {
  pagePin = seconds;
  for (const redraw of pinListeners) redraw();
}

/**
 * The page's pin as `pinShaderClock` left it (seconds, or null while the clocks run): for a surface that keeps a
 * clock of its own (`useSteppedFrame`, a game's timeline) to hold the same instant the canvases do.
 */
export function shaderClockPin(): number | null {
  return pagePin;
}

/**
 * A fragment with what belongs to it, as a game's shader module exports it: spread onto the canvas
 * (`<ShaderCanvas {...SURFACE} uniforms={…} />`), since `ShaderCanvasProps` takes every field.
 */
export interface ShaderSurface {
  /** The game's GLSL ES 3.00 fragment, written after `SHADER_HEAD` (declare its uniforms; write `main`). */
  fragment: string;
  /** Kinds for values inference gets wrong (an `int`, a 3-float array). */
  kinds?: UniformKinds;
  /** The time drawn under `reduced`, seconds: a frame that looks good frozen. Default 0. */
  reducedTime?: number;
  /** Drawn instead of the canvas when WebGL2 is missing or the shader fails (a CSS gradient). */
  still?: ReactNode;
}

/** Props of `ShaderCanvas`: the surface, its uniforms, time and budget controls, and the canvas's class. */
export interface ShaderCanvasProps extends ShaderSurface {
  /**
   * The game's uniforms, every one set on every frame drawn. A new value (compared by value) draws a frame at once
   * while the canvas holds still; while it loops, the next frame carries it. Neither costs a React render of its own.
   */
  uniforms?: Uniforms;
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
  /** Track the pointer over the canvas into `u_pointer`. Default false (it stays in the middle). */
  pointer?: boolean;
  /** Told why there is no shader: "WebGL2 is unavailable" or the driver's log with the fragment's line numbers. */
  onError?: (log: string) => void;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<ShaderHandle>;
}

type Pointer = [number, number];

/**
 * A fragment shader filling its canvas (size the canvas with CSS). WebGL2, one triangle, the game's GLSL after
 * `SHADER_HEAD`. It renders only while on screen and the tab is visible, at most `maxPixels` at up to `dpr` and
 * `fps` times a second; under `reduced` it draws one frame and holds; a lost context is rebuilt on restore.
 * Without WebGL2, or when the shader fails to build, `still` renders in its place and `onError` hears why. The
 * canvas is `aria-hidden`: it is decoration.
 */
export function ShaderCanvas({
  fragment,
  uniforms = {},
  kinds = {},
  time,
  dpr = 2,
  maxPixels = 1_000_000,
  fps,
  paused = false,
  reduced = false,
  reducedTime = 0,
  pointer = false,
  still = null,
  onError,
  className,
  style,
  ref,
}: ShaderCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  /** This canvas's own pin (the handle's `pin`), over the page's. */
  const pin = useRef<number | null>(null);
  // A failure belongs to the fragment that failed: a new fragment gets a fresh canvas and a fresh try.
  const [failure, setFailure] = useState<{ fragment: string; log: string } | null>(null);
  const failed = failure?.fragment === fragment ? failure.log : null;
  // Everything the frame loop reads, kept current without re-running the GL effect.
  const live = useRef({ uniforms, kinds, time, fps, paused, reduced, reducedTime, dpr, maxPixels, onError });
  // What the handle pushed, kept under the props: a render replaces the values it passes, never these.
  const pushed = useRef<Uniforms | null>(null);
  const gl = useRef<{
    ctx: WebGL2RenderingContext;
    program: ShaderProgram | null;
    lost: boolean;
    onScreen: boolean;
    raf: number;
    clock: number;
    last: number;
    due: number;
    ratio: number;
    pointer: Pointer;
    draw: () => void;
    schedule: () => void;
  } | null>(null);

  // A fresh set of uniforms (by value) or a change of the clock's inputs draws once, or wakes the loop.
  useLayoutEffect(() => {
    const was = live.current;
    const merged = pushed.current ? { ...pushed.current, ...uniforms } : uniforms;
    const changed =
      !sameUniforms(was.uniforms, merged) ||
      was.time !== time ||
      was.paused !== paused ||
      was.reduced !== reduced ||
      was.reducedTime !== reducedTime;
    live.current = {
      uniforms: merged,
      kinds,
      time,
      fps,
      paused,
      reduced,
      reducedTime,
      dpr,
      maxPixels,
      onError,
    };
    if (!changed) return;
    const g = gl.current;
    if (!g) return;
    if (g.raf === 0) g.draw();
    g.schedule();
  });

  useImperativeHandle(
    ref,
    () => ({
      get canvas() {
        return canvas.current;
      },
      setUniforms(values) {
        const now = live.current;
        pushed.current = { ...pushed.current, ...values };
        live.current = { ...now, uniforms: { ...now.uniforms, ...values } };
        const g = gl.current;
        if (g && g.raf === 0) g.draw();
      },
      frame() {
        gl.current?.draw();
      },
      pin(seconds) {
        pin.current = seconds;
        gl.current?.draw();
        gl.current?.schedule();
      },
    }),
    [],
  );

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const fail = (log: string) => {
      setFailure({ fragment, log });
      live.current.onError?.(log);
    };
    let ctx: WebGL2RenderingContext | null = null;
    try {
      ctx = el.getContext("webgl2", CONTEXT_ATTRIBUTES);
    } catch {
      ctx = null;
    }
    if (!ctx) {
      fail("WebGL2 is unavailable");
      return;
    }
    const context = ctx;
    const build = () => {
      const p = new ShaderProgram(context, fragment);
      if (p.error !== null) {
        fail(p.error);
        return null;
      }
      return p;
    };
    const program = build();
    if (!program) return;

    const pinnedAt = (): number | null => pin.current ?? pagePin;
    const animating = () => {
      const l = live.current;
      return !l.paused && !l.reduced && l.time === undefined && pinnedAt() === null;
    };
    const state = {
      ctx: context,
      program: program as ShaderProgram | null,
      lost: false,
      onScreen: true,
      raf: 0,
      clock: 0,
      last: -1,
      due: 0,
      ratio: 1,
      pointer: [0.5, 0.5] as Pointer,
      draw: () => {
        const l = live.current;
        if (state.lost || !state.program) return;
        const t = pinnedAt() ?? (l.reduced ? l.reducedTime : (l.time ?? state.clock));
        state.program.draw(
          { width: el.width, height: el.height, time: t, pixelRatio: state.ratio, pointer: state.pointer },
          l.uniforms,
          l.kinds,
        );
      },
      schedule: () => {
        const awake = state.onScreen && !document.hidden && !state.lost && animating();
        if (!awake) {
          if (state.raf !== 0) cancelAnimationFrame(state.raf);
          state.raf = 0;
          state.last = -1;
          return;
        }
        if (state.raf !== 0) return;
        state.raf = requestAnimationFrame(tick);
      },
    };
    const tick = (now: number) => {
      state.raf = 0;
      // Time runs only while drawn: back on screen, the field picks up where it left off.
      if (state.last >= 0) state.clock += Math.min(0.1, Math.max(0, (now - state.last) / 1000));
      state.last = now;
      const cap = live.current.fps;
      if (cap === undefined || !(cap > 0)) state.draw();
      else if (now >= state.due) {
        // The rate is a ceiling: a late frame keeps the beat, a very late one starts it again.
        const every = 1000 / cap;
        state.due = (now - state.due > every ? now : state.due) + every;
        state.draw();
      }
      state.schedule();
    };
    gl.current = state;

    const resize = (cssWidth: number, cssHeight: number) => {
      if (cssWidth <= 0 || cssHeight <= 0) return;
      const l = live.current;
      const size = canvasSize(cssWidth, cssHeight, window.devicePixelRatio, l.dpr, l.maxPixels);
      state.ratio = size.ratio;
      if (el.width !== size.width || el.height !== size.height) {
        el.width = size.width;
        el.height = size.height;
        if (state.raf === 0) state.draw();
      }
    };
    resize(el.clientWidth, el.clientHeight);
    state.draw();
    state.schedule();

    const cleanups: (() => void)[] = [];
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(([entry]) => {
        if (entry) resize(entry.contentRect.width, entry.contentRect.height);
      });
      ro.observe(el);
      cleanups.push(() => ro.disconnect());
    }
    if (typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver((records) => {
        state.onScreen = records[records.length - 1]?.isIntersecting ?? state.onScreen;
        state.schedule();
      });
      io.observe(el);
      cleanups.push(() => io.disconnect());
    }
    const onPin = () => {
      state.draw();
      state.schedule();
    };
    pinListeners.add(onPin);
    cleanups.push(() => pinListeners.delete(onPin));
    const onVisibility = () => state.schedule();
    document.addEventListener("visibilitychange", onVisibility);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));

    const onLost = (event: Event) => {
      // Asking to be restored: without preventDefault the browser never gives the context back.
      event.preventDefault();
      state.lost = true;
      state.program = null;
      state.schedule();
    };
    const onRestored = () => {
      state.lost = false;
      state.program = build();
      state.draw();
      state.schedule();
    };
    el.addEventListener("webglcontextlost", onLost);
    el.addEventListener("webglcontextrestored", onRestored);
    cleanups.push(() => {
      el.removeEventListener("webglcontextlost", onLost);
      el.removeEventListener("webglcontextrestored", onRestored);
    });

    return () => {
      for (const c of cleanups) c();
      if (state.raf !== 0) cancelAnimationFrame(state.raf);
      state.program?.dispose(state.lost);
      gl.current = null;
    };
  }, [fragment]);

  // The pointer, 0..1 from the canvas's bottom-left, while asked for.
  useEffect(() => {
    const el = canvas.current;
    if (!pointer || !el) return;
    const onMove = (event: PointerEvent) => {
      const g = gl.current;
      if (!g) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const x = Math.min(1, Math.max(0, (event.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, 1 - (event.clientY - r.top) / r.height));
      g.pointer = [x, y];
      if (g.raf === 0) g.draw();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [pointer]);

  if (failed !== null) return <>{still}</>;
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas without tabindex takes no focus; this one is decoration
    <canvas ref={canvas} className={className} style={style} aria-hidden="true" data-shader="" />
  );
}
