// A library of GLSL ES 3.00 chunks a game builds its fragments from: standard published techniques, written fresh,
// with no game's look. Each chunk names what it depends on; `compose` pulls those in once, in order.
import { MAIN_MARK } from "./head";

/** A piece of GLSL: its name, its code, and the chunks its code calls. Interpolates as its code alone. */
export interface GlslChunk {
  readonly name: string;
  readonly code: string;
  readonly deps: readonly GlslChunk[];
  toString(): string;
}

/** Makes a chunk. A chunk's dependencies exist before it, so the graph has no cycle. */
export function chunk(name: string, code: string, deps: readonly GlslChunk[] = []): GlslChunk {
  return { name, code: code.trim(), deps, toString: () => code.trim() };
}

/**
 * A fragment from chunks and code: every chunk once, each after the chunks it depends on (in the order first met),
 * then the strings (the game's uniforms and `main`) in the order given, after a marking comment line when there are
 * chunks before them, so a compile log reads their lines as `main:N` (`fixLog`). Pure.
 */
export function compose(...parts: readonly (GlslChunk | string)[]): string {
  const seen = new Set<GlslChunk>();
  const out: string[] = [];
  const visit = (c: GlslChunk) => {
    if (seen.has(c)) return;
    seen.add(c);
    for (const d of c.deps) visit(d);
    out.push(`// ${c.name}\n${c.code}`);
  };
  for (const p of parts) if (typeof p !== "string") visit(p);
  const code = parts.filter((p): p is string => typeof p === "string").map((p) => p.trim());
  if (out.length > 0 && code.length > 0) code[0] = `${MAIN_MARK}\n${code[0]}`;
  out.push(...code);
  return `${out.join("\n\n")}\n`;
}

/** `PI` and `TAU`. */
export const MATH = chunk(
  "math",
  `
const float PI = 3.14159265359;
const float TAU = 6.28318530718;
`,
);

/**
 * Hashes without trigonometry, stable across GPUs (after Dave Hoskins' "hash without sine"): `hash11(float)`,
 * `hash12(vec2)`, `hash22(vec2)`, `hash33(vec3)`, each 0..1 per component.
 */
export const HASH = chunk(
  "hash",
  `
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 hash33(vec3 p) {
  vec3 p3 = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
`,
);

/** `valueNoise(vec2)`: smooth lattice noise, 0..1. Needs `HASH`. */
export const VALUE_NOISE = chunk(
  "valueNoise",
  `
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`,
  [HASH],
);

/**
 * `gradientNoise(vec2)`: Perlin-style gradient noise with a quintic fade, about -0.7..0.7; and `noiseGradient(vec2)`,
 * a unit gradient per lattice cell. Needs `HASH` and `MATH`.
 */
export const GRADIENT_NOISE = chunk(
  "gradientNoise",
  `
vec2 noiseGradient(vec2 cell) {
  float a = hash12(cell) * TAU;
  return vec2(cos(a), sin(a));
}
float gradientNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(noiseGradient(i), f);
  float b = dot(noiseGradient(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(noiseGradient(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(noiseGradient(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`,
  [HASH, MATH],
);

/** `simplexNoise(vec2)`: 2D simplex noise on a skewed triangle lattice, about -1..1. Needs `GRADIENT_NOISE`. */
export const SIMPLEX_NOISE = chunk(
  "simplexNoise",
  `
float simplexNoise(vec2 p) {
  const float F2 = 0.36602540378;
  const float G2 = 0.21132486540;
  vec2 i = floor(p + (p.x + p.y) * F2);
  vec2 a = p - i + (i.x + i.y) * G2;
  float m = step(a.y, a.x);
  vec2 o = vec2(m, 1.0 - m);
  vec2 b = a - o + G2;
  vec2 c = a - 1.0 + 2.0 * G2;
  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
  vec3 n = h * h * h * h * vec3(dot(a, noiseGradient(i)), dot(b, noiseGradient(i + o)), dot(c, noiseGradient(i + 1.0)));
  return dot(n, vec3(70.0));
}
`,
  [GRADIENT_NOISE],
);

/** `fbm(vec2 p, int octaves)`: fractal sum of `gradientNoise` (up to 8 octaves, each half as strong). */
export const FBM = chunk(
  "fbm",
  `
float fbm(vec2 p, int octaves) {
  float total = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    total += amp * gradientNoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    amp *= 0.5;
  }
  return total;
}
`,
  [GRADIENT_NOISE],
);

