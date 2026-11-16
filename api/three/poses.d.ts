/** A point or direction in metres. */
export type Vec3 = readonly [number, number, number];
/** A window's shape class. */
export type Band = "narrow" | "wide" | "ultrawide";
/** The bands, narrowest first. */
export declare const BANDS: readonly Band[];
/** Where the bands split, as width over height. */
export interface BandEdges {
    /** Below this is narrow. Default 1.5 (4:3 and 3:2 are narrow, 16:10 is wide). */
    readonly wide: number;
    /** From this up is ultrawide. Default 2.1 (16:9 is wide, 21:9 is ultrawide). */
    readonly ultrawide: number;
}
/** The band an aspect falls in. */
export declare function bandOf(aspect: number, edges?: BandEdges): Band;
/** How a lens widens with the window. */
export interface LensOptions {
    /** The aspect a framing is composed at: below it the horizontal angle holds. Default 16:9. */
    readonly composedAt?: number;
    /** The widest horizontal angle, degrees, before a wider window loses height instead. Default 96. */
    readonly maxHorizontal?: number;
}
/** The vertical field of view, degrees, a framing of `fov` takes at `aspect`. */
export declare function lensFor(fov: number, aspect: number, options?: LensOptions): number;
/** Where the camera stands and looks, its vertical field of view in degrees, and where depth of field is sharp. */
export interface Pose {
    readonly position: Vec3;
    readonly target: Vec3;
    readonly fov: number;
    readonly focus: Vec3;
}
/** A framing: what to look at, from where, and what must show. */
export interface Framing {
    readonly target: Vec3;
    /** Heading in degrees: 0 looks along -z, positive turns right. */
    readonly yaw: number;
    /** Degrees below level. */
    readonly pitch: number;
    /** Preferred distance from the target, before fitting. */
    readonly distance: number;
    /** Vertical field of view at the composed aspect and wider, degrees. */
    readonly fov: number;
    /** The width and height that must show, across the view at the target's depth. Default: nothing to fit. */
    readonly box?: readonly [number, number];
    /** Where depth of field is sharp; the target when absent. */
    readonly focus?: Vec3;
}
/** Where a fitted pose may stand. */
export interface FitOptions extends LensOptions {
    /** The box the camera stays inside; a pose that would leave it stops at its edge and widens the lens. */
    readonly bounds?: {
        readonly min: Vec3;
        readonly max: Vec3;
    };
    /** The nearest a bounded camera stands to its target, metres. Default 0.2. */
    readonly nearest?: number;
}
/** The unit vector from a target back to a camera looking at it from `yaw` and `pitch` (degrees). */
export declare function backFrom(yaw: number, pitch: number): [number, number, number];
/** Where a camera stands to look at `target` from `yaw` and `pitch` (degrees) at `distance` metres. */
export declare function lookFrom(target: Vec3, yaw: number, pitch: number, distance: number): [number, number, number];
/** A framing stood back until its box fits a window of `aspect`, inside `bounds` when given. */
export declare function framePose(f: Framing, aspect: number, options?: FitOptions): Pose;
/** A pose as seven numbers: position, target, vertical fov. */
export type Flat = [number, number, number, number, number, number, number];
/** A pose's position, target and fov as a `Flat`. */
export declare function flatten(p: {
    readonly position: Vec3;
    readonly target: Vec3;
    readonly fov: number;
}): Flat;
/** How long glides take. Defaults are tuned for a walk a player takes a hundred times a sitting. */
export interface GlideTiming {
    /** Seconds at the least. Default 0.4: never a snap. */
    readonly min?: number;
    /** Seconds at the most. Default 0.85: past a second a walk feels like wading. */
    readonly max?: number;
    /** Seconds before distance counts. Default 0.36. */
    readonly base?: number;
    /** Seconds per metre moved. Default 0.12. */
    readonly perMetre?: number;
    /** How much a metre the aim moves counts against a metre the eye moves. Default 0.55. */
    readonly aimWeight?: number;
}
/** Seconds a glide from `from` to `to` takes: a little longer for a longer way, within `min` and `max`. */
export declare function glideSeconds(from: Flat, to: Flat, timing?: GlideTiming): number;
/** One glide between two flat poses: Hermite, arriving at rest, leaving at a carried speed. */
export declare class Glide {
    readonly from: Flat;
    readonly to: Flat;
    readonly start: number;
    readonly seconds: number;
    private readonly v0;
    /** A glide starting at `start` (any clock's seconds), leaving at `velocity` units a second. */
    constructor(from: Flat, to: Flat, start: number, velocity?: Flat, seconds?: number);
    /** Progress 0..1 at `now`. */
    progress(now: number): number;
    /** Whether the glide has arrived at `now`. */
    done(now: number): boolean;
    /** The pose at `now`, written into `out`. */
    sample(now: number, out?: Flat): Flat;
    /** Units per second at `now`. */
    velocity(now: number): Flat;
    /** A glide from wherever this one is at `now`, at its speed, to `to`, over `seconds` (default by distance). */
    retarget(now: number, to: Flat, seconds?: number): Glide;
}
/** True when two flat poses are the same within a millimetre and a hundredth of a degree. */
export declare function samePose(a: Flat, b: Flat): boolean;
