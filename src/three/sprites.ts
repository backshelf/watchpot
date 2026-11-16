// A pool of point sprites thrown from a spot: chips, sparks, dust. Fixed size, ring-buffered. Each sprite is one
// instance on a PointsNodeMaterial (WebGPU points are one pixel, so sized points are instanced quads, as three's
// PointsNodeMaterial docs describe). The flight is computed on the GPU from the sprite's birth time, so the CPU
// writes only when sprites are thrown.
import { exp, float, instancedBufferAttribute, length, max, smoothstep, uniform, uv, vec3 } from "three/tsl";
import { Color, InstancedBufferAttribute, PointsNodeMaterial, Sprite, type Vector3 } from "three/webgpu";

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
export class SpritePool {
  /** The drawn object. */
  readonly sprite: Sprite;
  private readonly count: number;
  private readonly origin: InstancedBufferAttribute;
  private readonly velocity: InstancedBufferAttribute;
  /** born, life, size per sprite. */
  private readonly timing: InstancedBufferAttribute;
  private readonly now = uniform(0);
  private readonly floor = uniform(0);
  private readonly material: PointsNodeMaterial;
  private next = 0;

  constructor(count: number, options: SpritePoolOptions = {}) {
    this.count = count;
    this.origin = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.velocity = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
    const timing = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) timing[i * 3] = -1e9;
    this.timing = new InstancedBufferAttribute(timing, 3);

    const drag = options.drag ?? 4;
    const o = instancedBufferAttribute<"vec3">(this.origin);
    const v = instancedBufferAttribute<"vec3">(this.velocity);
    const t = instancedBufferAttribute<"vec3">(this.timing);
    const u = this.now.sub(t.x);
    const alive = u.greaterThanEqual(0).and(u.lessThanEqual(t.y));
    // Exponential drag, integrated: the distance flown tends to velocity / drag.
    const f = float(1)
      .sub(exp(u.mul(-drag)))
      .div(drag);
    const p = o.add(v.mul(f));

    const material = new PointsNodeMaterial({ transparent: true, depthWrite: false, sizeAttenuation: true });
    material.positionNode = vec3(p.x, max(this.floor, p.y.sub(u.mul(u).mul(options.gravity ?? 0.35))), p.z);
    material.sizeNode = alive.select(t.z.mul(options.sizeScale ?? 1400 / 720), 0);
    material.colorNode = uniform(new Color(options.colour ?? "#cdbfa8"));
    const fade = alive.select(
      float(1)
        .sub(u.div(t.y))
        .mul(options.opacity ?? 0.95),
      0,
    );
    material.opacityNode = fade.mul(smoothstep(0.5, 0.15, length(uv().sub(0.5))));
    this.material = material;

    this.sprite = new Sprite(material);
    this.sprite.count = count;
    this.sprite.frustumCulled = false;
    // The sprite's own quad is a metre wide at the pool's origin; a sprite is never a pointer target.
    this.sprite.raycast = () => {};
  }

  /**
   * Throws `n` sprites from `at`, mostly along `dir`, at up to `speed` metres a second, born at `now` (the clock
   * `update` is given). `rand` is the caller's, so a throw can be seeded.
   */
  spawn(
    at: Vector3,
    dir: Vector3,
    n: number,
    speed: number,
    now: number,
    rand: () => number,
    options: ThrowOptions = {},
  ): void {
    const jitter = options.jitter ?? 0.006;
    const spread = options.spread ?? 0.8;
    const lift = options.lift ?? 0.7;
    const [life, lifeMore] = options.life ?? [1, 1.2];
    const [size, sizeMore] = options.size ?? [0.0012, 0.0035];
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      this.origin.setXYZ(
        i,
        at.x + (rand() - 0.5) * jitter,
        at.y + (rand() - 0.5) * jitter,
        at.z + (rand() - 0.5) * jitter,
      );
      const s = speed * (0.3 + rand() * 0.7);
      this.velocity.setXYZ(
        i,
        dir.x * s + (rand() - 0.5) * speed * spread,
        dir.y * s + rand() * speed * lift,
        dir.z * s + (rand() - 0.5) * speed * spread,
      );
      this.timing.setXYZ(i, now, life + rand() * lifeMore, size + rand() ** 2 * sizeMore);
    }
    this.origin.needsUpdate = true;
    this.velocity.needsUpdate = true;
    this.timing.needsUpdate = true;
  }

  /** Drops every sprite in flight. */
  clear(): void {
    for (let i = 0; i < this.count; i++) this.timing.setX(i, -1e9);
    this.timing.needsUpdate = true;
    this.next = 0;
  }

  /** Advances to `now`; sprites settle on `floorY` in the pool's local space. */
  update(now: number, floorY: number): void {
    this.now.value = now;
    this.floor.value = floorY;
  }

  /** Frees the material (the sprite's quad is three's shared geometry). */
  dispose(): void {
    this.material.dispose();
  }
}