/** `domainWarp(vec2 p, float amount, float time)`: `p` pushed along a drifting `fbm` field (Quilez's warp). */
export const DOMAIN_WARP = chunk(
  "domainWarp",
  `
vec2 domainWarp(vec2 p, float amount, float time) {
  vec2 q = vec2(fbm(p + 0.1 * time, 4), fbm(p + vec2(5.2, 1.3) - 0.1 * time, 4));
  return p + amount * q;
}
`,
  [FBM],
);

/**
 * `voronoi(vec2)`: cellular noise. Returns the distance to the nearest feature point, to the second nearest, and a
 * 0..1 id for the nearest cell. `F2 - F1` draws the cell edges. Needs `HASH`.
 */
export const VORONOI = chunk(
  "voronoi",
  `
vec3 voronoi(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float best = 8.0;
  float next = 8.0;
  vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 r = g + hash22(cell + g) - f;
      float d = dot(r, r);
      if (d < best) {
        next = best;
        best = d;
        id = cell + g;
      } else if (d < next) {
        next = d;
      }
    }
  }
  return vec3(sqrt(best), sqrt(next), hash12(id));
}
`,
  [HASH],
);

/**
 * Ordered dither thresholds, 0..1, from a pixel position (`gl_FragCoord.xy`): `bayer2`, `bayer4` and `bayer8`, the
 * Bayer matrices built recursively. Compare a value against it: `step(bayer8(px), v)`.
 */
export const BAYER = chunk(
  "bayer",
  `
float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}
float bayer8(vec2 a) {
  return bayer4(0.5 * a) * 0.25 + bayer2(a);
}
`,
);

/**
 * `interleavedGradientNoise(vec2 pixel)`: Jimenez's blue-noise-like threshold, 0..1, cheap and without visible
 * pattern; good for dithering gradients against banding.
 */
export const IGN = chunk(
  "interleavedGradientNoise",
  `
float interleavedGradientNoise(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}
`,
);

/**
 * Signed distances in 2D (negative inside): `sdCircle(p, r)`, `sdBox(p, halfSize)`, `sdRoundBox(p, halfSize, r)`,
 * `sdSegment(p, a, b)` and `sdRing(p, r, thickness)`.
 */
export const SDF = chunk(
  "sdf",
  `
float sdCircle(vec2 p, float r) {
  return length(p) - r;
}
float sdBox(vec2 p, vec2 halfSize) {
  vec2 d = abs(p) - halfSize;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float sdRoundBox(vec2 p, vec2 halfSize, float radius) {
  vec2 d = abs(p) - halfSize + radius;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
}
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float sdRing(vec2 p, float r, float thickness) {
  return abs(length(p) - r) - thickness * 0.5;
}
`,
);

/**
 * Distance operations: `opUnion(a, b)`, `opSmoothUnion(a, b, k)` (polynomial smooth minimum), `opRound(d, r)`,
 * `opAnnular(d, r)`; and `sdfCoverage(d)`, an antialiased 0..1 fill from a distance by its screen-space width.
 */
export const SDF_OPS = chunk(
  "sdfOps",
  `
float opUnion(float a, float b) {
  return min(a, b);
}
float opSmoothUnion(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float opRound(float d, float r) {
  return d - r;
}
float opAnnular(float d, float r) {
  return abs(d) - r;
}
float sdfCoverage(float d) {
  float w = max(fwidth(d), 1e-4);
  return 1.0 - smoothstep(-w, w, d);
}
`,
);

/**
 * Colour helpers: `cosinePalette(t, a, b, c, d)` (Quilez's `a + b * cos(TAU * (c * t + d))`) and
 * `hueShift(color, angle)` (rotation about the grey axis, radians). Needs `MATH`.
 */
export const PALETTE = chunk(
  "palette",
  `
vec3 cosinePalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}
vec3 hueShift(vec3 color, float angle) {
  const vec3 k = vec3(0.57735026919);
  float c = cos(angle);
  return color * c + cross(k, color) * sin(angle) + k * dot(k, color) * (1.0 - c);
}
`,
  [MATH],
);

/**
 * Perceptual colour (Ottosson's OKLab): `srgbToLinear`, `linearToSrgb`, `linearToOklab`, `oklabToLinear`, and
 * `oklabMix(a, b, t)`, which mixes two sRGB colours without the muddy middle of an sRGB mix.
 */
