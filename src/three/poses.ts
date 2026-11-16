// Camera poses for any window shape, and the glide between them. Pure numbers: the rig reads these every frame
// and the tests read them with no renderer.
//
// A pose looks at a target from a heading and a pitch, far enough back that a frame box (its width and height
// across the view, at the target) fits. From 16:9 up the vertical angle is the framing's own and a wider window sees
// more to either side; below 16:9 the horizontal angle holds at its 16:9 value, so a narrow window never crops the
// sides, and the camera pulls back if the box still does not fit. A pose that would back out of its bounds stops
// at them and widens the lens instead.

/** A point or direction in metres. */
export type Vec3 = readonly [number, number, number];

/** A window's shape class. */
export type Band = "narrow" | "wide" | "ultrawide";
/** The bands, narrowest first. */
export const BANDS: readonly Band[] = ["narrow", "wide", "ultrawide"];

/** Where the bands split, as width over height. */
export interface BandEdges {
  /** Below this is narrow. Default 1.5 (4:3 and 3:2 are narrow, 16:10 is wide). */
  readonly wide: number;
  /** From this up is ultrawide. Default 2.1 (16:9 is wide, 21:9 is ultrawide). */
  readonly ultrawide: number;
}

/** The band an aspect falls in. */
export function bandOf(aspect: number, edges: BandEdges = { wide: 1.5, ultrawide: 2.1 }): Band {
  if (aspect < edges.wide) return "narrow";
  if (aspect < edges.ultrawide) return "wide";
  return "ultrawide";
}

/** How a lens widens with the window. */
export interface LensOptions {
  /** The aspect a framing is composed at: below it the horizontal angle holds. Default 16:9. */
  readonly composedAt?: number;
  /** The widest horizontal angle, degrees, before a wider window loses height instead. Default 96. */
  readonly maxHorizontal?: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const hfovOf = (vfov: number, aspect: number) => deg(2 * Math.atan(Math.tan(rad(vfov) / 2) * aspect));
const vfovOf = (hfov: number, aspect: number) => deg(2 * Math.atan(Math.tan(rad(hfov) / 2) / aspect));

/** The vertical field of view, degrees, a framing of `fov` takes at `aspect`. */
export function lensFor(fov: number, aspect: number, options: LensOptions = {}): number {
  const composed = options.composedAt ?? 16 / 9;
  const max = options.maxHorizontal ?? 96;
  if (aspect < composed) return vfovOf(hfovOf(fov, composed), aspect);
  if (hfovOf(fov, aspect) > max) return vfovOf(max, aspect);
  return fov;
}

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
  readonly bounds?: { readonly min: Vec3; readonly max: Vec3 };
  /** The nearest a bounded camera stands to its target, metres. Default 0.2. */
  readonly nearest?: number;
}

/** The unit vector from a target back to a camera looking at it from `yaw` and `pitch` (degrees). */
export function backFrom(yaw: number, pitch: number): [number, number, number] {
  const y = rad(yaw);
  const p = rad(pitch);
  return [-Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
}

/** Where a camera stands to look at `target` from `yaw` and `pitch` (degrees) at `distance` metres. */
export function lookFrom(
  target: Vec3,
  yaw: number,
  pitch: number,
  distance: number,
): [number, number, number] {
  const b = backFrom(yaw, pitch);
  return [target[0] + b[0] * distance, target[1] + b[1] * distance, target[2] + b[2] * distance];
}

/** How far back from `target` along `back` (unit) the camera may go before leaving `bounds`. */
function room(target: Vec3, back: Vec3, bounds: NonNullable<FitOptions["bounds"]>, nearest: number): number {
  let t = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i++) {
    const d = back[i] as number;
    const p = target[i] as number;
    if (d > 1e-6) t = Math.min(t, ((bounds.max[i] as number) - p) / d);
    else if (d < -1e-6) t = Math.min(t, ((bounds.min[i] as number) - p) / d);
  }
  return Math.max(nearest, t);
}

/** A framing stood back until its box fits a window of `aspect`, inside `bounds` when given. */
export function framePose(f: Framing, aspect: number, options: FitOptions = {}): Pose {
  let vfov = lensFor(f.fov, aspect, options);
  const halfV = Math.tan(rad(vfov) / 2);
  const halfH = halfV * aspect;
  const [boxW, boxH] = f.box ?? [0, 0];
  const fit = Math.max(boxW / 2 / halfH, boxH / 2 / halfV);
  const back = backFrom(f.yaw, f.pitch);
  let distance = Math.max(f.distance, fit);
  if (options.bounds) {
    const limit = room(f.target, back, options.bounds, options.nearest ?? 0.2);
    if (distance > limit) {
      // A wall is behind: stand at it and open the lens until the box fits.
      distance = limit;
      const needV = Math.max(boxH / 2 / distance, boxW / 2 / distance / aspect);
      vfov = Math.max(vfov, deg(2 * Math.atan(needV)));
    }
  }
  const position: Vec3 = [
    f.target[0] + back[0] * distance,
    f.target[1] + back[1] * distance,
    f.target[2] + back[2] * distance,
  ];
  return { position, target: f.target, fov: vfov, focus: f.focus ?? f.target };
}

