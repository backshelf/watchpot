import type { Intersection, Object3D } from "three/webgpu";
/** Narrows what the pointer can reach: gets r3f's hits nearest first, returns the ones that may answer. */
export type PickFilter = (hits: Intersection[]) => Intersection[];
/** Whether `object` or anything above it carries `userData[tag]`. */
export declare function inTagged(object: Object3D, tag: string): boolean;
/** The hits outside every subtree tagged `tag`. */
export declare function withoutTagged(hits: Intersection[], tag: string): Intersection[];
/**
 * Installs `filter` over the canvas's pointer hits while mounted; null lets every hit through. The latest filter is
 * read on each event, so it may close over state without reinstalling. One filter per canvas: the last mounted wins.
 */
export declare function usePickFilter(filter: PickFilter | null): void;
