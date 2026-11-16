// The eye adjusting to a change of light, as the exposure offset the stage takes (`setAdaptation`). Two numbers,
// both 0 in the bright place and 1 in the dim one: `scene` follows where the player is going at the camera's pace,
// `eye` follows `scene` slowly. Setting off, the picture dips under what it will settle to and recovers; coming
// back, it overshoots bright and eases down. Pure: no three, no React.

/** How the eye follows. Defaults are tuned so the dip peaks near half a stop a third of a second after setting off. */
export interface EyeOptions {
  /** Stops between the bright place and the dim one, were the eye never to follow. Default 0.87. */
  readonly depth?: number;
  /** How fast `scene` follows the destination, per second: the pace of the camera's glide. Default 4.5. */
  readonly sceneRate?: number;
  /** How fast `eye` follows `scene`, per second. Default 1.5. */
  readonly eyeRate?: number;
  /** The longest step taken, seconds. Default 0.1. */
  readonly maxDt?: number;
}

/** The two followers: where the scene's light is heading, and where the eye has got to. */
export interface Eyes {
  scene: number;
  eye: number;
}

/** Eyes adapted to the bright place. */
export function makeEyes(): Eyes {
  return { scene: 0, eye: 0 };
}

const SNAP = 0.001;

function chase(from: number, to: number, rate: number, dt: number): number {
  const next = from + (to - from) * (1 - Math.exp(-dt * rate));
  return Math.abs(to - next) < SNAP ? to : next;
}

/** Advances by `dt` seconds toward the dim place (`away`) or the bright one; returns the exposure offset in stops. */
export function stepEyes(e: Eyes, away: boolean, dt: number, options: EyeOptions = {}): number {
  const d = Math.min(options.maxDt ?? 0.1, Math.max(0, dt));
  e.scene = chase(e.scene, away ? 1 : 0, options.sceneRate ?? 4.5, d);
  e.eye = chase(e.eye, e.scene, options.eyeRate ?? 1.5, d);
  return e.scene === e.eye ? 0 : -(options.depth ?? 0.87) * (e.scene - e.eye);
}
