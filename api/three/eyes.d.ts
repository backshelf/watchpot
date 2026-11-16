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
export declare function makeEyes(): Eyes;
/** Advances by `dt` seconds toward the dim place (`away`) or the bright one; returns the exposure offset in stops. */
export declare function stepEyes(e: Eyes, away: boolean, dt: number, options?: EyeOptions): number;
