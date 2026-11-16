// A turntable for looking at a thing up close: lift it from where it lies to a point in view, turn it by dragging
// (it keeps turning with the flick and settles, then drifts round on its own), and put it down somewhere. A shot can
// ride along: the camera eases in with the lift and back out with the put-down. What the game does around it (the
// light, the exposure, who may move the camera) reads `amount` and `focus` each frame.
// Every call takes the time: pass real seconds, so a slow-motion moment never makes the hand slow.
import { type Camera, type Object3D, Quaternion, Vector3 } from "three/webgpu";
import { easeInOut } from "./ease";

/** Where the turntable is in its cycle. */
export type TurntablePhase = "idle" | "lifting" | "held" | "lowering" | "down";

/** A camera move that rides along with a lift or a put-down. */
export interface TurntableShot {
  readonly camera: Camera;
  /** Where the camera ends up. */
  readonly to: Vector3;
  /** What it looks at as it sets off, and at the end. */
  readonly aimFrom: Vector3;
  readonly aimTo: Vector3;
  /** On a put-down, where focus settles (it eases there from the aim). Default: it follows the aim. */
  readonly focusTo?: Vector3;
}

/** The turntable's feel. Defaults are tuned for a hand-sized thing turned with a mouse. */
export interface TurntableOptions {
  /** Seconds a lift takes. Default 0.8. */
  readonly liftSeconds?: number;
  /** Seconds a put-down takes. Default 0.7. */
  readonly lowerSeconds?: number;
  /** How high the lift arcs over its straight line, metres. Default 0.05. */
  readonly liftArc?: number;
  /** And the put-down. Default 0.02. */
  readonly lowerArc?: number;
  /** Radians a pixel of drag turns it, across and up. Default 0.011 and 0.008. */
  readonly turnPerPixel?: readonly [number, number];
  /** The most it tips toward or away, radians. Default 0.75. */
  readonly maxPitch?: number;
  /** Seconds of stillness before a release that means no flick. Default 0.08. */
  readonly flickWindow?: number;
  /** Seconds untouched before it drifts round on its own, and the drift's speed in radians a second. 2.5, 0.22. */
  readonly driftAfter?: number;
  readonly driftSpeed?: number;
  /** How fast a flick dies away while touched recently, and while drifting, per second. 2.2, 0.6. */
  readonly spinDecay?: number;
  readonly driftDecay?: number;
  /** The spin a lift starts with, radians a second. Default 0.6. */
  readonly liftSpin?: number;
  /** How fast `amount` follows the hold, per second. Default 4. */
  readonly amountRate?: number;
  /** Whether a shot may move the camera this frame (a camera loan still held). Default: always. */
  readonly canMoveCamera?: () => boolean;
}

type Tween = {
  start: number;
  seconds: number;
  holderFrom: Vector3;
  holderTo: Vector3;
  turnFrom: Quaternion;
  turnTo: Quaternion;
  objectFrom: Vector3;
  objectTo: Vector3;
  objectTurnFrom: Quaternion;
  objectTurnTo: Quaternion;
  shot: TurntableShot | null;
  camFrom: Vector3;
  arc: number;
  done(): void;
};

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);

/**
 * A turntable on `holder`, an empty object in the scene that adopts what is lifted. `amount` eases toward 1 while
 * a thing is lifted or held and back to 0 after: a game drives its light and exposure from it. `focus` is where
 * depth of field should be sharp while a shot is running, or null.
 */
export class Turntable {
  phase: TurntablePhase = "idle";
  /** The thing being held or set down, if any. */
  object: Object3D | null = null;
  /** 0..1, eased: how far into the hold the turntable is. */
  amount = 0;
  /** Where depth of field should be sharp while a shot runs; null otherwise. */
  readonly focus = new Vector3();
  private focusing = false;
  private readonly centre = new Vector3();
  private tween: Tween | null = null;
  private yaw = 0;
  private pitch = 0;
  private spin = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private lastAt = 0;
  private touchedAt = 0;
  private frameAt = Number.NaN;
  private readonly turn = new Quaternion();
  private readonly qYaw = new Quaternion();
  private readonly qPitch = new Quaternion();
  private readonly aim = new Vector3();

