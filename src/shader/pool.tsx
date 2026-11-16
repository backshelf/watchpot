// Many small shaders on one WebGL context: browsers cap live contexts (about 16), and an idle game wants a shimmer on
// every card and button. The pool's context draws each tile in turn and copies it into the tile's own 2D canvas.
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CONTEXT_ATTRIBUTES, canvasSize, type FrameInputs, ShaderProgram } from "./program";
import {
  browserSchedulerDeps,
  createShaderScheduler,
  MAX_LIVE_TILES,
  type ShaderScheduler,
  type ShaderSlot,
} from "./scheduler";
import { sameUniforms, type UniformKinds, type Uniforms } from "./uniforms";

/** The largest the pool's own canvas grows, per side. */
const MAX_SIDE = 4096;

interface Pool {
  register(el: Element, draw: (now: number) => void): ShaderSlot;
  /** Draws `fragment` into `target`; returns the reason when it cannot (no WebGL2, a failed build), else null. */
  render(
    target: HTMLCanvasElement,
    fragment: string,
    frame: FrameInputs,
    uniforms: Uniforms,
    kinds: UniformKinds,
  ): string | null;
  reduced: () => boolean;
}

const PoolContext = createContext<Pool | null>(null);

function usePool(): Pool {
  const pool = useContext(PoolContext);
  if (!pool) throw new Error("ShaderTile must be rendered inside a ShaderPool");
  return pool;
}

/** Props of `ShaderPool`: the tiles inside, the live cap, reduced motion, and an injected scheduler for tests. */
export interface ShaderPoolProps {
  children?: ReactNode;
  /** How many tiles animate at once; the oldest live ones past it hold a frame. Default 12. */
  maxLive?: number;
  /** Reduced motion (the game's setting): every tile draws one frame and holds. */
  reduced?: boolean;
  /** How far outside the viewport a tile wakes, as an IntersectionObserver root margin. Default "128px". */
  rootMargin?: string;
  /** A scheduler of your own (tests inject one with a fake clock); the pool makes one by default. */
  scheduler?: ShaderScheduler;
}

/**
 * One WebGL2 context for every `ShaderTile` inside, made on the first draw. Tiles sleep off screen and while the tab
 * is hidden; at most `maxLive` animate at once (the newest win). Programs are cached by fragment; a lost context is
 * rebuilt on restore and every tile redraws.
 */
export function ShaderPool({
  children,
  maxLive = MAX_LIVE_TILES,
  reduced = false,
  rootMargin = "128px",
  scheduler,
}: ShaderPoolProps) {
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const [pool] = useState(() => makePool(() => reducedRef.current, maxLive, rootMargin, scheduler));
  // biome-ignore lint/correctness/useExhaustiveDependencies: reduced is the trigger
  useEffect(() => pool.refresh(), [reduced, pool]);
  useEffect(() => () => pool.dispose(), [pool]);
  return <PoolContext.Provider value={pool}>{children}</PoolContext.Provider>;
}

function makePool(reduced: () => boolean, maxLive: number, rootMargin: string, given?: ShaderScheduler) {
  let scheduler = given ?? null;
  const sched = () => {
    scheduler ??= createShaderScheduler(browserSchedulerDeps(reduced, rootMargin), { maxLive });
    return scheduler;
  };
  let gl: { canvas: HTMLCanvasElement; ctx: WebGL2RenderingContext } | null | undefined;
  let lost = false;
  const programs = new Map<string, ShaderProgram>();

  const context = () => {
    if (gl !== undefined) return gl;
    // Asked once: a page without WebGL2 does not gain it later.
    gl = null;
    if (typeof document === "undefined") return gl;
    const canvas = document.createElement("canvas");
    let ctx: WebGL2RenderingContext | null = null;
    try {
      ctx = canvas.getContext("webgl2", CONTEXT_ATTRIBUTES);
    } catch {
      ctx = null;
    }
    if (!ctx) return gl;
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      lost = true;
      programs.clear();
    });
    canvas.addEventListener("webglcontextrestored", () => {
      lost = false;
      sched().refresh();
    });
    gl = { canvas, ctx };
    return gl;
  };

  return {
    reduced,
    register: (el: Element, draw: (now: number) => void) => sched().register(el, draw),
    render(
      target: HTMLCanvasElement,
      fragment: string,
      frame: FrameInputs,
      uniforms: Uniforms,
      kinds: UniformKinds,
    ): string | null {
      const g = context();
      if (!g) return "WebGL2 is unavailable";
      if (lost) return null;
      let program = programs.get(fragment);
      if (!program) {
        program = new ShaderProgram(g.ctx, fragment);
        programs.set(fragment, program);
      }
      if (program.error !== null) return program.error;
      const { width, height } = frame;
      if (width > g.canvas.width || height > g.canvas.height) {
        g.canvas.width = Math.min(MAX_SIDE, Math.max(g.canvas.width, width));
        g.canvas.height = Math.min(MAX_SIDE, Math.max(g.canvas.height, height));
      }
      g.ctx.bindFramebuffer(g.ctx.FRAMEBUFFER, null);
      program.draw(frame, uniforms, kinds);
      // The draw sits at the GL canvas's bottom-left; copy it before the browser presents (and clears) the buffer.
      const ctx2d = target.getContext("2d");
      if (ctx2d) {
        ctx2d.clearRect(0, 0, width, height);
        ctx2d.drawImage(g.canvas, 0, g.canvas.height - height, width, height, 0, 0, width, height);
      }
      return null;
    },
    refresh: () => sched().refresh(),
    dispose() {
      scheduler?.dispose();
      if (gl && !lost) for (const p of programs.values()) p.dispose();
      programs.clear();
    },
  };
}

