/** A piece of GLSL: its name, its code, and the chunks its code calls. Interpolates as its code alone. */
export interface GlslChunk {
    readonly name: string;
    readonly code: string;
    readonly deps: readonly GlslChunk[];
    toString(): string;
}
/** Makes a chunk. A chunk's dependencies exist before it, so the graph has no cycle. */
export declare function chunk(name: string, code: string, deps?: readonly GlslChunk[]): GlslChunk;
/**
 * A fragment from chunks and code: every chunk once, each after the chunks it depends on (in the order first met),
 * then the strings (the game's uniforms and `main`) in the order given. Pure.
 */
export declare function compose(...parts: readonly (GlslChunk | string)[]): string;
/** `PI` and `TAU`. */
export declare const MATH: GlslChunk;
/**
 * Hashes without trigonometry, stable across GPUs (after Dave Hoskins' "hash without sine"): `hash11(float)`,
 * `hash12(vec2)`, `hash22(vec2)`, `hash33(vec3)`, each 0..1 per component.
 */
export declare const HASH: GlslChunk;
/** `valueNoise(vec2)`: smooth lattice noise, 0..1. Needs `HASH`. */
export declare const VALUE_NOISE: GlslChunk;
/**
 * `gradientNoise(vec2)`: Perlin-style gradient noise with a quintic fade, about -0.7..0.7; and `noiseGradient(vec2)`,
 * a unit gradient per lattice cell. Needs `HASH` and `MATH`.
 */
export declare const GRADIENT_NOISE: GlslChunk;
/** `simplexNoise(vec2)`: 2D simplex noise on a skewed triangle lattice, about -1..1. Needs `GRADIENT_NOISE`. */
export declare const SIMPLEX_NOISE: GlslChunk;
/** `fbm(vec2 p, int octaves)`: fractal sum of `gradientNoise` (up to 8 octaves, each half as strong). */
export declare const FBM: GlslChunk;
/** `domainWarp(vec2 p, float amount, float time)`: `p` pushed along a drifting `fbm` field (Quilez's warp). */
export declare const DOMAIN_WARP: GlslChunk;
/**
 * `voronoi(vec2)`: cellular noise. Returns the distance to the nearest feature point, to the second nearest, and a
 * 0..1 id for the nearest cell. `F2 - F1` draws the cell edges. Needs `HASH`.
 */
export declare const VORONOI: GlslChunk;
/**
 * Ordered dither thresholds, 0..1, from a pixel position (`gl_FragCoord.xy`): `bayer2`, `bayer4` and `bayer8`, the
 * Bayer matrices built recursively. Compare a value against it: `step(bayer8(px), v)`.
 */
export declare const BAYER: GlslChunk;
/**
 * `interleavedGradientNoise(vec2 pixel)`: Jimenez's blue-noise-like threshold, 0..1, cheap and without visible
 * pattern; good for dithering gradients against banding.
 */
export declare const IGN: GlslChunk;
/**
 * Signed distances in 2D (negative inside): `sdCircle(p, r)`, `sdBox(p, halfSize)`, `sdRoundBox(p, halfSize, r)`,
 * `sdSegment(p, a, b)` and `sdRing(p, r, thickness)`.
 */
export declare const SDF: GlslChunk;
/**
 * Distance operations: `opUnion(a, b)`, `opSmoothUnion(a, b, k)` (polynomial smooth minimum), `opRound(d, r)`,
 * `opAnnular(d, r)`; and `sdfCoverage(d)`, an antialiased 0..1 fill from a distance by its screen-space width.
 */
export declare const SDF_OPS: GlslChunk;
/**
 * Colour helpers: `cosinePalette(t, a, b, c, d)` (Quilez's `a + b * cos(TAU * (c * t + d))`) and
 * `hueShift(color, angle)` (rotation about the grey axis, radians). Needs `MATH`.
 */
export declare const PALETTE: GlslChunk;
/**
 * Perceptual colour (Ottosson's OKLab): `srgbToLinear`, `linearToSrgb`, `linearToOklab`, `oklabToLinear`, and
 * `oklabMix(a, b, t)`, which mixes two sRGB colours without the muddy middle of an sRGB mix.
 */
export declare const OKLAB: GlslChunk;
/** `filmGrain(vec2 pixel, float time)`: per-pixel grain, -0.5..0.5, changing every frame. Needs `HASH`. */
export declare const GRAIN: GlslChunk;
/** `vignette(vec2 uv, float radius, float softness)`: 1 in the middle, falling to 0 past `radius` (uv 0..1). */
export declare const VIGNETTE: GlslChunk;
/** `scanlines(float y, float count, float strength)`: a multiplier that darkens `count` lines over y 0..1. */
export declare const SCANLINES: GlslChunk;
/** `rotate2d(float angle)`: the 2D rotation matrix, counter-clockwise, radians: `rotate2d(a) * p`. */
export declare const ROTATE: GlslChunk;
/**
 * `halftone(vec2 pixel, float cell, float value, float angle)`: coverage 0..1 of a halftone dot screen whose dot
 * area follows `value`, cells `cell` px across, the screen turned by `angle`. Needs `ROTATE`.
 */
