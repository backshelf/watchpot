// A spring pulling toward a target between two hard stops: a thing pulled out runs out, knocks against its stop
// and settles; pushed back it thumps home. A heavier load answers slower. Pure numbers, sub-stepped, so the same
// pull reads the same at any frame rate.

/** How the spring and its stops behave. Defaults are tuned for something hand-sized on a runner. */
export interface SpringStops {
  /** The near stop, units from home. Default 0. */
  readonly min?: number;
  /** The far stop. */
  readonly max: number;
  /** Default 70. */
  readonly stiffness?: number;
  /** Default 11. */
  readonly damping?: number;
  /** How much speed survives a stop: a little bounce, then it sits. Default 0.22. */
  readonly restitution?: number;
  /** How far past a stop `toMin` and `toMax` pull, so the spring holds the thing against it. Default 0.07. */
  readonly press?: number;
  /** How much a full load (`weight` 1) adds to the mass. Default 1.4. */
  readonly load?: number;
}

/** A spring's state. */
export interface Spring {
  /** Units out from home. */
  x: number;
  /** Units per second. */
  v: number;
  /** Where the spring pulls: past a stop to press against it. */
  target: number;
  /** 0..1: empty to full. */
  weight: number;
  /** Seconds it has sat still; a settled spring stops integrating. */
  still: number;
}

/** What a step reports: the stop it struck this step and how fast, for a sound. */
export type Knock = { stop: "min" | "max"; speed: number } | null;

/** A spring at rest against its near stop. */
export function spring(stops: SpringStops, weight = 0): Spring {
  return { x: stops.min ?? 0, v: 0, target: toMin(stops), weight, still: 1 };
}

/** The target that holds a spring pressed against its near stop. */
export function toMin(stops: SpringStops): number {
  return (stops.min ?? 0) - (stops.press ?? 0.07);
}

/** The target that holds a spring pressed against its far stop. */
export function toMax(stops: SpringStops): number {
  return stops.max + (stops.press ?? 0.07);
}

/** Advances a spring by `dt` seconds (sub-stepped at 240 Hz). Returns the hardest stop it struck, if any. */
export function stepSpring(s: Spring, stops: SpringStops, dt: number): Knock {
  const min = stops.min ?? 0;
  const max = stops.max;
  const stiffness = stops.stiffness ?? 70;
  const damping = stops.damping ?? 11;
  const restitution = stops.restitution ?? 0.22;
  let knock: Knock = null;
  const mass = 1 + (stops.load ?? 1.4) * s.weight;
  const n = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = Math.min(dt, 0.1) / n;
  for (let i = 0; i < n; i++) {
    const a = (stiffness * (s.target - s.x) - damping * s.v) / mass;
    s.v += a * h;
    s.x += s.v * h;
    if (s.x < min) {
      if (s.v < -0.05 && (!knock || -s.v > knock.speed)) knock = { stop: "min", speed: -s.v };
      s.x = min;
      s.v = -s.v * restitution;
      if (Math.abs(s.v) < 0.02) s.v = 0;
    } else if (s.x > max) {
      if (s.v > 0.05 && (!knock || s.v > knock.speed)) knock = { stop: "max", speed: s.v };
      s.x = max;
      s.v = -s.v * restitution;
      if (Math.abs(s.v) < 0.02) s.v = 0;
    }
  }
  const resting = Math.abs(s.v) < 0.004 && Math.abs(Math.min(max, Math.max(min, s.target)) - s.x) < 0.002;
  s.still = resting ? s.still + dt : 0;
  return knock;
}

/** Settled: still for a beat at the place the target asks for. */
export function settled(s: Spring, beat = 0.08): boolean {
  return s.still > beat;
}
