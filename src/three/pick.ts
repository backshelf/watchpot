// Picking gates: which of the things under the pointer may take it. r3f raycasts every pointer event; a filter
// over its hits (`setEvents({ filter })`) decides which answer, so a whole subtree can be switched off without
// touching its handlers. A subtree is marked by a `userData` tag on its root.
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Intersection, Object3D } from "three/webgpu";

/** Narrows what the pointer can reach: gets r3f's hits nearest first, returns the ones that may answer. */
export type PickFilter = (hits: Intersection[]) => Intersection[];

/** Whether `object` or anything above it carries `userData[tag]`. */
export function inTagged(object: Object3D, tag: string): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) if (o.userData[tag]) return true;
  return false;
}

/** The hits outside every subtree tagged `tag`. */
export function withoutTagged(hits: Intersection[], tag: string): Intersection[] {
  return hits.filter((h) => !inTagged(h.object, tag));
}

/**
 * Installs `filter` over the canvas's pointer hits while mounted; null lets every hit through. The latest filter is
 * read on each event, so it may close over state without reinstalling. One filter per canvas: the last mounted wins.
 */
export function usePickFilter(filter: PickFilter | null): void {
  const setEvents = useThree((s) => s.setEvents);
  const latest = useRef(filter);
  latest.current = filter;
  useEffect(() => {
    setEvents({ filter: (hits) => (latest.current ? latest.current(hits) : hits) });
    return () => setEvents({ filter: undefined });
  }, [setEvents]);
}
