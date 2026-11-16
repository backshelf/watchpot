// The camera rig: stands the camera at the pose the game asks for, for the window's shape, and glides between poses
// on real time (a slow-motion moment never slows a walk). A new pose mid-glide retargets from where the camera is,
// at the speed it has. At rest the view leans a little toward the pointer, as far as the player's sway allows.
// Something else may borrow the camera (a close-up): the rig stops writing it until it is given back, then glides
// on from wherever it was left. Under reduced motion glides are cuts and there is no lean.
// Which pose is wanted (a place to stand, a close-up) is the game's; the rig asks for it every frame.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { type PerspectiveCamera, Vector3 } from "three/webgpu";
import { type Flat, flatten, Glide, type GlideTiming, glideSeconds, type Pose, samePose } from "./poses";
import { useStage } from "./Stage";

/** Who drives the camera: the rig, or a borrower. */
export interface CameraLoan {
  /** Asks for the camera; granted only while `canLend` says so. The rig stops writing it until it is given back. */
  borrow(): boolean;
  /** Gives the camera back, wherever it is: the rig glides on from there. */
  give(): void;
  /** Whether the borrower may still write the camera. False once given back or called in. */
  lent(): boolean;
  /** Ends the loan from the lender's side (the player walked away). */
  callIn(): void;
}

/** A camera loan, granted while `canLend()` is true. */
export function createCameraLoan(canLend: () => boolean = () => true): CameraLoan {
  let lent = false;
  return {
    borrow() {
      if (!canLend()) return false;
      lent = true;
      return true;
    },
    give() {
      lent = false;
    },
    lent: () => lent,
    callIn() {
      lent = false;
    },
  };
}

/** The pointer as the rig reads it: across and up the canvas, -1..1. */
export interface RigPointer {
  x: number;
  y: number;
  /** In the window. */
  inside: boolean;
  /** The main button is down: the lean holds still so a press never swims. */
  pressed: boolean;
}

/** The camera the rig is about to set this frame; `adjust` may change any of it. */
export interface RigShot {
  readonly position: Vector3;
  readonly aim: Vector3;
  fov: number;
  /** Where depth of field will be sharp. */
  readonly focus: Vector3;
}

/** What `adjust` is told about the frame. */
export interface RigFrame {
  /** Real seconds, the stage clock's. */
  readonly now: number;
  readonly dt: number;
  readonly pose: Pose;
  readonly pointer: Readonly<RigPointer>;
  /** The glide has arrived. */
  readonly arrived: boolean;
  /** How far through the glide, 0..1. */
  readonly progress: number;
  /** The window's width over height. */
  readonly aspect: number;
}

/** What the rig takes. */
export interface CameraRigOptions {
  /** The pose wanted now, for a window of `aspect`; asked every frame. */
  readonly pose: (aspect: number) => Pose;
  /** How far the view leans toward the pointer, metres across and up, or null for none. Default [0.022, 0.012]. */
  readonly lean?: readonly [number, number] | null;
  /** How fast the lean follows the pointer, per second. Default 2.2. */
  readonly leanRate?: number;
  /** The player's sway setting, 0..1, read each frame and eased. Default 1. */
  readonly sway?: () => number;
  /** How fast the sway setting is eased in, per second. Default 8. */
  readonly swayRate?: number;
  /** A loan the rig honours. */
  readonly loan?: CameraLoan | null;
  /** Reduced motion. Default: the stage's. */
  readonly reduced?: boolean;
  /** How long glides take. */
  readonly timing?: GlideTiming;
  /** Changes the shot after the glide and before the lean (an edge glance, a held aim). */
  readonly adjust?: (shot: RigShot, frame: RigFrame) => void;
  /** Called once each time a glide arrives. */
  readonly onArrive?: () => void;
  /** Set the stage's focus from the pose, eased along the glide. Default true. */
  readonly focus?: boolean;
  /** The `useFrame` priority; anything that reads the camera after the rig runs above it. Default 0. */
  readonly priority?: number;
}

/** The rig's handle. */
export interface CameraRigHandle {
  /** The pointer as the rig last read it. */
  readonly pointer: Readonly<RigPointer>;
  /** The glide running, if any. */
  glide(): Glide | null;
  /** Next frame, glide to the pose from wherever the camera is now (after something else moved it). */
  restart(): void;
}

/** A flat pose for wherever the camera is now, looking `reach` metres ahead. */
function fromCamera(camera: PerspectiveCamera, reach: number): Flat {
  const ahead = camera.getWorldDirection(new Vector3()).multiplyScalar(reach).add(camera.position);
  return flatten({
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [ahead.x, ahead.y, ahead.z],
    fov: camera.fov,
  });
}