  constructor(
    private readonly holder: Object3D,
    private readonly options: TurntableOptions = {},
  ) {}

  /**
   * Lifts `object` to `to` (world). `centre` is its bounds' centre in its own space: that point turns on the
   * holder's origin. Lifting something new takes it from where it lies, keeping its place in the world. False when a
   * lift or put-down is already running.
   */
  lift(
    object: Object3D,
    centre: Vector3,
    to: Vector3,
    now: number,
    shot: TurntableShot | null = null,
  ): boolean {
    if (this.phase === "lifting" || this.phase === "lowering" || this.phase === "held") return false;
    const fresh = this.object !== object;
    this.object = object;
    this.centre.copy(centre);
    if (fresh) {
      const at = object.localToWorld(centre.clone());
      this.holder.position.copy(at);
      this.holder.quaternion.identity();
      this.holder.updateMatrixWorld(true);
      this.holder.attach(object);
      this.yaw = 0;
      this.pitch = 0;
    }
    this.phase = "lifting";
    this.spin = this.options.liftSpin ?? 0.6;
    this.touchedAt = now;
    this.tween = {
      start: now,
      seconds: this.options.liftSeconds ?? 0.8,
      holderFrom: this.holder.position.clone(),
      holderTo: to.clone(),
      turnFrom: this.holder.quaternion.clone(),
      turnTo: this.holder.quaternion.clone(),
      objectFrom: object.position.clone(),
      objectTo: this.centre.clone().multiplyScalar(-object.scale.x),
      objectTurnFrom: object.quaternion.clone(),
      objectTurnTo: new Quaternion(),
      shot,
      camFrom: shot ? shot.camera.position.clone() : new Vector3(),
      arc: this.options.liftArc ?? 0.05,
      done: () => {
        this.phase = "held";
      },
    };
    return true;
  }

  /** Sets the held thing down with its bounds' centre over `spot` (world), resting on it; `onDown` when it lands. */
  putDown(spot: Vector3, now: number, onDown?: () => void, shot: TurntableShot | null = null): void {
    const object = this.object;
    if (!object || (this.phase !== "held" && this.phase !== "lifting")) return;
    this.dragging = false;
    const to = new Vector3(spot.x, spot.y + this.centre.y * object.scale.x, spot.z);
    this.phase = "lowering";
    this.pitch = 0;
    this.spin = 0;
    this.qYaw.setFromAxisAngle(Y, this.yaw);
    this.tween = {
      start: now,
      seconds: this.options.lowerSeconds ?? 0.7,
      holderFrom: this.holder.position.clone(),
      holderTo: to,
      turnFrom: this.holder.quaternion.clone(),
      turnTo: this.qYaw.clone(),
      objectFrom: object.position.clone(),
      objectTo: object.position.clone(),
      objectTurnFrom: object.quaternion.clone(),
      objectTurnTo: object.quaternion.clone(),
      shot,
      camFrom: shot ? shot.camera.position.clone() : new Vector3(),
      arc: this.options.lowerArc ?? 0.02,
      done: () => {
        this.phase = "down";
        onDown?.();
      },
    };
  }

  /** Forgets the held thing (it went elsewhere): the turntable is idle at once. */
  clear(): void {
    this.phase = "idle";
    this.object = null;
    this.tween = null;
    this.dragging = false;
  }

  /** Begins turning the held thing with the pointer at (x, y), CSS pixels. */
  grab(x: number, y: number, now: number): void {
    if (this.phase !== "held") return;
    this.dragging = true;
    this.lastX = x;
    this.lastY = y;
    this.lastAt = now;
    this.spin = 0;
  }

  /** The pointer moved to (x, y) while grabbed. */
  drag(x: number, y: number, now: number): void {
    if (!this.dragging) return;
    const [perX, perY] = this.options.turnPerPixel ?? [0.011, 0.008];
    const maxPitch = this.options.maxPitch ?? 0.75;
    const dt = Math.max(1e-3, now - this.lastAt);
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    this.yaw += dx * perX;
    this.pitch = Math.min(maxPitch, Math.max(-maxPitch, this.pitch + dy * perY));
    // The flick: the turn's speed over the last moments, so a release keeps it spinning.
    this.spin = this.spin * 0.6 + ((dx * perX) / dt) * 0.4;
    this.lastX = x;
    this.lastY = y;
    this.lastAt = now;
    this.touchedAt = now;
  }