/** Props of `ShaderTile`: the fragment and uniforms, time and budget controls, the still and the canvas's class. */
export interface ShaderTileProps {
  fragment: string;
  uniforms?: Uniforms;
  kinds?: UniformKinds;
  /** Drive time yourself (seconds): the tile then draws on change instead of animating. */
  time?: number;
  /** The highest pixel ratio drawn at. Default 2. */
  dpr?: number;
  /** The most pixels drawn for this tile. Default 250,000. */
  maxPixels?: number;
  /** Hold the current frame (the tile stops animating). */
  paused?: boolean;
  /** The time drawn under the pool's reduced motion, seconds. Default 0. */
  reducedTime?: number;
  /** Drawn instead of the canvas when the pool has no WebGL2 or this fragment fails. */
  still?: ReactNode;
  onError?: (log: string) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * A small shader drawn by the nearest `ShaderPool` into its own 2D canvas (size it with CSS): a card's foil, a
 * button's shimmer. It animates while live and visible within the pool's cap, draws on change otherwise, and shows
 * `still` when the pool cannot draw it. `aria-hidden`: decoration.
 */
export function ShaderTile({
  fragment,
  uniforms = {},
  kinds = {},
  time,
  dpr = 2,
  maxPixels = 250_000,
  paused = false,
  reducedTime = 0,
  still = null,
  onError,
  className,
  style,
}: ShaderTileProps) {
  const pool = usePool();
  const canvas = useRef<HTMLCanvasElement>(null);
  const slot = useRef<ShaderSlot | null>(null);
  const [failure, setFailure] = useState<{ fragment: string; log: string } | null>(null);
  const failed = failure?.fragment === fragment ? failure.log : null;
  const animate = !paused && time === undefined;
  const live = useRef({ uniforms, kinds, time, dpr, maxPixels, reducedTime, onError, animate });

  useLayoutEffect(() => {
    const was = live.current;
    const changed =
      !sameUniforms(was.uniforms, uniforms) || was.time !== time || was.reducedTime !== reducedTime;
    live.current = { uniforms, kinds, time, dpr, maxPixels, reducedTime, onError, animate };
    if (changed) slot.current?.requestDraw();
  });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let born = -1;
    let stopped = false;
    const s = pool.register(el, (now) => {
      if (stopped) return;
      const l = live.current;
      if (born < 0) born = now;
      const size = canvasSize(el.clientWidth, el.clientHeight, window.devicePixelRatio, l.dpr, l.maxPixels);
      if (el.width !== size.width || el.height !== size.height) {
        el.width = size.width;
        el.height = size.height;
      }
      const t = pool.reduced() ? l.reducedTime : (l.time ?? (now - born) / 1000);
      const error = pool.render(
        el,
        fragment,
        { width: size.width, height: size.height, time: t, pixelRatio: size.ratio, pointer: [0.5, 0.5] },
        l.uniforms,
        l.kinds,
      );
      if (error !== null) {
        stopped = true;
        setFailure({ fragment, log: error });
        l.onError?.(error);
      }
    });
    slot.current = s;
    s.setLive(live.current.animate);
    return () => {
      s.dispose();
      slot.current = null;
    };
  }, [pool, fragment]);

  useEffect(() => {
    slot.current?.setLive(animate);
  }, [animate]);

  if (failed !== null) return <>{still}</>;
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas without tabindex takes no focus; this one is decoration
    <canvas ref={canvas} className={className} style={style} aria-hidden="true" data-shader-tile="" />
  );
}
