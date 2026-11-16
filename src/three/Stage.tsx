// The stage: an r3f Canvas on three's WebGPU renderer (WebGL2 backend where WebGPU is missing), and a render loop
// the stage owns at `useFrame` priority 1. Each frame: the frame cap, a hold while the first compile runs, the
// renderer pointed back at the canvas, the game's pre-passes, then the post stack (or, on the very first frame, one
// plain render).
// The stage starts with one plain frame (the shadow maps the god rays sample), builds the post stack, and holds the
// stack's first frame until its scene pass has compiled, raced against a patience timer.
// A quality change builds the new post stack beside the old one: the old keeps drawing the screen while the new
// renders one frame off screen (where its shaders compile), and the swap is the frame after. No blank frame, no
// plain frame without the post.
// The stage stops drawing while the page is hidden, and on a lost GPU device or WebGL context it reports `lost`
// rather than leaving a dead canvas.
import { Canvas, type CanvasProps, useFrame, useThree } from "@react-three/fiber";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AgXToneMapping,
  type Camera,
  Color,
  type ColorRepresentation,
  MeshLambertNodeMaterial,
  type Object3D,
  type PerspectiveCamera,
  RenderTarget,
  type Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGPURenderer,
} from "three/webgpu";
import { createPaceClock, type PaceClock } from "../core/pace";
import type { Prefs } from "../core/prefs";
import type { FrameRate } from "./fps";
import { readStageParams, type StageParams } from "./params";
import { fitPerf, type PerfReport, PerfRun } from "./perf";
import { buildPost, type Post, type PostOptions, type RayLight } from "./post";
import { createQuality, DEFAULT_TIERS, type Quality, type StagePreset, usePreset } from "./quality";
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
  setFocus(point: { readonly x: number; readonly y: number; readonly z: number }): void;
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

type Inner = {
  focus: Vector3;
  dofOn: boolean;
  dofAmount: number;
  adaptation: Map<string, number>;
  brightness: number;
  grain: boolean;
  rayColour: Color;
  post: Post | null;
  frames: number;
  dt: number;
  lastReal: number;
  captures: ((canvas: HTMLCanvasElement) => void)[];
  holds: number;
  setFrameloop: ((mode: "always" | "never") => void) | null;
  renderer: WebGPURenderer | null;
  reduced: boolean;
};

function createStage(clock: PaceClock, params: StageParams): StageContextValue {
  const inner: Inner = {
    focus: new Vector3(),
    dofOn: true,
    dofAmount: 1,
    adaptation: new Map(),
    brightness: 1,
    grain: true,
    rayColour: new Color("#ffb97b"),
    post: null,
    frames: 0,
    dt: 0,
    lastReal: Number.NaN,
    captures: [],
    holds: 0,
    setFrameloop: null,
    renderer: null,
    reduced: false,
  };
  let status: StageStatus = { start: "plain", boot: "none", lost: null, webgl: false, hidden: false };
  const listeners = new Set<() => void>();
  const set = (next: Partial<StageStatus>) => {
    const merged = { ...status, ...next };
    if ((Object.keys(next) as (keyof StageStatus)[]).every((k) => merged[k] === status[k])) return;
    status = merged;
    for (const l of [...listeners]) l();
  };
  const apply = () => inner.setFrameloop?.(inner.holds > 0 ? "never" : "always");
  const handle: StageHandle = {
    clock,
    params,
    get reduced() {
      return inner.reduced;
    },
    dt: () => inner.dt,
    renderer: () => inner.renderer,
    setFocus(p) {
      inner.focus.set(p.x, p.y, p.z);
    },
    setDepthOfField(on) {
      inner.dofOn = on;
    },
    setAdaptation(stops, channel = "scene") {
      inner.adaptation.set(channel, stops);
    },
    setBrightness(v) {
      inner.brightness = v;
    },
    setGrain(on) {
      inner.grain = on;
    },
    setRayColour(c) {
      inner.rayColour.set(c);
    },
    compile: (object) => inner.post?.compile(object) ?? Promise.resolve(),
    frames: () => inner.frames,
    post: () => inner.post,
    capture: (scale = 1) =>
      new Promise<Blob | null>((resolve) => {
        inner.captures.push((canvas) => {
          const off = document.createElement("canvas");
          off.width = Math.round(canvas.width * scale);
          off.height = Math.round(canvas.height * scale);
          off.getContext("2d")?.drawImage(canvas, 0, 0, off.width, off.height);
          off.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
        });
      }),
    hold() {
      inner.holds++;
      apply();
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        inner.holds--;
        apply();
      };
    },
    status: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    setBoot(phase) {
      set({ boot: phase });
    },
  };
  return { handle, inner, set };
}