  /** Lets go; a pause before letting go means no flick. */
  release(now: number): void {
    if (!this.dragging) return;
    this.dragging = false;
    if (now - this.lastAt > (this.options.flickWindow ?? 0.08)) this.spin = 0;
    this.touchedAt = now;
  }

  /** Whether a thing is held and turnable. */
  get held(): boolean {
    return this.phase === "held";
  }

  /** The turn's speed, radians a second. */
  get spinRate(): number {
    return this.spin;
  }

  /** Whether a shot is steering focus this frame (read `focus`). */
  get focused(): boolean {
    return this.focusing;
  }

  /** Advances to `now`; call every frame. */
  update(now: number): void {
    const dt = Number.isNaN(this.frameAt) ? 0 : Math.min(1 / 20, Math.max(0, now - this.frameAt));
    this.frameAt = now;
    const may = this.options.canMoveCamera ?? (() => true);
    this.focusing = false;
    const t = this.tween;
    if (t) {
      const k = Math.min(1, Math.max(0, (now - t.start) / t.seconds));
      const e = easeInOut(k);
      this.holder.position.copy(t.holderFrom).lerp(t.holderTo, e);
      this.holder.position.y += Math.sin(Math.PI * k) * t.arc;
      this.holder.quaternion.copy(t.turnFrom).slerp(t.turnTo, e);
      if (this.object) {
        this.object.position.copy(t.objectFrom).lerp(t.objectTo, e);
        this.object.quaternion.copy(t.objectTurnFrom).slerp(t.objectTurnTo, e);
      }
      if (t.shot && may()) {
        t.shot.camera.position.copy(t.camFrom).lerp(t.shot.to, e);
        this.aim.copy(t.shot.aimFrom).lerp(t.shot.aimTo, e);
        t.shot.camera.lookAt(this.aim);
        if (this.phase !== "lowering") this.focus.copy(this.holder.position);
        else if (t.shot.focusTo) this.focus.copy(this.aim).lerp(t.shot.focusTo, e);
        else this.focus.copy(this.aim);
        this.focusing = true;
      }
      if (k >= 1) {
        this.tween = null;
        t.done();
      }
    } else if (this.phase === "held") {
      if (!this.dragging) {
        // Inertia, then, after a while untouched, a slow drift round.
        const idle = now - this.touchedAt > (this.options.driftAfter ?? 2.5);
        const drift = idle ? (this.options.driftSpeed ?? 0.22) : 0;
        const rate = idle ? (this.options.driftDecay ?? 0.6) : (this.options.spinDecay ?? 2.2);
        this.spin += (drift - this.spin) * (1 - Math.exp(-dt * rate));
        this.yaw += this.spin * dt;
      }
      this.qYaw.setFromAxisAngle(Y, this.yaw);
      this.qPitch.setFromAxisAngle(X, this.pitch);
      this.turn.copy(this.qYaw).premultiply(this.qPitch);
      this.holder.quaternion.copy(this.turn);
      if (may()) {
        this.focus.copy(this.holder.position);
        this.focusing = true;
      }
    }
    const want = this.phase === "lifting" || this.phase === "held" ? 1 : 0;
    this.amount += (want - this.amount) * (1 - Math.exp(-dt * (this.options.amountRate ?? 4)));
    if (this.amount < 1e-3 && want === 0) this.amount = 0;
  }
}

/**
 * Where a camera stands to look at `at` from `distance` metres, along the line it already looks from, raised by
 * `rise` (a little more from above reads the light pool round the thing). Writes and returns `out`.
 */
export function closeIn(
  camera: Camera,
  at: Vector3,
  distance: number,
  rise = 0.15,
  out = new Vector3(),
): Vector3 {
  const toward = camera.position.clone().sub(at).normalize();
  toward.y += rise;
  toward.normalize();
  return out.copy(at).addScaledVector(toward, distance);
}
