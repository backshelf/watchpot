import { type Camera, type Object3D, Vector3 } from "three/webgpu";
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
/**
 * A turntable on `holder`, an empty object in the scene that adopts what is lifted. `amount` eases toward 1 while
 * a thing is lifted or held and back to 0 after: a game drives its light and exposure from it. `focus` is where
 * depth of field should be sharp while a shot is running, or null.
 */
export declare class Turntable {
    private readonly holder;
    private readonly options;
    phase: TurntablePhase;
    /** The thing being held or set down, if any. */
    object: Object3D | null;
    /** 0..1, eased: how far into the hold the turntable is. */
    amount: number;
    /** Where depth of field should be sharp while a shot runs; null otherwise. */
    readonly focus: Vector3;
    private focusing;
    private readonly centre;
    private tween;
    private yaw;
    private pitch;
    private spin;
    private dragging;
    private lastX;
    private lastY;
    private lastAt;
    private touchedAt;
    private frameAt;
    private readonly turn;
    private readonly qYaw;
    private readonly qPitch;
    private readonly aim;
    constructor(holder: Object3D, options?: TurntableOptions);
    /**
     * Lifts `object` to `to` (world). `centre` is its bounds' centre in its own space: that point turns on the
     * holder's origin. Lifting something new takes it from where it lies, keeping its place in the world. False when a
     * lift or put-down is already running.
     */
    lift(object: Object3D, centre: Vector3, to: Vector3, now: number, shot?: TurntableShot | null): boolean;
    /** Sets the held thing down with its bounds' centre over `spot` (world), resting on it; `onDown` when it lands. */
    putDown(spot: Vector3, now: number, onDown?: () => void, shot?: TurntableShot | null): void;
    /** Forgets the held thing (it went elsewhere): the turntable is idle at once. */
    clear(): void;
    /** Begins turning the held thing with the pointer at (x, y), CSS pixels. */
    grab(x: number, y: number, now: number): void;
    /** The pointer moved to (x, y) while grabbed. */
    drag(x: number, y: number, now: number): void;
    /** Lets go; a pause before letting go means no flick. */
    release(now: number): void;
    /** Whether a thing is held and turnable. */
    get held(): boolean;
    /** The turn's speed, radians a second. */
    get spinRate(): number;
    /** Whether a shot is steering focus this frame (read `focus`). */
    get focused(): boolean;
    /** Advances to `now`; call every frame. */
    update(now: number): void;
}
/**
 * Where a camera stands to look at `at` from `distance` metres, along the line it already looks from, raised by
 * `rise` (a little more from above reads the light pool round the thing). Writes and returns `out`.
 */
export declare function closeIn(camera: Camera, at: Vector3, distance: number, rise?: number, out?: Vector3): Vector3;
