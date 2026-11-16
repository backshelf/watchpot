// The boot: have every shader the scene needs compiled before the first frame is shown (a cold load otherwise shows
// seconds of bare background while each compiles on first sight), and only then call the scene ready.
// The scene's own shaders are compiled by the stage, for the post stack's scene pass, before that stack's first
// frame. What the scene does not hold yet is put into it here first (the game's warm set: one mesh per shader it
// will need later), so that compile takes it too and the first of anything never stalls a frame. The warm set
// stands far below the floor and is drawn through the settle frames (through the real post stack and the shadow
// pass), then leaves the scene; the game keeps the meshes, so three keeps their shaders.
// The boot is ready when the GPU has caught up with those frames, not when they were asked for: pipelines first
// drawn with are built on the GPU's side, and until they are nothing on the page moves.
// The DOM cue over the canvas is the game's: it reads `useStageStatus().boot`.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  type Camera,
  Group,
  type Object3D,
  type Scene,
  type Texture,
  type WebGPURenderer,
} from "three/webgpu";
import { useStage } from "./Stage";

/** Settles when the GPU has done everything asked of it so far (at once where there is no queue to ask). */
export function drained(renderer: WebGPURenderer): Promise<void> {
  const backend = renderer.backend as unknown as {
    device?: { queue: { onSubmittedWorkDone(): Promise<unknown> } };
  };
  if (!backend.device) return Promise.resolve();
  return backend.device.queue.onSubmittedWorkDone().then(
    () => {},
    () => {},
  );
}

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

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * The boot, as a hook inside the canvas: holds the frame loop until the warm set is in and prepared, lets the stage
 * compile and draw its settle frames, waits for the GPU, then reports ready (`useStageStatus().boot`).
 */
export function useStageBoot(options: StageBootOptions = {}): void {
  const stage = useStage();
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const latest = useRef(options);
  latest.current = options;
  const phase = useRef<{ from: number; compiledAt: number; started: number; done: boolean } | null>(null);
  const warm = useRef<Group | null>(null);
  const release = useRef<(() => void) | null>(null);

  // Hold the frame loop before the first frame: nothing draws until the warm set is in.
  useLayoutEffect(() => {
    release.current = stage.hold();
    stage.setBoot("waiting");
    return () => {
      release.current?.();
      release.current = null;
    };
  }, [stage]);

  useEffect(() => {
    let gone = false;
    const started = performance.now();
    const o = latest.current;
    const precompile = o.precompile ?? stage.params.precompile;
    void (async () => {
      try {
        await o.before?.();
      } catch (e) {
        console.warn("boot: a wait before the boot failed", e);
      }
      // Let the scene's own effects settle into it.
      await nextFrame();
      await nextFrame();
      if (gone) return;
      stage.setBoot("compiling");
      if (precompile) {
        try {
          const group = new Group();
          group.name = "stage-boot-warm";
          group.position.y = o.warmY ?? -20;
          for (const object of o.warm?.() ?? []) {
            object.frustumCulled = false;
            group.add(object);
          }
          warm.current = group;
          scene.add(group);
          await o.prepare?.({ renderer: gl, scene, camera, warm: group });
          for (const t of (await o.textures?.()) ?? []) gl.initTexture(t);
        } catch (e) {
          console.warn("boot: precompile failed, compiling on first sight instead", e);
        }
      }
      if (gone) return;
      phase.current = { from: stage.frames(), compiledAt: performance.now(), started, done: false };
      stage.setBoot("settling");
      release.current?.();
      release.current = null;
    })();
    return () => {
      gone = true;
      phase.current = null;
      warm.current?.removeFromParent();
    };
  }, [stage, gl, scene, camera]);

  useFrame(() => {
    const p = phase.current;
    // Settle frames are frames the post stack drew: the stage holds its first until its scene pass has compiled.
    if (!p || p.done || stage.frames() - p.from < (latest.current.settleFrames ?? 4)) return;
    p.done = true;
    const framedAt = performance.now();
    // Those frames asked the GPU for the last pipelines. It builds them in its own time: ready is when it has.
    void drained(gl).then(() => {
      if (phase.current !== p) return;
      const o = latest.current;
      const now = performance.now();
      const timing: BootTiming = {
        precompiled: o.precompile ?? stage.params.precompile,
        started: p.started,
        compiled: p.compiledAt,
        framed: framedAt,
        ready: now,
      };
      const prefix = o.log ?? "boot";
      if (prefix !== false)
        console.info(
          `${prefix}: ${timing.precompiled ? "precompiled" : "no precompile"}; renderer up at ${Math.round(p.started)} ms, ` +
            `compile ${Math.round(p.compiledAt - p.started)} ms, first frames ${Math.round(framedAt - p.compiledAt)} ms, ` +
            `gpu ${Math.round(now - framedAt)} ms, ready ${Math.round(now)} ms after navigation`,
        );
      // The settle frames drew the warm set through every pass; it leaves the scene, kept by the game.
      warm.current?.removeFromParent();
      stage.setBoot("ready");
      o.onReady?.(timing);
    });
  });
}

/** `useStageBoot` as a component: mount once inside the canvas, after the scene. */
export function StageBoot(props: StageBootOptions): null {
  useStageBoot(props);
  return null;
}