export declare const HALFTONE: GlslChunk;
/**
 * A mosaic: `mosaicCell(p, size)` is the cell a point falls in and `mosaicCentre(p, size)` that cell's middle, so a
 * field sampled at the centre is flat across the cell.
 */
export declare const MOSAIC: GlslChunk;
/**
 * The screens a one-bit raster lays a tone with, by level, from a dot's integer position: `dotScreen(level, dot)`
 * is 1 where the dot is on. 0 nothing, 1 a sparse dot grid (1 in 16), 2 a diagonal hatch (1 in 4), 3 a checker
 * (1 in 2), 4 the other diagonal left off (3 in 4), 5 solid. Each level is its own pattern, so two tones side by
 * side read as two textures, not two greys. `blockScreen(dot, size)` turns on a square of two dots by two in the
 * middle of every `size`-dot cell: a coarse dot screen, one dot to a `MOSAIC` cell.
 */
export declare const DOT_SCREENS: GlslChunk;
/**
 * The faults of a raster written a row at a time by a line of elements (a scanned line, a row of dots).
 * `deadDot(x, seed, share)` is 1 for the `share` (0..1) of the columns that are dead under `seed`: a dead element
 * leaves an empty line down the whole picture; change the seed and other columns have died. `rowSkew(row, band,
 * seed)` is a sideways slip, -1..1, shared by every `band` rows and zero for most bands (a few rows dragged out of
 * true). Needs `HASH`.
 */
export declare const RASTER_FAULTS: GlslChunk;
/** `crtCurve(vec2 uv, float amount)`: barrel-bends uv 0..1 like a tube screen; test the result against 0..1. */
export declare const CRT_CURVE: GlslChunk;
/**
 * `chromaticUvs(uv, centre, amount, out r, out g, out b)`: three coordinates spread from `centre`, to evaluate a
 * field once per channel for a chromatic offset.
 */
export declare const CHROMATIC: GlslChunk;
/**
 * Soft light falloffs from a distance (0 at the edge): `glow(d, radius)`, an inverse-square bloom, and
 * `glowExp(d, falloff)`, an exponential one.
 */
export declare const GLOW: GlslChunk;
/** `toPolar(vec2)` to (radius, angle) and `fromPolar(vec2)` back. */
export declare const POLAR: GlslChunk;
/** Tiling: `tileLocal(p, size)` 0..1 inside a tile, `tileId(p, size)` the tile, `mirrorTile(p, size)` reflected. */
export declare const TILE: GlslChunk;
/**
 * Coordinates from the head's uniforms: `screenUv()` 0..1 across the canvas, `centeredUv()` with the origin in the
 * middle and the short side -0.5..0.5 (square pixels), `pointerUv()` the pointer in `centeredUv` space.
 */
export declare const UV: GlslChunk;
/** Every chunk, by its constant's name, for a test or a picker. */
export declare const CHUNKS: {
    readonly MATH: GlslChunk;
    readonly HASH: GlslChunk;
    readonly VALUE_NOISE: GlslChunk;
    readonly GRADIENT_NOISE: GlslChunk;
    readonly SIMPLEX_NOISE: GlslChunk;
    readonly FBM: GlslChunk;
    readonly DOMAIN_WARP: GlslChunk;
    readonly VORONOI: GlslChunk;
    readonly BAYER: GlslChunk;
    readonly IGN: GlslChunk;
    readonly SDF: GlslChunk;
    readonly SDF_OPS: GlslChunk;
    readonly PALETTE: GlslChunk;
    readonly OKLAB: GlslChunk;
    readonly GRAIN: GlslChunk;
    readonly VIGNETTE: GlslChunk;
    readonly SCANLINES: GlslChunk;
    readonly ROTATE: GlslChunk;
    readonly HALFTONE: GlslChunk;
    readonly MOSAIC: GlslChunk;
    readonly DOT_SCREENS: GlslChunk;
    readonly RASTER_FAULTS: GlslChunk;
    readonly CRT_CURVE: GlslChunk;
    readonly CHROMATIC: GlslChunk;
    readonly GLOW: GlslChunk;
    readonly POLAR: GlslChunk;
    readonly TILE: GlslChunk;
    readonly UV: GlslChunk;
};
