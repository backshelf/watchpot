// TSL building blocks a game composes into its own node materials: projection without UVs (triplanar and box, in
// metres, with the whiteout normal blend), bump from a height with no UVs at all, hashes, a fresnel rim and an
// ordered-dither threshold. General techniques only: every material stays the game's.
import {
  abs,
  cameraViewMatrix,
  dFdx,
  dFdy,
  dot,
  Fn,
  faceDirection,
  float,
  floor,
  fract,
  hash,
  length,
  max,
  mix,
  negateOnBackSide,
  normalize,
  normalView,
  normalViewGeometry,
  positionView,
  pow,
  saturate,
  screenCoordinate,
  sin,
  smoothstep,
  step,
  transformNormalToView,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { Node, NodeMaterial } from "three/webgpu";

type F = Node<"float">;
type V2 = Node<"vec2">;
type V3 = Node<"vec3">;
type V4 = Node<"vec4">;

// ---- Projection without UVs ----------------------------------------------------------------------------------

/** Triplanar blend weights from a normal: sharpened by `sharpness` so each face takes mostly one projection. */
export function triplanarWeights(normal: V3, sharpness = 4): V3 {
  const w = pow(abs(normalize(normal)), vec3(sharpness));
  return w.div(w.x.add(w.y).add(w.z)) as unknown as V3;
}

/**
 * A map laid on by triplanar projection: `sample` is read three times, along x (uv = zy), y (uv = xz) and z
 * (uv = xy), at `position × scale` (repeats per unit), and blended by the normal. Needs no UVs and runs on
 * unbroken across a cut, when `position` and `normal` are the geometry's own.
 */
export function triplanar(sample: (uv: V2) => V4, position: V3, normal: V3, scale = 1, sharpness = 4): V4 {
  const p = position.mul(scale);
  const w = triplanarWeights(normal, sharpness);
  return sample(p.zy).mul(w.x).add(sample(p.xz).mul(w.y)).add(sample(p.xy).mul(w.z)) as unknown as V4;
}

/**
 * A tangent-space normal map laid on by triplanar projection, blended per axis into `normal` (the whiteout blend:
 * each projection's tangent normal swizzled onto its axis and added to the surface normal). `sample` returns the
 * tangent normal in -1..1 (`tangentNormal`). The result is in `normal`'s space: pass the geometry's normal and
 * hand the result to `transformNormalToView` for `normalNode`.
 */
export function triplanarNormal(
  sample: (uv: V2) => V3,
  position: V3,
  normal: V3,
  scale = 1,
  sharpness = 4,
): V3 {
  const p = position.mul(scale);
  const n = normalize(normal);
  const w = triplanarWeights(normal, sharpness);
  const nx = sample(p.zy);
  const ny = sample(p.xz);
  const nz = sample(p.xy);
  const sx = vec3(nx.xy.add(n.zy), abs(nx.z).mul(n.x)).zyx;
  const sy = vec3(ny.xy.add(n.xz), abs(ny.z).mul(n.y)).xzy;
  const sz = vec3(nz.xy.add(n.xy), abs(nz.z).mul(n.z));
  return normalize(sx.mul(w.x).add(sy.mul(w.y)).add(sz.mul(w.z))) as unknown as V3;
}

/** A normal map's texel as a tangent normal in -1..1, its relief scaled by `relief` (1 as authored). */
export function tangentNormal(texel: V4 | V3, relief = 1): V3 {
  return texel.xyz
    .mul(2)
    .sub(1)
    .mul(vec3(relief, relief, 1)) as unknown as V3;
}

/** Which way each face of a box looks, as exclusive weights, and its two in-plane axes. */
export interface BoxFaces {
  /** 1 on the faces whose normal mostly points along x, y or z; exactly one is 1. */
  readonly wX: F;
  readonly wY: F;
  readonly wZ: F;
  /** A face's two in-plane axes from a vector: (z, y) on x-facing faces, (x, z) on y-facing, (x, y) on z-facing. */
  pick(v: V3): V2;
}

/** The faces a normal picks. Arithmetic only, so every derivative taken after stays in uniform control flow. */
export function boxFaces(normal: V3): BoxFaces {
  const a = abs(normal);
  const wX = step(max(a.y, a.z), a.x) as unknown as F;
  const wY = step(a.z, a.y).mul(float(1).sub(wX)) as unknown as F;
  const wZ = float(1).sub(wX).sub(wY) as unknown as F;
  const pick = (v: V3) =>
    vec2(v.z.mul(wX).add(v.x.mul(wY.add(wZ))), v.y.mul(wX.add(wZ)).add(v.z.mul(wY))) as unknown as V2;
  return { wX, wY, wZ, pick };
}

/** Where on a map a box-projected fragment falls, its screen derivatives, and the frame its normals turn in. */
export interface BoxProjection {
  /** The map coordinate, in repeats. */
  readonly st: V2;
  /** Its screen derivatives: sample with `.grad(gx, gy)` so the mip level holds where the projection switches. */
  readonly gx: V2;
  readonly gy: V2;
  readonly faces: BoxFaces;
  /** A tangent-space normal from the map, as the view-space normal `normalNode` takes. */
  normal(tangent: V3): V3;
}

/** How a box projection lays a map on. */
export interface BoxProjectionOptions {
  /** The geometry's position and normal, or the world's for things that never move. */
  readonly position: V3;
  readonly normal: V3;
  /** True when `position` and `normal` are in world space. */
  readonly world?: boolean;
  /** Metres of surface one repeat of the map covers. */
  readonly tile: number;
  /** 1 to turn the map a quarter (its grain along the face's other axis), 0 to keep it; a node, so it can vary. */
  readonly swap?: F | number;
  /** An offset into the map, in repeats: a per-piece seed (`pieceSeed`) so pieces cut alike differ. */
  readonly offset?: V2;
}

/**
 * Box projection: each face takes the map across its own two axes, in metres. Each face of a box starts somewhere
 * else in the map, and so does the face opposite, so a plain box never shows the same patch twice.
 */
export function boxProjection(o: BoxProjectionOptions): BoxProjection {
  const p = o.position;
  const n = o.normal;
  const f = boxFaces(n);
  const ab = f.pick(p);
  const dx = f.pick(dFdx(p) as unknown as V3);
  const dy = f.pick(dFdy(p) as unknown as V3);
  const swap = typeof o.swap === "number" || o.swap === undefined ? float(o.swap ?? 0) : o.swap;
  const sw = (v: V2) => mix(v, v.yx, swap) as unknown as V2;
  const k = 1 / o.tile;
  const side = step(0, n.x.add(n.y).add(n.z));
  let offset = vec2(0.37, 0.11)
    .mul(f.wX)
    .add(vec2(0.71, 0.53).mul(f.wY))
    .add(vec2(0.13, 0.89).mul(f.wZ))
    .add(vec2(0.5, 0.25).mul(side)) as unknown as V2;
  if (o.offset) offset = offset.add(o.offset) as unknown as V2;
  const st = sw(ab).mul(k).add(offset) as unknown as V2;
  // The directions st's x and y grow along, in the projection's space.
  const axisA = vec3(f.wY.add(f.wZ), 0, f.wX);
  const axisB = vec3(0, f.wX.add(f.wZ), f.wY);
  const along = mix(axisA, axisB, swap);
  const across = mix(axisB, axisA, swap);
  const normal = (tn: V3) => {
    const v = normalize(along.mul(tn.x).add(across.mul(tn.y)).add(normalize(n).mul(tn.z)));
    return (o.world
      ? normalize(cameraViewMatrix.mul(vec4(v, 0)).xyz)
      : transformNormalToView(v)) as unknown as V3;
  };
  return { st, gx: sw(dx).mul(k) as unknown as V2, gy: sw(dy).mul(k) as unknown as V2, faces: f, normal };
}

// ---- Bump without UVs ------------------------------------------------------------------------------------------

/**
 * The view-space normal tipped by a height (metres above the surface), with no UVs and no tangents: Mikkelsen's
 * bump for unparametrised surfaces, as three's `bumpMap` does it, but with the height in metres and the position
 * derivatives unnormalised, so the tilt is the height's true slope and does not change with distance. `share`
 * scales the tilt (0 flat): pass `derivativeFade` to keep a fine height from shimmering far off. For `normalNode`.
 */
export function bumpNormal(height: F, share: F | number = 1): V3 {
  // `normalView` read inside a normal node would ask the material's `normalNode` again, which is this.
  const plain = negateOnBackSide(normalViewGeometry) as unknown as V3;
  const dpdx = positionView.dFdx();
  const dpdy = positionView.dFdy();
  const r1 = dpdy.cross(plain);
  const r2 = plain.cross(dpdx);
  const det = dpdx.dot(r1).mul(faceDirection);
  const slope = det.sign().mul(height.dFdx().mul(r1).add(height.dFdy().mul(r2)));
  return det.abs().mul(plain).sub(slope.mul(share)).normalize() as unknown as V3;
}

/**
 * 1 where a map sampled at `coord` (in repeats, `texels` across) is magnified or near it, falling to 0 as a screen
 * pixel covers `from` to `to` texels: fine relief fades before it can shimmer.
 */
export function derivativeFade(coord: V2, texels: number, from = 1.2, to = 3.6): F {
  const perPixel = max(length(coord.dFdx()), length(coord.dFdy())).mul(texels);
  return float(1).sub(smoothstep(from, to, perPixel)) as unknown as F;
}

/**
 * A node that is `lit` for a material in the scene's light (`lights` true) and `unlit` for one outside it. The
 * choice is made as each material's shader builds, so one graph serves both kinds of material.
 */
export function whenLit<T extends Node>(lit: T, unlit: T): T {
  const pick = ({ material }: { material: NodeMaterial }) => (material.lights ? lit : unlit);
  return Fn(pick as unknown as () => T)() as unknown as T;
}

// ---- Hashes and noise ----------------------------------------------------------------------------------------

/**
 * A per-piece offset in 0..1, from a point that is one value for the whole piece (its origin: `modelPosition`).
 * Worked out at the vertices and handed on, not once a pixel.
 */
export function pieceSeed(origin: V3): V2 {
  return fract(
    sin(vec2(dot(origin, vec3(12.9898, 78.233, 37.719)), dot(origin, vec3(39.346, 11.135, 83.155)))).mul(
      43758.5453,
    ),
  ).toVarying() as unknown as V2;
}

/** A value in 0..1 for an integer cell of a 2D grid (`floor` of a coordinate), and a `salt` for another stream. */
export function cellHash(cell: V2, salt = 0): F {
  return hash(cell.x.mul(157).add(cell.y.mul(311)).add(salt)) as unknown as F;
}

// ---- Rims and dither ---------------------------------------------------------------------------------------------

/**
 * The Schlick fresnel term: 0 facing the eye, rising to 1 at a grazing edge, as sharp as `power` says (5 for a
 * physical rim, lower for a broad glow). For an edge light: `color.mul(fresnel())`.
 */
export function fresnel(power = 5, normal: V3 = normalView as unknown as V3): F {
  const toEye = normalize(positionView).negate();
  return pow(float(1).sub(saturate(dot(normal, toEye))), power) as unknown as F;
}

/** The 4×4 Bayer threshold at a pixel, in (0, 1): sixteen evenly spaced levels, ordered to spread dots apart. */
export function bayer4At(x: number, y: number): number {
  const px = ((Math.floor(x) % 4) + 4) % 4;
  const py = ((Math.floor(y) % 4) + 4) % 4;
  const b2 = (a: number, b: number) => Math.abs(a - b) * 2 + b;
  return (b2(px % 2, py % 2) * 4 + b2(Math.floor(px / 2), Math.floor(py / 2)) + 0.5) / 16;
}

/**
 * `bayer4At` on the GPU, for the pixel at `coord` (default: this fragment's). Compare a value against it to
 * dither: `Discard` where `alpha < bayer4()` draws a fade as a dot pattern with no blending.
 */
export function bayer4(coord: V2 = screenCoordinate.xy as unknown as V2): F {
  const p = floor(coord).mod(4);
  const lo = p.mod(2);
  const hi = floor(p.div(2));
  const b2 = (v: typeof p) => abs(v.x.sub(v.y)).mul(2).add(v.y);
  return b2(lo).mul(4).add(b2(hi)).add(0.5).div(16) as unknown as F;
}