export const OKLAB = chunk(
  "oklab",
  `
vec3 srgbToLinear(vec3 c) {
  c = max(c, 0.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 linearToOklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0);
  m = pow(max(m, 0.0), 1.0 / 3.0);
  s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  );
}
vec3 oklabToLinear(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}
vec3 oklabMix(vec3 a, vec3 b, float t) {
  vec3 la = linearToOklab(srgbToLinear(a));
  vec3 lb = linearToOklab(srgbToLinear(b));
  return linearToSrgb(oklabToLinear(mix(la, lb, t)));
}
`,
);

/** `filmGrain(vec2 pixel, float time)`: per-pixel grain, -0.5..0.5, changing every frame. Needs `HASH`. */
export const GRAIN = chunk(
  "filmGrain",
  `
float filmGrain(vec2 pixel, float time) {
  return hash12(pixel + fract(time * 13.37) * 1000.0) - 0.5;
}
`,
  [HASH],
);

/** `vignette(vec2 uv, float radius, float softness)`: 1 in the middle, falling to 0 past `radius` (uv 0..1). */
export const VIGNETTE = chunk(
  "vignette",
  `
float vignette(vec2 uv, float radius, float softness) {
  float d = length(uv - 0.5) * 1.41421356237;
  return 1.0 - smoothstep(radius - softness, radius, d);
}
`,
);

/** `scanlines(float y, float count, float strength)`: a multiplier that darkens `count` lines over y 0..1. */
export const SCANLINES = chunk(
  "scanlines",
  `
float scanlines(float y, float count, float strength) {
  float wave = 0.5 + 0.5 * sin(y * count * TAU);
  return 1.0 - strength * wave;
}
`,
  [MATH],
);

/** `rotate2d(float angle)`: the 2D rotation matrix, counter-clockwise, radians: `rotate2d(a) * p`. */
export const ROTATE = chunk(
  "rotate",
  `
mat2 rotate2d(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, s, -s, c);
}
`,
);

/**
 * `halftone(vec2 pixel, float cell, float value, float angle)`: coverage 0..1 of a halftone dot screen whose dot
 * area follows `value`, cells `cell` px across, the screen turned by `angle`. Needs `ROTATE`.
 */
export const HALFTONE = chunk(
  "halftone",
  `
float halftone(vec2 pixel, float cell, float value, float angle) {
  vec2 p = rotate2d(angle) * pixel / cell;
  vec2 local = fract(p) - 0.5;
  float radius = sqrt(clamp(value, 0.0, 1.0)) * 0.70710678;
  float d = length(local) - radius;
  float w = max(fwidth(d), 1e-4);
  return 1.0 - smoothstep(-w, w, d);
}
`,
  [ROTATE],
);

/**
 * A mosaic: `mosaicCell(p, size)` is the cell a point falls in and `mosaicCentre(p, size)` that cell's middle, so a
 * field sampled at the centre is flat across the cell.
 */
export const MOSAIC = chunk(
  "mosaic",
  `
vec2 mosaicCell(vec2 p, float size) {
  return floor(p / size);
}
vec2 mosaicCentre(vec2 p, float size) {
  return (floor(p / size) + 0.5) * size;
}
`,
);

/**
 * The screens a one-bit raster lays a tone with, by level, from a dot's integer position: `dotScreen(level, dot)`
 * is 1 where the dot is on. 0 nothing, 1 a sparse dot grid (1 in 16), 2 a diagonal hatch (1 in 4), 3 a checker
 * (1 in 2), 4 the other diagonal left off (3 in 4), 5 solid. Each level is its own pattern, so two tones side by
 * side read as two textures, not two greys. `blockScreen(dot, size)` turns on a square of two dots by two in the
 * middle of every `size`-dot cell: a coarse dot screen, one dot to a `MOSAIC` cell.
 */
export const DOT_SCREENS = chunk(
  "dotScreens",
  `
float dotScreen(int level, vec2 dot) {
  ivec2 i = ivec2(floor(dot));
  if (level <= 0) return 0.0;
  if (level == 1) return float((i.x & 3) == 0 && (i.y & 3) == 0);
  if (level == 2) return float(((i.x + i.y) & 3) == 0);
  if (level == 3) return float(((i.x + i.y) & 1) == 0);
  if (level == 4) return float(((i.x - i.y) & 3) != 0);
  return 1.0;
}
float blockScreen(vec2 dot, float size) {
  vec2 local = mod(floor(dot), size) - floor(size * 0.5) + 1.0;
  return float(local.x >= 0.0 && local.x < 2.0 && local.y >= 0.0 && local.y < 2.0);
}
`,
);

