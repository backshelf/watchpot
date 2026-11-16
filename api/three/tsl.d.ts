import type { Node } from "three/webgpu";
type F = Node<"float">;
type V2 = Node<"vec2">;
type V3 = Node<"vec3">;
type V4 = Node<"vec4">;
/** Triplanar blend weights from a normal: sharpened by `sharpness` so each face takes mostly one projection. */
export declare function triplanarWeights(normal: V3, sharpness?: number): V3;
/**
 * A map laid on by triplanar projection: `sample` is read three times, along x (uv = zy), y (uv = xz) and z
 * (uv = xy), at `position × scale` (repeats per unit), and blended by the normal. Needs no UVs and runs on
 * unbroken across a cut, when `position` and `normal` are the geometry's own.
 */
export declare function triplanar(sample: (uv: V2) => V4, position: V3, normal: V3, scale?: number, sharpness?: number): V4;
/**
 * A tangent-space normal map laid on by triplanar projection, blended per axis into `normal` (the whiteout blend:
 * each projection's tangent normal swizzled onto its axis and added to the surface normal). `sample` returns the
 * tangent normal in -1..1 (`tangentNormal`). The result is in `normal`'s space: pass the geometry's normal and
 * hand the result to `transformNormalToView` for `normalNode`.
 */
export declare function triplanarNormal(sample: (uv: V2) => V3, position: V3, normal: V3, scale?: number, sharpness?: number): V3;
/** A normal map's texel as a tangent normal in -1..1, its relief scaled by `relief` (1 as authored). */
export declare function tangentNormal(texel: V4 | V3, relief?: number): V3;
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
export declare function boxFaces(normal: V3): BoxFaces;
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
export declare function boxProjection(o: BoxProjectionOptions): BoxProjection;
/**
 * The view-space normal tipped by a height (metres above the surface), with no UVs and no tangents: Mikkelsen's
 * bump for unparametrised surfaces, as three's `bumpMap` does it, but with the height in metres and the position
 * derivatives unnormalised, so the tilt is the height's true slope and does not change with distance. `share`
 * scales the tilt (0 flat): pass `derivativeFade` to keep a fine height from shimmering far off. For `normalNode`.
 */
export declare function bumpNormal(height: F, share?: F | number): V3;
/**
 * 1 where a map sampled at `coord` (in repeats, `texels` across) is magnified or near it, falling to 0 as a screen
 * pixel covers `from` to `to` texels: fine relief fades before it can shimmer.
 */
export declare function derivativeFade(coord: V2, texels: number, from?: number, to?: number): F;
/**
 * A node that is `lit` for a material in the scene's light (`lights` true) and `unlit` for one outside it. The
 * choice is made as each material's shader builds, so one graph serves both kinds of material.
 */
export declare function whenLit<T extends Node>(lit: T, unlit: T): T;
/**
 * A per-piece offset in 0..1, from a point that is one value for the whole piece (its origin: `modelPosition`).
 * Worked out at the vertices and handed on, not once a pixel.
 */
export declare function pieceSeed(origin: V3): V2;
/** A value in 0..1 for an integer cell of a 2D grid (`floor` of a coordinate), and a `salt` for another stream. */
export declare function cellHash(cell: V2, salt?: number): F;
/**
 * The Schlick fresnel term: 0 facing the eye, rising to 1 at a grazing edge, as sharp as `power` says (5 for a
 * physical rim, lower for a broad glow). For an edge light: `color.mul(fresnel())`.
 */
export declare function fresnel(power?: number, normal?: V3): F;
/** The 4×4 Bayer threshold at a pixel, in (0, 1): sixteen evenly spaced levels, ordered to spread dots apart. */
export declare function bayer4At(x: number, y: number): number;
/**
 * `bayer4At` on the GPU, for the pixel at `coord` (default: this fragment's). Compare a value against it to
 * dither: `Discard` where `alpha < bayer4()` draws a fade as a dot pattern with no blending.
 */
export declare function bayer4(coord?: V2): F;
export {};
