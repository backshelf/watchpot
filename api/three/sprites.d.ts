import { Sprite, type Vector3 } from "three/webgpu";
/** How the pool's sprites look and fly. Defaults are tuned for millimetre chips in a metre-sized scene. */
export interface SpritePoolOptions {
    /** Default "#cdbfa8". */
    readonly colour?: string;
    /** How hard the air slows a sprite, per second: high, and it leaps, then hangs. Default 4. */
    readonly drag?: number;
    /** The fall, metres a second squared, halved (the u² term). Default 0.35. */
    readonly gravity?: number;
    /**
     * Sprite size to screen size. PointsNodeMaterial draws `size × dpr × (half the canvas height) / depth`; the
     * default 1400/720 matches `size × 1400 / depth` device pixels on a 1440-pixel-tall canvas.
     */
    readonly sizeScale?: number;
    /** How much of its colour a newborn sprite shows, fading to nothing at the end of its life. Default 0.95. */
    readonly opacity?: number;
}
/** How a throw scatters. Defaults are tuned for a knock's chips. */
export interface ThrowOptions {
    /** Metres of scatter round the spot. Default 0.006. */
    readonly jitter?: number;
    /** Sideways spread and upward kick as shares of the speed. Default 0.8 and 0.7. */
    readonly spread?: number;
    readonly lift?: number;
    /** Life in seconds: the least, and how much more at most. Default 1 and 1.2. */
    readonly life?: readonly [number, number];
    /** Size: the least, and how much more at most (squared, so most are small). Default 0.0012 and 0.0035. */
    readonly size?: readonly [number, number];
}
/** A ring of GPU-flown sprites. Add `sprite` to the scene; call `update` each frame. */
export declare class SpritePool {
    /** The drawn object. */
    readonly sprite: Sprite;
    private readonly count;
    private readonly origin;
    private readonly velocity;
    /** born, life, size per sprite. */
    private readonly timing;
    private readonly now;
    private readonly floor;
    private readonly material;
    private next;
    constructor(count: number, options?: SpritePoolOptions);
    /**
     * Throws `n` sprites from `at`, mostly along `dir`, at up to `speed` metres a second, born at `now` (the clock
     * `update` is given). `rand` is the caller's, so a throw can be seeded.
     */
    spawn(at: Vector3, dir: Vector3, n: number, speed: number, now: number, rand: () => number, options?: ThrowOptions): void;
    /** Drops every sprite in flight. */
    clear(): void;
    /** Advances to `now`; sprites settle on `floorY` in the pool's local space. */
    update(now: number, floorY: number): void;
    /** Frees the material (the sprite's quad is three's shared geometry). */
    dispose(): void;
}