/** Drives the canvas's camera to `options.pose` every frame. Mount inside the stage. */
export function useCameraRig(options: CameraRigOptions): CameraRigHandle {
  const stage = useStage();
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const latest = useRef(options);
  latest.current = options;
  const glide = useRef<Glide | null>(null);
  const arrivedFor = useRef<Glide | null>(null);
  const wasLent = useRef(false);
  const restart = useRef(false);
  const pointer = useMemo<RigPointer>(() => ({ x: 0, y: 0, inside: false, pressed: false }), []);
  const lean = useRef({ x: 0, y: 0, sway: options.sway?.() ?? 1 });
  const sample = useRef<Flat>([0, 0, 0, 0, 0, 0, 0]);
  const shot = useMemo<RigShot>(
    () => ({ position: new Vector3(), aim: new Vector3(), fov: 50, focus: new Vector3() }),
    [],
  );
  const scratch = useMemo(() => ({ right: new Vector3(), up: new Vector3() }), []);

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (e.button === 0) pointer.pressed = true;
    };
    const up = (e: PointerEvent | MouseEvent) => {
      if (e.button === 0) pointer.pressed = false;
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
      pointer.y = 1 - ((e.clientY - r.top) / Math.max(1, r.height)) * 2;
      pointer.inside = true;
    };
    const unpress = () => {
      pointer.pressed = false;
    };
    // The pointer left the window (`pointerleave` never fires on the document): the lean goes back to rest.
    const leave = (e: MouseEvent) => {
      if (e.relatedTarget !== null) return;
      pointer.inside = false;
      pointer.x = 0;
      pointer.y = 0;
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("mouseup", up);
    window.addEventListener("pointermove", move);
    window.addEventListener("blur", unpress);
    window.addEventListener("pointercancel", unpress);
    window.addEventListener("mouseout", leave);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", unpress);
      window.removeEventListener("pointercancel", unpress);
      window.removeEventListener("mouseout", leave);
    };
  }, [gl, pointer]);

  useFrame(() => {
    const o = latest.current;
    const now = stage.clock.real();
    const dt = stage.dt();
    const aspect = size.width / Math.max(1, size.height);
    const pose = o.pose(aspect);
    const want = flatten(pose);
    const l = lean.current;
    const reduced = o.reduced ?? stage.reduced;

    if (o.loan?.lent()) {
      // The camera is lent: hold still, and start again from wherever it is left.
      wasLent.current = true;
      l.x = 0;
      l.y = 0;
      return;
    }
    const seconds = (from: Flat, to: Flat) => (reduced ? 1e-3 : glideSeconds(from, to, o.timing));
    const g0 = glide.current;
    if (!g0) {
      // The first frame: stand at the pose.
      glide.current = new Glide(want, want, now, undefined, 1e-3);
    } else if (wasLent.current || restart.current) {
      wasLent.current = false;
      restart.current = false;
      const reach = Math.hypot(want[3] - want[0], want[4] - want[1], want[5] - want[2]);
      const here = fromCamera(camera, reach);
      glide.current = new Glide(here, want, now, undefined, seconds(here, want));
    } else if (!samePose(g0.to, want)) {
      glide.current = g0.retarget(now, want, seconds(g0.sample(now), want));
    }
    const g = glide.current as Glide;
    const p = g.sample(now, sample.current);

    // Lean toward the pointer at rest; hold the lean while the button is down.
    const leanBy = reduced ? null : o.lean === undefined ? ([0.022, 0.012] as const) : o.lean;
    if (!leanBy) {
      l.x = 0;
      l.y = 0;
    } else if (!pointer.pressed) {
      const k = 1 - Math.exp(-dt * (o.leanRate ?? 2.2));
      l.x += (pointer.x - l.x) * k;
      l.y += (pointer.y - l.y) * k;
    }

    const progress = g.progress(now);
    shot.position.set(p[0], p[1], p[2]);
    shot.aim.set(p[3], p[4], p[5]);
    shot.fov = p[6];
    // Depth of field follows the glide's aim, settling on the pose's own focus.
    shot.focus.set(...pose.focus).lerp(shot.aim, 1 - progress);
    const arrived = g.done(now);
    o.adjust?.(shot, { now, dt, pose, pointer, arrived, progress, aspect });

    camera.position.copy(shot.position);
    camera.lookAt(shot.aim);
    if (leanBy) {
      scratch.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      scratch.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      // The player's sway setting scales the lean (0 holds the view still), eased so a slider never jumps it.
      const swayWant = o.sway?.() ?? 1;
      l.sway =
        Math.abs(swayWant - l.sway) < 1e-4
          ? swayWant
          : l.sway + (swayWant - l.sway) * (1 - Math.exp(-dt * (o.swayRate ?? 8)));
      camera.position
        .addScaledVector(scratch.right, l.x * leanBy[0] * l.sway)
        .addScaledVector(scratch.up, l.y * leanBy[1] * l.sway);
      camera.lookAt(shot.aim);
    }
    if (Math.abs(camera.fov - shot.fov) > 1e-4) {
      camera.fov = shot.fov;
      camera.updateProjectionMatrix();
    }
    if (o.focus ?? true) stage.setFocus(shot.focus);
    if (arrived && arrivedFor.current !== g) {
      arrivedFor.current = g;
      o.onArrive?.();
    }
  }, options.priority ?? 0);

  return useMemo<CameraRigHandle>(
    () => ({
      pointer,
      glide: () => glide.current,
      restart: () => {
        restart.current = true;
      },
    }),
    [pointer],
  );
}

/** `useCameraRig` as a component. */
export function CameraRig(props: CameraRigOptions): null {
  useCameraRig(props);
  return null;
}
