/**
 * The pace clock: real time scaled, for slow motion and a held moment. Every animation reads `now()` instead of
 * the frame's own time, so one `setScale` slows or stops the whole scene at once. It is presentation time: the
 * game's economy runs on the store's clock (`gameNow`), never on this one.
 */

/** A scaled clock over a source of real seconds. */
export interface PaceClock {
  /** Seconds since it was made, slowed or stopped by `scale`. */
  now(): number;
  /** Real seconds, unscaled, for easing that must not slow down. */
  real(): number;
  /** The scale now: 1 is real time, 0 is a held moment. */
  readonly scale: number;
  /** Ramps the scale to `to` (never below 0) over `seconds` of real time (default: at once). */
  setScale(to: number, seconds?: number): void;
}

/**
 * A pace clock over the caller's real seconds (`() => performance.now() / 1000`). The scale ramps linearly and
 * scaled time is the ramp's exact integral, so reading `now()` at any frame rate gives the same answer.
 */
export function createPaceClock(realSeconds: () => number): PaceClock {
  // The current segment: from `startReal` the scale ramps from `from` to `to` over `duration` real seconds.
  let startReal = realSeconds();
  let startScaled = 0;
  let from = 1;
  let to = 1;
  let duration = 0;

  const scaleAt = (t: number) => (duration > 0 && t < duration ? from + ((to - from) * t) / duration : to);
  const scaledAt = (t: number) => {
    if (duration > 0 && t < duration) return startScaled + from * t + ((to - from) * t * t) / (2 * duration);
    const ramp = duration > 0 ? ((from + to) / 2) * duration : 0;
    return startScaled + ramp + to * (t - duration);
  };

  return {
    now: () => scaledAt(realSeconds() - startReal),
    real: realSeconds,
    get scale() {
      return scaleAt(realSeconds() - startReal);
    },
    setScale(next, seconds = 0) {
      const real = realSeconds();
      const t = real - startReal;
      startScaled = scaledAt(t);
      from = scaleAt(t);
      startReal = real;
      to = Math.max(0, next);
      duration = Math.max(0, seconds);
    },
  };
}

/** A value eased toward a target over pace or real seconds: `set` starts a smoothstep ramp, `at` reads it. */
export interface Ramp {
  /** The value at `now`. */
  at(now: number): number;
  /** Starts easing from the value at `now` to `to` over `seconds` (0: at once). */
  set(to: number, now: number, seconds?: number): void;
  /** Where it is heading. */
  readonly target: number;
}

/** A ramp starting at `value`. Smoothstep in time: it leaves and arrives at rest. */
export function createRamp(value: number): Ramp {
  let from = value;
  let to = value;
  let start = 0;
  let duration = 0;
  const at = (now: number): number => {
    if (!(duration > 0)) return to;
    const t = Math.min(1, Math.max(0, (now - start) / duration));
    return from + (to - from) * t * t * (3 - 2 * t);
  };
  return {
    at,
    set(next, now, seconds = 0) {
      from = at(now);
      to = next;
      start = now;
      duration = Math.max(0, seconds);
    },
    get target() {
      return to;
    },
  };
}