/**
 * The faults of a raster written a row at a time by a line of elements (a scanned line, a row of dots).
 * `deadDot(x, seed, share)` is 1 for the `share` (0..1) of the columns that are dead under `seed`: a dead element
 * leaves an empty line down the whole picture; change the seed and other columns have died. `rowSkew(row, band,
 * seed)` is a sideways slip, -1..1, shared by every `band` rows and zero for most bands (a few rows dragged out of
 * true). Needs `HASH`.
 */
export const RASTER_FAULTS = chunk(
  "rasterFaults",
  `
float deadDot(float x, float seed, float share) {
  return float(hash12(vec2(floor(x), seed)) < share);
}
float rowSkew(float row, float band, float seed) {
  float b = floor(row / band);
  float pick = hash12(vec2(b, seed));
  return pick < 0.62 ? 0.0 : (hash12(vec2(b + 17.0, seed)) - 0.5) * 2.0;
}
`,
  [HASH],
);

/** `crtCurve(vec2 uv, float amount)`: barrel-bends uv 0..1 like a tube screen; test the result against 0..1. */
export const CRT_CURVE = chunk(
  "crtCurve",
  `
vec2 crtCurve(vec2 uv, float amount) {
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + amount * dot(c, c);
  return c * 0.5 + 0.5;
}
`,
);

/**
 * `chromaticUvs(uv, centre, amount, out r, out g, out b)`: three coordinates spread from `centre`, to evaluate a
 * field once per channel for a chromatic offset.
 */
export const CHROMATIC = chunk(
  "chromatic",
  `
void chromaticUvs(vec2 uv, vec2 centre, float amount, out vec2 r, out vec2 g, out vec2 b) {
  vec2 dir = (uv - centre) * amount;
  r = uv + dir;
  g = uv;
  b = uv - dir;
}
`,
);

/**
 * Soft light falloffs from a distance (0 at the edge): `glow(d, radius)`, an inverse-square bloom, and
 * `glowExp(d, falloff)`, an exponential one.
 */
export const GLOW = chunk(
  "glow",
  `
float glow(float d, float radius) {
  float x = max(d, 0.0);
  return radius * radius / (x * x + radius * radius);
}
float glowExp(float d, float falloff) {
  return exp(-max(d, 0.0) * falloff);
}
`,
);

/** `toPolar(vec2)` to (radius, angle) and `fromPolar(vec2)` back. */
export const POLAR = chunk(
  "polar",
  `
vec2 toPolar(vec2 p) {
  return vec2(length(p), atan(p.y, p.x));
}
vec2 fromPolar(vec2 rp) {
  return rp.x * vec2(cos(rp.y), sin(rp.y));
}
`,
);

/** Tiling: `tileLocal(p, size)` 0..1 inside a tile, `tileId(p, size)` the tile, `mirrorTile(p, size)` reflected. */
export const TILE = chunk(
  "tile",
  `
vec2 tileLocal(vec2 p, vec2 size) {
  return mod(p, size) / size;
}
vec2 tileId(vec2 p, vec2 size) {
  return floor(p / size);
}
vec2 mirrorTile(vec2 p, vec2 size) {
  vec2 t = mod(p, 2.0 * size) / size;
  return 1.0 - abs(t - 1.0);
}
`,
);

/**
 * Coordinates from the head's uniforms: `screenUv()` 0..1 across the canvas, `centeredUv()` with the origin in the
 * middle and the short side -0.5..0.5 (square pixels), `pointerUv()` the pointer in `centeredUv` space.
 */
export const UV = chunk(
  "uv",
  `
vec2 screenUv() {
  return gl_FragCoord.xy / u_resolution;
}
vec2 centeredUv() {
  return (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
}
vec2 pointerUv() {
  return (u_pointer - 0.5) * u_resolution / min(u_resolution.x, u_resolution.y);
}
`,
);

/** Every chunk, by its constant's name, for a test or a picker. */
export const CHUNKS = {
  MATH,
  HASH,
  VALUE_NOISE,
  GRADIENT_NOISE,
  SIMPLEX_NOISE,
  FBM,
  DOMAIN_WARP,
  VORONOI,
  BAYER,
  IGN,
  SDF,
  SDF_OPS,
  PALETTE,
  OKLAB,
  GRAIN,
  VIGNETTE,
  SCANLINES,
  ROTATE,
  HALFTONE,
  MOSAIC,
  DOT_SCREENS,
  RASTER_FAULTS,
  CRT_CURVE,
  CHROMATIC,
  GLOW,
  POLAR,
  TILE,
  UV,
} as const;
