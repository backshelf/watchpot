// The specimen sheet's plates: one fragment per chunk (or pair) of `watchpot/shader`'s library, each drawn in this
// page's two inks on its paper. A field is shown as contour lines, rules, dot screens or a one-bit raster, never as a
// soft gradient, and every line is a distance in device pixels so it stays a hairline at any density.
//
// A specimen's own text (its uniforms and `main`) is what the bench's editor shows; the chunks are composed in front
// of it, then a `#line` directive so a driver's log counts lines from the top of that text.
import {
  BAYER,
  CHUNKS,
  chunk,
  compose,
  DOMAIN_WARP,
  DOT_SCREENS,
  FBM,
  type GlslChunk,
  GRAIN,
  HALFTONE,
  HEAD_LINES,
  MOSAIC,
  OKLAB,
  POLAR,
  RASTER_FAULTS,
  SDF,
  SDF_OPS,
  SIMPLEX_NOISE,
  uniformDecls,
  VORONOI,
} from "watchpot/shader";

/** This page's own drawing helpers, a chunk like the engine's: strokes and rules measured in device pixels. */
export const PLATE = chunk(
  "plate",
  `
// A stroke of half-width w (device px) whose centre is d device px away: one pixel of antialiasing.
float hairline(float d, float w) {
  return clamp(w + 0.5 - abs(d), 0.0, 1.0);
}
// A stroke's half-width in device px: about a CSS pixel wide at weight 1, never under one device pixel.
float hair(float weight) {
  return max(0.5, 0.45 * u_pixelRatio * weight);
}
// Device px to the nearest isoline of f (one every spacing), by the field's own slope on screen.
float isolines(float f, float spacing) {
  float g = f / spacing;
  return abs(fract(g + 0.5) - 0.5) / max(length(vec2(dFdx(g), dFdy(g))), 1e-6);
}
// Coverage of where f is above level, antialiased across one device pixel.
float above(float f, float level) {
  float g = f - level;
  return clamp(g / max(length(vec2(dFdx(g), dFdy(g))), 1e-6) + 0.5, 0.0, 1.0);
}
// Device px to the nearest of parallel rules pitch device px apart, turned by angle.
float rules(vec2 frag, float angle, float pitch) {
  float t = dot(frag, vec2(cos(angle), sin(angle)));
  return abs(mod(t, pitch) - 0.5 * pitch);
}
// The press: 1 on a ring running out from at (CSS px) as pulse falls from 1 to 0.
float pressRing(vec2 css, vec2 at, float pulse, float reach) {
  float d = (length(css - at) - (1.0 - pulse) * reach) / 16.0;
  return pulse * exp(-d * d);
}
// Device px to that ring's centre line (far off while there is no press).
float pressEdge(vec2 css, vec2 at, float pulse, float reach) {
  return pulse > 0.0 ? abs(length(css - at) - (1.0 - pulse) * reach) * u_pixelRatio : 1e4;
}
`,
);

/** The uniforms every specimen declares: the page's three inks and the bench's controls. */
export const KINDS = {
  u_paper: "vec4",
  u_ink: "vec4",
  u_live: "vec4",
  u_scale: "float",
  u_amount: "float",
  u_weight: "float",
  u_press: "vec2",
  u_pulse: "float",
} as const;

const DECLS = uniformDecls(KINDS);

/** How a specimen's CSS still is drawn when there is no shader (no WebGL2, or a fragment that fails). */
export type StillKind = "rings" | "grid" | "rules" | "shape" | "dial" | "dots" | "checker";

export interface Specimen {
  id: string;
  /** The chunk constants it demonstrates, as lettering. */
  name: string;
  /** The function it calls, as the chunk's comment gives it. */
  call: string;
  /** The chunks composed in front of its text. */
  chunks: readonly GlslChunk[];
  /** Its uniforms and `main`: what the editor shows. */
  source: string;
  /** What the third slider does here (`u_amount`, 0..1). */
  amount: { label: string; value: number; step: number; text: (v: number) => string };
  /** A cap on the bench canvas's draws, for a surface that moves slowly or in steps. */
  fps?: number;
  /** False for a plate that does not read `u_time`: it is given `time` and draws only on a change. */
  animated: boolean;
  reducedTime: number;
  still: StillKind;
}