// The glide. A pose is flattened to seven numbers (position, target, fov) and each follows a cubic Hermite curve
// from where it is, at the speed it already has, to where it is going, arriving at rest. A retarget mid-glide
// starts a new curve from the current point and speed, so the camera never jumps or jerks.

/** A pose as seven numbers: position, target, vertical fov. */
export type Flat = [number, number, number, number, number, number, number];

/** A pose's position, target and fov as a `Flat`. */
export function flatten(p: { readonly position: Vec3; readonly target: Vec3; readonly fov: number }): Flat {
  return [p.position[0], p.position[1], p.position[2], p.target[0], p.target[1], p.target[2], p.fov];
}

const ZERO: Flat = [0, 0, 0, 0, 0, 0, 0];

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
export function glideSeconds(from: Flat, to: Flat, timing: GlideTiming = {}): number {
  const moved = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const looked = Math.hypot(to[3] - from[3], to[4] - from[4], to[5] - from[5]);
  const span =
    (timing.base ?? 0.36) + (timing.perMetre ?? 0.12) * Math.max(moved, looked * (timing.aimWeight ?? 0.55));
  return Math.min(timing.max ?? 0.85, Math.max(timing.min ?? 0.4, span));
}

/** One glide between two flat poses: Hermite, arriving at rest, leaving at a carried speed. */
export class Glide {
  readonly from: Flat;
  readonly to: Flat;
  readonly start: number;
  readonly seconds: number;
  private readonly v0: Flat;

  /** A glide starting at `start` (any clock's seconds), leaving at `velocity` units a second. */
  constructor(from: Flat, to: Flat, start: number, velocity: Flat = ZERO, seconds = glideSeconds(from, to)) {
    this.from = [...from];
    this.to = [...to];
    this.start = start;
    this.seconds = Math.max(1e-3, seconds);
    // A carried speed may not fling the camera past where it is going: at most what a cubic arriving at rest can
    // absorb without overshooting (three times the mean speed), per component.
    this.v0 = velocity.map((v, i) => {
      const span = ((to[i] as number) - (from[i] as number)) / this.seconds;
      const cap = Math.abs(span) * 3;
      return Math.sign(v) === Math.sign(span) ? Math.min(Math.abs(v), cap) * Math.sign(v) : 0;
    }) as Flat;
  }

  /** Progress 0..1 at `now`. */
  progress(now: number): number {
    return Math.min(1, Math.max(0, (now - this.start) / this.seconds));
  }

  /** Whether the glide has arrived at `now`. */
  done(now: number): boolean {
    return now - this.start >= this.seconds * (1 - 1e-9);
  }

  /** The pose at `now`, written into `out`. */
  sample(now: number, out: Flat = [0, 0, 0, 0, 0, 0, 0]): Flat {
    const s = this.progress(now);
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    for (let i = 0; i < 7; i++) {
      out[i] =
        h00 * (this.from[i] as number) +
        h10 * this.seconds * (this.v0[i] as number) +
        h01 * (this.to[i] as number);
    }
    return out;
  }

  /** Units per second at `now`. */
  velocity(now: number): Flat {
    const s = this.progress(now);
    if (s >= 1) return [...ZERO];
    const d00 = 6 * s * s - 6 * s;
    const d10 = 3 * s * s - 4 * s + 1;
    const d01 = -6 * s * s + 6 * s;
    return this.from.map(
      (p, i) => (d00 * p + d01 * (this.to[i] as number)) / this.seconds + d10 * (this.v0[i] as number),
    ) as Flat;
  }

  /** A glide from wherever this one is at `now`, at its speed, to `to`, over `seconds` (default by distance). */
  retarget(now: number, to: Flat, seconds?: number): Glide {
    const here = this.sample(now);
    return new Glide(here, to, now, this.velocity(now), seconds ?? glideSeconds(here, to));
  }
}

/** True when two flat poses are the same within a millimetre and a hundredth of a degree. */
export function samePose(a: Flat, b: Flat): boolean {
  for (let i = 0; i < 7; i++)
    if (Math.abs((a[i] as number) - (b[i] as number)) > (i === 6 ? 0.01 : 0.001)) return false;
  return true;
}
