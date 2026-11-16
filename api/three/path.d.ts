import type { Flat } from "./poses";
/** A pose at a time; `rest` makes the camera stop there (a held beat) rather than flow through. */
export interface PathKey {
    readonly at: number;
    readonly pose: Flat;
    readonly rest?: boolean;
}
/** The pose at time `t` along `keys` (sorted by `at`); before the first it is the first, after the last the last. */
export declare function samplePath(keys: readonly PathKey[], t: number, out?: Flat): Flat;
/** Where something stands: a position and a turn about y (radians, 0 faces +z). */
export interface Placement {
    readonly position: readonly [number, number, number];
    readonly rotationY: number;
}
/** A point in a placed object's own frame, in the world. */
export declare function toWorld(place: Placement, p: readonly [number, number, number]): [number, number, number];
/** A flat pose from a position and a target given in a placed object's own frame. */
export declare function poseIn(place: Placement, position: readonly [number, number, number], target: readonly [number, number, number], fov: number): Flat;
