import type { Vec3 } from "./poses";
/** How the glance starts, holds and lets go. Units across the window run -1 (left) to 1 (right). */
export interface GlanceOptions {
    /** How far out the pointer must be to start a glance. Default 0.9. */
    readonly edge?: number;
    /** Seconds the pointer must rest at the edge before the head turns (a pass across does not). Default 0.35. */
    readonly dwell?: number;
    /** Where the head starts to lean ahead of a glance. Default 0.75. */
    readonly preEdge?: number;
    /** How far that lean goes at the edge, as a share of a full glance. Default 0.16. */
    readonly preAmount?: number;
    /** Where a held glance lets go: this far past the middle toward the other side. Default 0.35. */
    readonly release?: number;
    /** How fast the head turns, per second. Default 2.6. */
    readonly rate?: number;
}
/** A side of the window, or neither. */
export type Side = -1 | 0 | 1;
/** A glance in progress. */
export interface GlanceState {
    /** The side a glance is committed to, or 0. */
    side: Side;
    dwell: number;
    /** How far the head is turned, 0..1 of a full glance. */
    amount: number;
    /** Which way `amount` turns it: the committed side, or the side of a lean ahead of one. */
    toward: Side;
}
/** A glance at rest. */
export declare function glanceState(): GlanceState;
/**
 * Steps the glance one frame. `x` is the pointer across the window. `free` is false whenever a glance must not
 * start or hold (mid-glide, the camera lent, the pointer gone); `held` is a button down, which freezes it so a
 * press never swims.
 */
export declare function stepGlance(g: GlanceState, x: number, dt: number, free: boolean, held: boolean, options?: GlanceOptions): GlanceState;
/**
 * The aim `k` of the way from looking at `base` to looking at `toward`, turning the head about the eye: heading by
 * the short way round, tilt and reach in proportion. Writes and returns `out`.
 */
export declare function glanceAim(eye: Vec3, base: Vec3, toward: Vec3, k: number, out?: [number, number, number]): [number, number, number];