const src = (main: string) => `${DECLS}\n\n${main.trim()}\n`;

const PRELUDE = `
  float pr = u_pixelRatio;
  vec2 css = (gl_FragCoord.xy - 0.5 * u_resolution) / pr;
  vec2 aim = (u_pointer - 0.5) * u_resolution / pr;
  vec2 press = (u_press - 0.5) * u_resolution / pr;
  float reach = 0.6 * length(u_resolution) / pr;`;

const RING = `
  float ring = pressRing(css, press, u_pulse, reach);`;

const INKS = `
  vec3 colour = mix(u_paper.rgb, u_live.rgb, live);
  colour = mix(colour, u_ink.rgb, ink);
  fragColor = vec4(colour, 1.0);
}`;

const fixed = (digits: number) => (v: number) => v.toFixed(digits);
const dot = (v: number) => `${1 + Math.round(v * 2)} px`;

export const SPECIMENS: readonly Specimen[] = [
  {
    id: "fbm",
    name: "FBM",
    call: "fbm(p, octaves)",
    chunks: [FBM],
    animated: true,
    fps: 30,
    reducedTime: 6,
    still: "rings",
    amount: { label: "Octaves", value: 2 / 7, step: 1 / 7, text: (v) => `${1 + Math.round(v * 7)}` },
    source: src(`
// fbm(p, octaves) as a contour map: a thin line every 0.06 of
// height, an index line every 0.3. In the live tone, the contour
// through the height under the pointer, the ground above it ruled.
void main() {${PRELUDE}${RING}

  int octaves = 1 + int(u_amount * 7.0 + 0.5);
  float unit = 150.0 * u_scale;
  vec2 drift = vec2(0.03, 0.011) * u_time;
  float h = fbm(css / unit + drift, octaves) + 0.12 * ring;
  float level = fbm(aim / unit + drift, octaves);

  float thin = hairline(isolines(h, 0.06), hair(0.5 * u_weight));
  float index = hairline(isolines(h, 0.3), hair(1.1 * u_weight));
  float ink = max(thin, index);

  float rule = rules(gl_FragCoord.xy, 0.785, 6.0 * pr);
  float ground = above(h, level) * hairline(rule, hair(0.45 * u_weight));
  float mark = hairline(isolines(h - level, 8.0), hair(1.6 * u_weight));
  float live = max(mark, ground);
${INKS}`),
  },
  {
    id: "warp",
    name: "DOMAIN_WARP",
    call: "domainWarp(p, amount, time)",
    chunks: [DOMAIN_WARP],
    animated: true,
    fps: 30,
    reducedTime: 4,
    still: "grid",
    amount: { label: "Warp", value: 0.45, step: 0.01, text: (v) => (0.15 + 1.1 * v).toFixed(2) },
    source: src(`
// domainWarp(p, amount, time): graph paper pushed along a drifting
// fbm field. Every line here was straight before the warp. The
// square under the pointer is in the live tone: where one square of
// the paper went.
void main() {${PRELUDE}${RING}

  float unit = 22.0 * u_scale;
  float freq = 0.14;
  float push = 0.15 + 1.1 * u_amount;
  vec2 q = domainWarp(css / unit * freq, push, u_time) / freq;
  vec2 mine = domainWarp(aim / unit * freq, push, u_time) / freq;
  q += normalize(css - press + 0.001) * ring * 1.2;

  float minor = min(isolines(q.x, 1.0), isolines(q.y, 1.0));
  float major = min(isolines(q.x, 5.0), isolines(q.y, 5.0));
  float ink = max(
    hairline(minor, hair(0.5 * u_weight)),
    hairline(major, hair(1.1 * u_weight))
  );
  float live = floor(q) == floor(mine) ? 1.0 : 0.0;
${INKS}`),
  },
  {
    id: "simplex",
    name: "SIMPLEX_NOISE",
    call: "simplexNoise(p)",
    chunks: [SIMPLEX_NOISE],
    animated: true,
    fps: 30,
    reducedTime: 3,
    still: "rings",
    amount: { label: "Interval", value: 0.4, step: 0.01, text: (v) => (0.1 + 0.4 * v).toFixed(2) },
    source: src(`
// simplexNoise(p), about -1..1: the zero line heavy, an isoline
// every Interval, the plus side ruled one way and the minus side the
// other. In the live tone, the skewed triangle lattice it is built on.
void main() {${PRELUDE}${RING}

  float unit = 72.0 * u_scale;
  vec2 p = css / unit + vec2(0.0, 0.05 * u_time);
  float n = simplexNoise(p) + 0.5 * ring;
  float interval = 0.1 + 0.4 * u_amount;

  float w = hair(0.4 * u_weight);
  float ruled = mix(
    hairline(rules(gl_FragCoord.xy, -0.785, 7.0 * pr), w),
    hairline(rules(gl_FragCoord.xy, 0.785, 7.0 * pr), w),
    above(n, 0.0)
  );
  float lines = hairline(isolines(n, interval), hair(0.5 * u_weight));
  float zero = hairline(isolines(n, 64.0), hair(1.4 * u_weight));
  float ink = max(max(lines, zero), ruled);

  const float SKEW = 0.36602540378;
  vec2 s = p + (p.x + p.y) * SKEW;
  float lattice = min(isolines(s.x, 1.0), isolines(s.y, 1.0));
  lattice = min(lattice, isolines(s.x - s.y, 1.0));
  float live = hairline(lattice, hair(0.8 * u_weight));
${INKS}`),
  },
  {
    id: "voronoi",
    name: "VORONOI",
    call: "voronoi(p)",
    chunks: [VORONOI],
    animated: true,
    fps: 30,
    reducedTime: 2,
    still: "rules",
    amount: { label: "Ruled", value: 0.5, step: 0.01, text: (v) => `${Math.round(v * 100)}%` },
    source: src(`
// voronoi(p): the distance to the nearest point, to the second
// nearest, and the cell's id. The edges are where the two are equal;
// each point is a dot; a share of the cells (Ruled) is ruled at an
// angle from its id; the cell nearest the pointer is live.
void main() {${PRELUDE}${RING}

  float unit = 44.0 * u_scale;
  vec2 drift = vec2(0.05 * u_time, 0.0);
  vec2 push = normalize(css - press + 0.001) * ring * 0.4;
  vec3 v = voronoi(css / unit + drift + push);
  vec3 near = voronoi(aim / unit + drift);

  // F2 - F1 grows about 1.85 times as fast as the distance to the edge.
  float edge = (v.y - v.x) * unit * pr / 1.85;
  float point = v.x * unit * pr;
  float ink = max(hairline(edge, hair(0.7 * u_weight)), hairline(point, 1.8 * pr));
  float pitch = (3.5 + 3.0 * fract(v.z * 17.0)) * pr;
  float rule = rules(gl_FragCoord.xy, v.z * 3.14159, pitch);
  ink = max(ink, hairline(rule, hair(0.4 * u_weight)) * step(v.z, u_amount));
  float live = step(abs(v.z - near.z), 1e-5);
${INKS}`),
  },
  {
    id: "sdf",
    name: "SDF + SDF_OPS",
    call: "opSmoothUnion(a, b, k)",
    chunks: [SDF, SDF_OPS],
    animated: true,
    reducedTime: 1.2,
    still: "shape",
    amount: { label: "Join k", value: 0.3, step: 0.01, text: (v) => `${Math.round(2 + 80 * v)} px` },
    source: src(`
// Signed distance: sdCircle and sdRoundBox joined by opSmoothUnion
// with radius k, filled by sdfCoverage. Dashed: the two shapes before
// the join. Outside, a line every 12 px of distance maps the field.
void main() {${PRELUDE}

  float size = min(u_resolution.x, u_resolution.y) / pr;
  float a = 0.5 * u_time;
  vec2 orbit = vec2(cos(a), sin(a)) * size * 0.16;
  float circle = sdCircle(css - aim - orbit, size * 0.15 * u_scale);
  float c = cos(0.6 * a);
  float s = sin(0.6 * a);
  vec2 b = mat2(c, s, -s, c) * (css - aim + 0.8 * orbit);
  float box = sdRoundBox(b, vec2(0.2, 0.09) * size * u_scale, 4.0);
  float k = 2.0 + 80.0 * u_amount;
  float d = opSmoothUnion(circle, box, k);
  float run = (1.0 - u_pulse) * reach;
  float wave = opAnnular(sdCircle(css - press, run), 2.0);
  d = u_pulse > 0.0 ? opSmoothUnion(d, wave, k) : d;

  float fill = sdfCoverage(d);
  float w = hair(0.5 * u_weight);
  float dash = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / (6.0 * pr)));
  float before = max(hairline(circle * pr, w), hairline(box * pr, w)) * dash;
  float map = hairline(isolines(d, 12.0), w) * (1.0 - fill);
  float outline = hairline(d * pr, hair(1.3 * u_weight));
  float ink = max(max(outline, map), before);
  float live = fill;
${INKS}`),
  },
  {
    id: "polar",
    name: "POLAR",
    call: "toPolar(p), fromPolar(rp)",
    chunks: [POLAR],
    animated: true,
    reducedTime: 2.4,
    still: "dial",
    amount: { label: "Petals", value: 0.2, step: 0.2, text: (v) => `${2 + Math.round(v * 5)}` },
    source: src(`
// toPolar(p) turns the plane into (radius, angle), so rings and
// spokes are straight lines there. A rose, r = f(angle) with Petals
// petals, is drawn by its distance; the sweep's blips are placed
// with fromPolar.
void main() {${PRELUDE}

  float R = 0.42 * min(u_resolution.x, u_resolution.y) / pr * u_scale;
  vec2 rp = toPolar(css);
  float r = rp.x;
  float a = rp.y;
  float inside = step(r, R);
  float w = hair(0.5 * u_weight);

  float rings = hairline(isolines(r, R / 5.0), w) * inside;
  float wide = 0.2617994;
  float spoke = r * pr * abs(mod(a + 0.5 * wide, wide) - 0.5 * wide);
  float spokes = hairline(spoke, w) * inside * step(R / 5.0, r);
  float fine = wide / 3.0;
  float tick = r * pr * abs(mod(a + 0.5 * fine, fine) - 0.5 * fine);
  float ticks = hairline(tick, w) * step(R, r) * step(r, R + 7.0);
  float rim = hairline((r - R) * pr, hair(1.2 * u_weight));

  float petals = 2.0 + floor(5.0 * u_amount + 0.5);
  float phase = petals * a + 0.4 * u_time;
  float f = R * (0.55 + 0.3 * cos(phase));
  float slope = R * 0.3 * petals * sin(phase) / max(r, 1.0);
  float off = abs(r - f) * pr / sqrt(1.0 + slope * slope);
  float rose = hairline(off, hair(1.1 * u_weight));

  float sweep = mod(0.9 * u_time, 6.2831853) - 3.1415927;
  float behind = mod(sweep - a, 6.2831853);
  vec2 beam = vec2(cos(sweep), sin(sweep));
  float across = abs(dot(css, vec2(-beam.y, beam.x))) * pr;
  float ahead = step(0.0, dot(css, beam)) * inside;
  float beamLine = hairline(across, hair(1.2 * u_weight)) * ahead;
  float rule = rules(gl_FragCoord.xy, sweep + 1.5707963, 3.5 * pr);
  float wake = hairline(rule, hair(0.45 * u_weight)) * step(behind, 0.9) * inside;

  float blips = 0.0;
  float rims = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float at = mod(2.4 * fi + 0.7, 6.2831853) - 3.1415927;
    vec2 b = fromPolar(vec2(R * (0.22 + 0.12 * fi), at));
    float dist = length(css - b) * pr;
    float lit = step(mod(sweep - at, 6.2831853), 2.5);
    blips = max(blips, hairline(dist, 3.0 * pr) * lit);
    rims = max(rims, hairline(dist - 3.0 * pr, hair(0.6 * u_weight)));
  }

  float wave = pressEdge(css, press, u_pulse, reach);
  float ink = max(max(max(rings, spokes), max(ticks, rim)), max(rose, rims));
  float live = max(max(beamLine, wake), blips);
  live = max(live, hairline(wave, hair(1.2 * u_weight)));
${INKS}`),
  },
  {
    id: "halftone",
    name: "HALFTONE",
    call: "halftone(pixel, cell, value, angle)",
    chunks: [HALFTONE],
    animated: true,
    fps: 30,
    reducedTime: 1.5,
    still: "dots",
    amount: { label: "Ruling", value: 0.5, step: 0.01, text: (v) => `${(3 + 5 * (1 - v)).toFixed(1)} px` },
    source: src(`
// halftone(pixel, cell, value, angle): a lit sphere set as a
// two-colour press sets it, the shadow as an ink screen at 45 degrees
// and the light as a live screen at 15. Each dot's area follows the
// tone. Ruling is the cell size.
void main() {${PRELUDE}${RING}

  float R = 0.33 * min(u_resolution.x, u_resolution.y) / pr * u_scale;
  vec2 c = css - vec2(0.0, 0.12 * R);
  float a = 0.5 * u_time;
  vec2 toward = 2.0 * (u_pointer - 0.5) + 0.6 * vec2(cos(a), sin(a));
  vec3 light = normalize(vec3(toward, 0.8));
  float rr = length(c) / R;
  vec3 n = vec3(c / R, sqrt(max(0.0, 1.0 - rr * rr)));
  float body = 1.0 - above(length(c), R);
  float lit = max(dot(n, light), 0.0);
  vec2 under = vec2(-0.7 * light.x * R, -1.02 * R);
  vec2 oval = (c - under) / vec2(R, 0.22 * R);
  float shadow = 1.0 - smoothstep(0.55, 1.0, length(oval));

  float dark = mix(0.5 * shadow, 0.95 * (1.0 - lit), body);
  dark = clamp(dark + 0.4 * ring, 0.0, 1.0);
  float glint = body * pow(lit, 4.0) * 0.9;
  float cell = (3.0 + 5.0 * (1.0 - u_amount)) * pr;
  vec2 px = gl_FragCoord.xy;
  float ink = halftone(px, cell, dark, 0.7853982) * step(0.002, dark);
  float live = halftone(px, cell, glint, 0.2617994) * step(0.002, glint);
${INKS}`),
  },
  {
    id: "bayer",
    name: "BAYER",
    call: "bayer8(pixel)",
    chunks: [BAYER],
    animated: true,
    fps: 30,
    reducedTime: 2,
    still: "checker",
    amount: { label: "Dot", value: 0.5, step: 0.5, text: dot },
    source: src(`
// bayer8(pixel): the 8 x 8 ordered-dither threshold. A soft shadow
// laid down one bit at a time, each cell held against its threshold.
// The strip along the foot is a step wedge, 0 to 1 in nine steps.
// Dot is the cell size.
void main() {${PRELUDE}

  float size = min(u_resolution.x, u_resolution.y) / pr;
  float dotSize = max(1.0, floor(pr * (1.0 + 2.0 * u_amount) + 0.5));
  vec2 cell = floor(gl_FragCoord.xy / dotSize);
  vec2 p = ((cell + 0.5) * dotSize - 0.5 * u_resolution) / pr;

  float a = 0.35 * u_time;
  vec2 spot = aim + vec2(cos(a), sin(1.3 * a)) * 0.2 * size;
  vec2 q = (p - spot) / (0.32 * size * u_scale);
  float tone = 0.92 * exp(-dot(q, q));
  tone += 0.5 * pressRing(p, press, u_pulse, reach);
  float foot = -0.5 * u_resolution.y / pr + 20.0;
  float across = clamp(p.x / (u_resolution.x / pr) + 0.5, 0.0, 0.9999);
  tone = p.y < foot ? floor(across * 9.0) / 8.0 : tone;

  float bits = step(bayer8(cell) + 0.5 / 64.0, tone);
  float rule = hairline((css.y - foot) * pr, hair(0.6 * u_weight));
  vec2 off = css - spot;
  float w = hair(0.7 * u_weight);
  float live = max(
    hairline(off.x * pr, w) * step(abs(off.y), 10.0),
    hairline(off.y * pr, w) * step(abs(off.x), 10.0)
  );
  float ink = max(bits * (1.0 - live), rule);
${INKS}`),
  },
  {
    id: "grain",
    name: "GRAIN",
    call: "filmGrain(pixel, time)",
    chunks: [GRAIN],
    animated: true,
    fps: 24,
    reducedTime: 1,
    still: "checker",
    amount: { label: "Grain", value: 0.5, step: 0.01, text: fixed(2) },
    source: src(`
// filmGrain(pixel, time) as a dither threshold: each dot holds the
// tone against fresh grain every frame, so a tone comes out as a
// density of dots with no pattern (a stochastic screen). At Grain 0
// it is a plain threshold, and the tones band.
void main() {${PRELUDE}

  float dotSize = max(1.0, floor(pr + 0.5));
  vec2 cell = floor(gl_FragCoord.xy / dotSize);
  vec2 p = ((cell + 0.5) * dotSize - 0.5 * u_resolution) / pr;
  float R = 0.34 * min(u_resolution.x, u_resolution.y) / pr * u_scale;
  vec2 c = p - vec2(0.0, 0.1 * R);
  float rr = length(c) / R;
  vec3 n = vec3(c / R, sqrt(max(0.0, 1.0 - rr * rr)));
  vec2 toward = 2.0 * (u_pointer - 0.5) + vec2(-0.5, 0.5);
  float lit = max(dot(n, normalize(vec3(toward, 0.8))), 0.0);
  float body = step(rr, 1.0);
  float ground = clamp(0.5 - p.y / (u_resolution.y / pr), 0.0, 1.0) * 0.4;
  float tone = mix(ground, 0.95 * (1.0 - lit), body);
  tone += 0.5 * pressRing(p, press, u_pulse, reach);
  float glint = body * pow(lit, 6.0);

  float spread = 2.0 * u_amount;
  float ink = step(0.5 + filmGrain(cell, u_time) * spread, tone);
  float other = 0.5 + filmGrain(cell + 71.0, u_time) * spread;
  float live = step(other, glint) * (1.0 - ink);
${INKS}`),
  },
  {
    id: "screens",
    name: "MOSAIC + DOT_SCREENS",
    call: "dotScreen(level, dot)",
    chunks: [MOSAIC, DOT_SCREENS, FBM],
    animated: true,
    fps: 15,
    reducedTime: 5,
    still: "dots",
    amount: { label: "Dot", value: 0.5, step: 0.5, text: dot },
    source: src(`
// A one-bit raster, as the docs build one: the field sampled at
// mosaicCentre so it is flat across each 8-dot cell, its tone made a
// level 0..5, and dotScreen asked whether this dot is on. Near the
// pointer, blockScreen sets one fat dot a cell in the live tone.
void main() {${PRELUDE}

  float dotSize = max(1.0, floor(pr * (1.0 + 2.0 * u_amount) + 0.5));
  vec2 dots = floor(gl_FragCoord.xy / dotSize);
  vec2 centre = mosaicCentre(dots, 8.0) * dotSize;
  centre = (centre - 0.5 * u_resolution) / pr;
  vec2 drift = vec2(0.04 * u_time, 0.0);
  float tone = 0.5 + 1.2 * fbm(centre / (130.0 * u_scale) + drift, 3);
  tone += 0.6 * pressRing(centre, press, u_pulse, reach);
  int level = int(clamp(tone, 0.0, 1.0) * 5.0 + 0.5);

  float size = min(u_resolution.x, u_resolution.y) / pr;
  float near = step(length(centre - aim), 0.24 * size);
  float live = blockScreen(dots, 8.0) * near;
  float ink = dotScreen(level, dots) * (1.0 - live);
${INKS}`),
  },
  {
    id: "faults",
    name: "RASTER_FAULTS",
    call: "deadDot(x, seed, share)",
    chunks: [RASTER_FAULTS, DOT_SCREENS],
    animated: true,
    fps: 12,
    reducedTime: 3,
    still: "checker",
    amount: {
      label: "Faults",
      value: 0.5,
      step: 0.01,
      text: (v) => `${((0.01 + 0.07 * v) * 100).toFixed(1)}%`,
    },
    source: src(`
// A raster written a row at a time, and its faults: deadDot empties
// a column down the whole picture, rowSkew slips a few bands of rows
// sideways (the press drags the rows it crosses). What the dead
// columns lost is in the live tone. A new seed every two seconds.
void main() {${PRELUDE}

  float dotSize = max(1.0, floor(2.0 * pr + 0.5));
  float column = floor(gl_FragCoord.x / dotSize);
  vec2 dots = floor(gl_FragCoord.xy / dotSize);
  float seed = floor(0.5 * u_time);
  float slip = rowSkew(dots.y, 5.0, seed) * 8.0 * u_amount;
  float drag = 8.0 * pressRing(css, press, u_pulse, reach);
  dots.x += floor(slip + drag + 0.5);

  // The picture: a ring chart of the six screens, a frame, a cross.
  vec2 p = ((dots + 0.5) * dotSize - 0.5 * u_resolution) / pr;
  float R = 0.4 * min(u_resolution.x, u_resolution.y) / pr * u_scale;
  float r = length(p) / R;
  float on = dotScreen(5 - int(floor(r * 6.0)), dots);
  float edge = dotSize / pr;
  float frame = step(abs(length(p) - R), edge);
  float axes = max(step(abs(p.x), edge), step(abs(p.y), edge));
  on = max(on, max(frame, axes * step(r, 1.15)));

  float dead = deadDot(column, seed, 0.01 + 0.07 * u_amount);
  float ink = on * (1.0 - dead);
  float live = on * dead;
${INKS}`),
  },
  {
    id: "oklab",
    name: "OKLAB",
    call: "oklabMix(a, b, t)",
    chunks: [OKLAB],
    animated: false,
    reducedTime: 0,
    still: "grid",
    amount: { label: "Steps", value: 0.6, step: 0.1, text: (v) => `${2 + Math.round(v * 10)}` },
    source: src(`
// Paper mixed into ink three ways, plotted as OKLab lightness (up,
// 0 to 1) against t (across): in linear light (dotted), in sRGB
// (dashed), and by oklabMix (the live line), the one that steps
// evenly. Steps marks oklabMix and the linear mix at even steps of t.
float lightness(vec3 c) {
  return linearToOklab(srgbToLinear(c)).x;
}

float mixed(int way, float t) {
  vec3 a = u_paper.rgb;
  vec3 b = u_ink.rgb;
  if (way == 0) return lightness(oklabMix(a, b, t));
  if (way == 1) return lightness(mix(a, b, t));
  vec3 lin = mix(srgbToLinear(a), srgbToLinear(b), t);
  return lightness(linearToSrgb(lin));
}

// Device px from this pixel to the curve y = mixed(way, t).
float curve(int way, float t, float e, float y, float h) {
  float l = mixed(way, t);
  float g = (mixed(way, t + e) - l) * h;
  return abs(y - l * h) / sqrt(1.0 + g * g);
}

void main() {${PRELUDE}

  vec2 size = u_resolution / pr;
  vec2 lo = -0.5 * size + vec2(16.0, 14.0);
  vec2 hi = 0.5 * size - vec2(12.0, 14.0);
  vec2 span = hi - lo;
  vec2 uv = (css - lo) / span;
  float inPlot = step(0.0, uv.x) * step(uv.x, 1.0);
  inPlot *= step(0.0, uv.y) * step(uv.y, 1.0);

  float t = clamp(uv.x, 0.0, 1.0);
  float e = 1.0 / (span.x * pr);
  float h = span.y * pr;
  float y = uv.y * h;
  float x = gl_FragCoord.x;
  float dashed = step(0.4, fract(x / (10.0 * pr)));
  float dotted = step(0.5, fract(x / (3.0 * pr)));
  float w = hair(0.8 * u_weight);
  float even = hairline(curve(0, t, e, y, h), hair(1.3 * u_weight));
  float plain = hairline(curve(1, t, e, y, h), w) * dashed;
  float inLight = hairline(curve(2, t, e, y, h), w) * dotted;

  vec2 q = abs(css - 0.5 * (lo + hi)) - 0.5 * span;
  float box = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float frame = hairline(box * pr, hair(0.6 * u_weight));
  float grain = step(0.5, fract((x + gl_FragCoord.y) / (4.0 * pr)));
  float quarter = min(isolines(uv.x, 0.25), isolines(uv.y, 0.25));
  float grid = hairline(quarter, hair(0.4 * u_weight)) * grain;

  float marks = 0.0;
  float rims = 0.0;
  int steps = 2 + int(u_amount * 10.0 + 0.5);
  for (int i = 0; i <= 12; i++) {
    if (i > steps) break;
    float ti = float(i) / float(steps);
    float at = lo.x + ti * span.x;
    vec2 po = vec2(at, lo.y + mixed(0, ti) * span.y);
    vec2 pl = vec2(at, lo.y + mixed(2, ti) * span.y);
    marks = max(marks, hairline(length(css - po) * pr, 2.6 * pr));
    float ring = (length(css - pl) - 3.0) * pr;
    rims = max(rims, hairline(ring, hair(0.6 * u_weight)));
  }

  float curves = max(plain, inLight) * inPlot;
  float ink = max(max(frame, grid * inPlot), max(curves, rims));
  float live = max(even * inPlot, marks);
  float wave = pressEdge(css, press, u_pulse, reach);
  live = max(live, hairline(wave, hair(1.2 * u_weight)));
${INKS}`),
  },
];

const NAMES = new Map<GlslChunk, string>([
  ...Object.entries(CHUNKS).map(([name, c]) => [c, name] as [GlslChunk, string]),
  [PLATE, "PLATE"],
]);

/** The chunks a specimen's text sits after, by constant name, in the order `compose` writes them. */
export function composedNames(specimen: Specimen): string[] {
  const seen = new Set<GlslChunk>();
  const out: string[] = [];
  const visit = (c: GlslChunk) => {
    if (seen.has(c)) return;
    seen.add(c);
    for (const d of c.deps) visit(d);
    out.push(NAMES.get(c) ?? c.name);
  };
  for (const c of [...specimen.chunks, PLATE]) visit(c);
  return out;
}

/**
 * The fragment a canvas is handed: the chunks, then `#line` so the driver numbers the specimen's text from 1 once
 * the engine's `fixLog` has taken off the head's lines.
 */
export function fragmentOf(specimen: Specimen, source: string): string {
  return `${compose(...specimen.chunks, PLATE)}#line ${HEAD_LINES + 1}\n${source}`;
}