type StageContextValue = { handle: StageHandle; inner: Inner; set(next: Partial<StageStatus>): void };

const StageContext = createContext<StageContextValue | null>(null);

function useStageContext(): StageContextValue {
  const c = useContext(StageContext);
  if (!c) throw new Error("useStage: no <Stage> above this component");
  return c;
}

/** The stage's handle, inside the canvas or anywhere under `<Stage>`. */
export function useStage(): StageHandle {
  return useStageContext().handle;
}

/** The stage's status in React: the boot phase, a lost device, the WebGL fallback, a hidden page. */
export function useStageStatus(): StageStatus {
  const { handle } = useStageContext();
  return useSyncExternalStore(handle.subscribe, handle.status, handle.status);
}

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

let plain: MeshLambertNodeMaterial | null = null;
/** What the first frame draws the whole scene with: lit, so the shadows are set up, and nothing more. */
function plainMaterial(): MeshLambertNodeMaterial {
  plain ??= new MeshLambertNodeMaterial();
  return plain;
}

const drawingSize = new Vector2();

function FramedCamera({ fov }: { fov: number }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const half = Math.tan((fov * Math.PI) / 360) / aspect;
    camera.fov = (Math.atan(half) * 360) / Math.PI;
    camera.updateProjectionMatrix();
  }, [camera, size, fov]);
  return null;
}

type PipelineProps<P extends StagePreset> = {
  quality: Quality<P>;
  frameRate: FrameRate | null;
  view: StageProps<P>["view"];
  params: StageParams;
  post: StagePostOptions;
  prePasses: StageProps<P>["prePasses"];
  consoleName: string | undefined;
  dofEase: number;
  maxDelta: number;
  compilePatience: number;
  onPerf: StageProps<P>["onPerf"];
};

