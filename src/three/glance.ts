// The edge glance: the pointer held against the window's left or right edge turns the head toward that side, so
// what the framing leaves out can be seen and clicked. The turn holds while the pointer stays on that side, so it
// can travel in to click what it found, and lets go once the pointer crosses well past the middle. On the way out
// to the edge the head already leans a little that way, so the dwell reads as the turn beginning rather than as
// lag. Pure, so a rig and tests share it.
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
export function glanceState(): GlanceState {
  return { side: 0, dwell: 0, amount: 0, toward: -1 };
}

/**
 * Steps the glance one frame. `x` is the pointer across the window. `free` is false whenever a glance must not
 * start or hold (mid-glide, the camera lent, the pointer gone); `held` is a button down, which freezes it so a
 * press never swims.
 */
export function stepGlance(
  g: GlanceState,
  x: number,
  dt: number,
  free: boolean,
  held: boolean,
  options: GlanceOptions = {},
): GlanceState {
  if (held) return g;
  const edge = options.edge ?? 0.9;
  const preEdge = options.preEdge ?? 0.75;
  if (!free) {
    g.side = 0;
    g.dwell = 0;
  } else if (g.side === 0) {
    const at: Side = x <= -edge ? -1 : x >= edge ? 1 : 0;
    g.dwell = at === 0 ? 0 : g.dwell + dt;
    if (at !== 0 && g.dwell >= (options.dwell ?? 0.35)) {
      g.side = at;
      g.dwell = 0;
    }
  } else if (x * g.side < -(options.release ?? 0.35)) {
    g.side = 0;
  }
  let want = 0;
  if (g.side !== 0) {
    want = 1;
    g.toward = g.side;
  } else if (free) {
    // The lean ahead of a glance, growing from `preEdge` to the edge. It changes sides only once the head is back.
    const s: Side = x < 0 ? -1 : 1;
    const k = Math.min(1, Math.max(0, (Math.abs(x) - preEdge) / (edge - preEdge)));
    if (k > 0 && (g.toward === s || g.amount < 0.02)) {
      g.toward = s;
      want = (options.preAmount ?? 0.16) * k;
    }
  }
  g.amount += (want - g.amount) * (1 - Math.exp(-dt * (options.rate ?? 2.6)));
  if (Math.abs(want - g.amount) < 1e-4) g.amount = want;
  return g;
}

/**
 * The aim `k` of the way from looking at `base` to looking at `toward`, turning the head about the eye: heading by
 * the short way round, tilt and reach in proportion. Writes and returns `out`.
 */
export function glanceAim(
  eye: Vec3,
  base: Vec3,
  toward: Vec3,
  k: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const look = (p: Vec3) => {
    const dx = p[0] - eye[0];
    const dy = p[1] - eye[1];
    const dz = p[2] - eye[2];
    const flat = Math.hypot(dx, dz);
    return { heading: Math.atan2(dx, dz), tilt: Math.atan2(dy, flat), reach: Math.hypot(flat, dy) };
  };
  const a = look(base);
  const b = look(toward);
  let turn = b.heading - a.heading;
  turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
  const heading = a.heading + turn * k;
  const tilt = a.tilt + (b.tilt - a.tilt) * k;
  const reach = a.reach + (b.reach - a.reach) * k;
  const flat = Math.cos(tilt) * reach;
  out[0] = eye[0] + Math.sin(heading) * flat;
  out[1] = eye[1] + Math.sin(tilt) * reach;
  out[2] = eye[2] + Math.cos(heading) * flat;
  return out;
}
