// A camera path as keys in time: a flat pose at each key and a smooth curve through them. Inner keys take the
// Catmull-Rom tangent, so the camera flows through them without stopping; the first and last arrive at rest, and a
// key marked `rest` holds still there. Pure, so a path is tested without a renderer.
import type { Flat } from "./poses";

/** A pose at a time; `rest` makes the camera stop there (a held beat) rather than flow through. */
export interface PathKey {
  readonly at: number;
  readonly pose: Flat;
  readonly rest?: boolean;
}

const ZERO: Flat = [0, 0, 0, 0, 0, 0, 0];

function tangent(keys: readonly PathKey[], i: number): Flat {
  const prev = keys[i - 1];
  const next = keys[i + 1];
  if (!prev || !next || keys[i]?.rest) return ZERO;
  const span = Math.max(1e-6, next.at - prev.at);
  return next.pose.map((v, k) => (v - (prev.pose[k] as number)) / span) as Flat;
}

/** The pose at time `t` along `keys` (sorted by `at`); before the first it is the first, after the last the last. */
export function samplePath(keys: readonly PathKey[], t: number, out: Flat = [0, 0, 0, 0, 0, 0, 0]): Flat {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return out;
  if (t <= first.at) {
    for (let k = 0; k < 7; k++) out[k] = first.pose[k] as number;
    return out;
  }
  if (t >= last.at) {
    for (let k = 0; k < 7; k++) out[k] = last.pose[k] as number;
    return out;
  }
  let i = 0;
  while (i < keys.length - 2 && t >= (keys[i + 1] as PathKey).at) i++;
  const a = keys[i] as PathKey;
  const b = keys[i + 1] as PathKey;
  const h = Math.max(1e-6, b.at - a.at);
  const s = (t - a.at) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  const ma = tangent(keys, i);
  const mb = tangent(keys, i + 1);
  for (let k = 0; k < 7; k++) {
    out[k] =
      h00 * (a.pose[k] as number) +
      h10 * h * (ma[k] as number) +
      h01 * (b.pose[k] as number) +
      h11 * h * (mb[k] as number);
  }
  return out;
}

/** Where something stands: a position and a turn about y (radians, 0 faces +z). */
export interface Placement {
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
}

/** A point in a placed object's own frame, in the world. */
export function toWorld(place: Placement, p: readonly [number, number, number]): [number, number, number] {
  const c = Math.cos(place.rotationY);
  const s = Math.sin(place.rotationY);
  return [
    place.position[0] + p[0] * c + p[2] * s,
    place.position[1] + p[1],
    place.position[2] - p[0] * s + p[2] * c,
  ];
}

/** A flat pose from a position and a target given in a placed object's own frame. */
export function poseIn(
  place: Placement,
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  fov: number,
): Flat {
  return [...toWorld(place, position), ...toWorld(place, target), fov];
}