function Pipeline<P extends StagePreset>(props: PipelineProps<P>) {
  const { handle, inner, set } = useStageContext();
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const chosen = usePreset(props.quality);
  // Without WebGPU three falls back to its WebGL2 backend, which runs the lowest tier.
  const webgl = (gl.backend as unknown as { isWebGLBackend?: boolean }).isWebGLBackend === true;
  const preset = webgl ? (props.quality.tiers[props.quality.lowest] as P) : chosen;
  const post = useRef<Post | null>(null);
  const start = useRef<"plain" | "compiling" | "drawing">("plain");
  const perf = props.params.perf;
  const label = webgl ? props.quality.lowest : props.quality.get();
  const onPerf = useRef(props.onPerf);
  onPerf.current = props.onPerf;
  const run = useMemo(
    () =>
      perf
        ? new PerfRun(perf, {
            renderer: gl,
            label: `tier=${label}`,
            report: (report, line) => (onPerf.current ? onPerf.current(report, line) : console.info(line)),
          })
        : null,
    [gl, perf, label],
  );
  const latest = useRef(props);
  latest.current = props;

  useLayoutEffect(() => {
    inner.setFrameloop = setFrameloop;
    inner.renderer = gl;
    setFrameloop(inner.holds > 0 ? "never" : "always");
    set({ webgl });
    return () => {
      inner.setFrameloop = null;
    };
  }, [inner, setFrameloop, gl, set, webgl]);

  useEffect(() => {
    const name = props.consoleName;
    if (!name) return;
    const w = window as unknown as Record<string, unknown>;
    w[name] = { renderer: gl, scene, camera, clock: handle.clock, capture: handle.capture, stage: handle };
    return () => {
      delete w[name];
    };
  }, [props.consoleName, gl, scene, camera, handle]);

  // The stack a quality change is building beside the one on screen, and the frame it warms in.
  const next = useRef<{ preset: P; post: Post | null; warm: RenderTarget | null } | null>(null);
  const builtFor = useRef<P | null>(null);

  useEffect(() => {
    gl.toneMapping = AgXToneMapping;
    gl.outputColorSpace = SRGBColorSpace;
    // The first stack is built by the frame loop, with the preset of the day.
    if (!builtFor.current) return;
    // Whatever was on its way is out of date; changing back to the preset on screen needs nothing built.
    next.current?.post?.dispose();
    next.current?.warm?.dispose();
    next.current = builtFor.current === preset ? null : { preset, post: null, warm: null };
  }, [gl, preset]);

  useEffect(
    () => () => {
      post.current?.dispose();
      post.current = null;
      inner.post = null;
      next.current?.post?.dispose();
      next.current?.warm?.dispose();
      next.current = null;
    },
    [inner],
  );

  // The clock tick, before every other frame callback: `dt` is this display tick's, however the frame goes.
  useFrame(() => {
    const real = handle.clock.real();
    inner.dt = Number.isNaN(inner.lastReal)
      ? 0
      : Math.min(props.maxDelta, Math.max(0, real - inner.lastReal));
    inner.lastReal = real;
  }, -1000);

  useFrame(() => {
    const p = latest.current;
    if (handle.status().lost || handle.status().hidden) return;
    const dt = inner.dt;
    // Easing on real time: depth of field opens at the same pace in slow motion.
    const step = dt / p.dofEase;
    const soft = inner.dofOn && (p.view?.get().depthOfField ?? true);
    inner.dofAmount = soft ? Math.min(1, inner.dofAmount + step) : Math.max(0, inner.dofAmount - step);
    const startedAt = performance.now();
    // The cap skips whole frames; a perf run always renders every one.
    if (!perf && p.frameRate && !p.frameRate.due(startedAt)) return;
    // The post stack's scene pass is compiling: nothing draws until its shaders are built.
    if (start.current === "compiling") return;
    p.frameRate?.count(startedAt);
    // The frame draws to the canvas, whatever a compile in flight has left the renderer pointing at (compile.ts).
    gl.setRenderTarget(null);
    gl.setMRT(null);
    const first = start.current === "plain";
    p.prePasses?.({ renderer: gl, scene, camera, preset, dt, first });
    const options: PostOptions = { ...p.post, light: p.post.light?.() ?? null, focus: inner.focus };
    if (first) {
      // The first frame renders plainly: it creates the shadow maps the god rays sample, and that is all it is for
      // (nobody sees it, and nothing draws to the canvas after it). So everything in it wears one plain material:
      // with each thing's own, every shader in the scene would be built for the canvas as well as for the scene
      // pass. The post stack's scene pass draws into a target of its own with outputs of its own, so three builds
      // a shader of its own for everything in the scene: those compile now, before the stack's first frame.
      scene.overrideMaterial = plainMaterial();
      try {
        gl.render(scene, camera);
      } finally {
        scene.overrideMaterial = null;
      }
      const stack = buildPost(gl, scene, camera, preset, options);
      post.current = stack;
      inner.post = stack;
      builtFor.current = preset;
      start.current = p.params.precompile ? "compiling" : "drawing";
      set({ start: start.current });
      if (p.params.precompile) {
        const compiled = stack
          .compileScene()
          .catch((e) => console.warn("stage: scene compile failed, compiling on first sight", e));
        // A compile that never settles must not hold the picture for good: past this the stage draws anyway.
        const patience = new Promise<void>((resolve) => setTimeout(resolve, p.compilePatience));
        void Promise.race([compiled, patience]).then(() => {
          start.current = "drawing";
          set({ start: "drawing" });
        });
      }
      return;
    }
    if (!post.current) return;
    // A quality change: the new stack warmed off screen last frame takes the screen.
    const swap = next.current;
    if (swap?.post && swap.warm) {
      post.current.dispose();
      swap.warm.dispose();
      post.current = swap.post;
      builtFor.current = swap.preset;
      next.current = null;
    }
    inner.post = post.current;
    direct(post.current);
    post.current.render();
    inner.frames++;
    // The new stack's first frame, drawn off screen after the old one has drawn the screen: its passes build and
    // its shaders compile here (a long frame, but the screen keeps the old picture).
    const warming = next.current;
    if (warming && !warming.post) {
      warming.post = buildPost(gl, scene, camera, warming.preset, options);
      const size = gl.getDrawingBufferSize(drawingSize);
      warming.warm = new RenderTarget(size.x, size.y, { depthBuffer: false });
      const screen = gl.getRenderTarget();
      gl.setRenderTarget(warming.warm);
      direct(warming.post);
      warming.post.render();
      gl.setRenderTarget(screen);
    }
    const grab = inner.captures.shift();
    if (grab) grab(gl.domElement);
    const endedAt = performance.now();
    run?.frame(endedAt, endedAt - startedAt);
  }, 1);

  /** Everything the stage tells a stack before it draws a frame. */
  function direct(stack: Post): void {
    const view = latest.current.view?.get();
    // Bounce light at one sample a CSS pixel, however dense the screen. A perf run has no screen: the full frame.
    stack.setIndirectScale(perf ? 1 : 1 / Math.max(1, gl.getPixelRatio()));
    stack.setFocus(inner.focus);
    stack.setDepthOfField(inner.dofAmount);
    stack.setBrightness(view?.brightness ?? inner.brightness);
    let stops = 0;
    for (const s of inner.adaptation.values()) stops += s;
    stack.setAdaptation(stops);
    stack.setGrain(view?.grain ?? inner.grain);
    stack.setRayColour(inner.rayColour);
  }

  return null;
}

function useWindowSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

const fallbackQuality = () =>
  createQuality({ key: "watchpot.three.quality", tiers: DEFAULT_TIERS, initial: "high", backend: null });

/** The stage: a canvas on the WebGPU renderer, the post stack, and the frame loop. Mount the scene inside. */
export function Stage<P extends StagePreset = StagePreset>(props: StageProps<P>) {
  const [own] = useState(() => (props.quality ? null : fallbackQuality()));
  const quality = (props.quality ?? own) as Quality<P>;
  const [clock] = useState(() => props.clock ?? createPaceClock(() => performance.now() / 1000));
  const maxDelta = props.maxDelta ?? 0.1;
  const [params] = useState(() => props.params ?? readStageParams(window.location.search));
  const [stage] = useState(() => createStage(clock, params));
  stage.inner.reduced = props.reduced === true;
  const preset = usePreset(quality);
  const win = useWindowSize();
  const onLost = useRef(props.onLost);
  onLost.current = props.onLost;

  // A hidden page draws nothing; on return the clamped `dt` keeps the first frame back from jumping.
  useEffect(() => {
    let release: (() => void) | null = null;
    const sync = () => {
      const hidden = document.hidden;
      stage.set({ hidden });
      if (hidden && !release) release = stage.handle.hold();
      else if (!hidden && release) {
        release();
        release = null;
        stage.inner.lastReal = Number.NaN;
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      release?.();
    };
  }, [stage]);

  const perf = params.perf;
  const fit = perf ? fitPerf(perf, win.width, win.height) : null;
  const dpr = fit ? fit.dpr : Math.min(window.devicePixelRatio, preset.dpr);
  const box = fit
    ? {
        position: "absolute" as const,
        left: (win.width - fit.width) / 2,
        top: (win.height - fit.height) / 2,
        width: fit.width,
        height: fit.height,
      }
    : { position: "absolute" as const, inset: 0 };

  return (
    <StageContext.Provider value={stage}>
      <div style={box}>
        <Canvas
          shadows={props.shadows ?? "percentage"}
          dpr={dpr}
          camera={props.camera}
          gl={async (glProps) => {
            const renderer = new WebGPURenderer({
              canvas: glProps.canvas as HTMLCanvasElement,
              forceWebGL: params.forceWebGL,
              antialias: false,
              powerPreference: props.powerPreference ?? "high-performance",
              trackTimestamp: perf !== null,
            });
            // Both backends report a loss here (WebGL through its `webglcontextlost` listener). Three's own handler
            // still runs, for its log and its lost flag; the stage stops drawing and says so.
            const base = renderer.onDeviceLost.bind(renderer);
            renderer.onDeviceLost = (info) => {
              base(info);
              if (stage.handle.status().lost) return;
              const lost: StageLost = { api: info.api, message: info.message, reason: info.reason };
              stage.set({ lost });
              stage.handle.hold();
              onLost.current?.(lost);
            };
            await renderer.init();
            return renderer;
          }}
        >
          {props.horizontalFov !== undefined && <FramedCamera fov={props.horizontalFov} />}
          <Pipeline
            quality={quality}
            frameRate={props.frameRate ?? null}
            view={props.view}
            params={params}
            post={props.post ?? {}}
            prePasses={props.prePasses}
            consoleName={props.consoleName}
            dofEase={props.dofEase ?? 0.6}
            maxDelta={maxDelta}
            compilePatience={props.compilePatience ?? 20_000}
            onPerf={props.onPerf}
          />
          {props.children}
        </Canvas>
        {props.overlay}
      </div>
    </StageContext.Provider>
  );
}
