// The engine as an exploded assembly drawing, plotted by a fragment shader: isometric plates, one per entry of the
// package, with the cover (the look) in phantom line because it is not supplied. Everything is analytic: an edge is a
// distance in device pixels, so lines stay hairlines at any density, and tone is hatching, never a grey.
//
// One table of parts drives three things that must agree: the GLSL (as constant arrays), the labels and leaders the
// page lays over the canvas (`project`), and the pointer's pick (`partAt`).
import { compose, HASH, uniformDecls, VALUE_NOISE } from "watchpot/shader";

export interface Part {
  id: string;
  /** The lettering on the drawing. */
  name: string;
  /** The import, or what stands in its place. */
  entry: string;
  /** What it is, in a few words. */
  line: string;
  /** Footprint on the unit plate: x0, y0, x1, y1. */
  foot: readonly [number, number, number, number];
  level: number;
  height: number;
  /** Which schematic its top face carries (see `glyph` in the fragment). */
  glyph: number;
  phantom?: boolean;
  /** Which side of the stack its label sits on. */
  side: "left" | "right";
  /** Where its label goes: a section of this page, or a page of the docs. */
  href: string;
}

const FULL = [0, 0, 1, 1] as const;
const NEAR = [0, 0, 0.47, 1] as const;
const FAR = [0.53, 0, 1, 1] as const;

/** Bottom to top. Within a level, the part with the larger x comes first (it is further from the eye). */
export const PARTS: readonly Part[] = [
  {
    id: "core",
    name: "core",
    entry: "watchpot/core",
    line: "the store, the rules, the clock, the save",
    foot: FULL,
    level: 0,
    height: 0.15,
    glyph: 1,
    side: "left",
    href: "#live",
  },
  {
    id: "test",
    name: "test",
    entry: "watchpot/test",
    line: "stores and clocks for tests",
    foot: FAR,
    level: 1,
    height: 0.055,
    glyph: 3,
    side: "right",
    href: "docs/test-kit.html",
  },
  {
    id: "sim",
    name: "sim",
    entry: "watchpot/sim",
    line: "plays the game with nobody there",
    foot: NEAR,
    level: 1,
    height: 0.055,
    glyph: 2,
    side: "left",
    href: "#sim",
  },
  {
    id: "react",
    name: "react",
    entry: "watchpot/react",
    line: "hooks, the runtime, the dev panel",
    foot: FULL,
    level: 2,
    height: 0.055,
    glyph: 4,
    side: "left",
    href: "docs/react.html",
  },
  {
    id: "kit",
    name: "kit",
    entry: "watchpot/kit",
    line: "effects that carry no look",
    foot: FAR,
    level: 3,
    height: 0.055,
    glyph: 6,
    side: "right",
    href: "docs/feel.html",
  },
  {
    id: "ui",
    name: "ui",
    entry: "watchpot/ui",
    line: "behaviour, focus and ARIA, unstyled",
    foot: NEAR,
    level: 3,
    height: 0.055,
    glyph: 5,
    side: "left",
    href: "#ui",
  },
  {
    id: "sound",
    name: "sound",
    entry: "watchpot/sound",
    line: "a mixer in one audio worklet",
    foot: FAR,
    level: 4,
    height: 0.055,
    glyph: 8,
    side: "right",
    href: "#sound",
  },
  {
    id: "shader",
    name: "shader",
    entry: "watchpot/shader",
    line: "runs the game's own GLSL",
    foot: NEAR,
    level: 4,
    height: 0.055,
    glyph: 7,
    side: "left",
    href: "#shader",
  },
  {
    id: "three",
    name: "three",
    entry: "watchpot/three",
    line: "the stage around a 3D scene",
    foot: [0.16, 0.16, 0.84, 0.84],
    level: 5,
    height: 0.055,
    glyph: 9,
    side: "right",
    href: "docs/three.html",
  },
  {
    id: "look",
    name: "the look",
    entry: "not supplied",
    line: "every pixel, word and colour: the game's",
    foot: FULL,
    level: 6,
    height: 0.09,
    glyph: 0,
    phantom: true,
    side: "right",
    href: "#made-with",
  },
];

/** The gap that opens between levels when the drawing is fully exploded, in plate units. */
export const GAP = 0.2;

const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;

const LEVELS = Math.max(...PARTS.map((p) => p.level)) + 1;
const LEVEL_HEIGHT: number[] = Array.from({ length: LEVELS }, (_, level) =>
  Math.max(...PARTS.filter((p) => p.level === level).map((p) => p.height)),
);
/** The underside of each level with the stack closed. */
const LEVEL_BASE: number[] = LEVEL_HEIGHT.map((_, level) =>
  LEVEL_HEIGHT.slice(0, level).reduce((a, b) => a + b, 0),
);

/** A part's underside at `explode` (0 closed, 1 fully apart). */
export const baseOf = (part: Part, explode: number) =>
  (LEVEL_BASE[part.level] ?? 0) + part.level * GAP * explode;

/** The stack's height at `explode`, plate units. */
export const stackHeight = (explode: number) => {
  const top = PARTS[PARTS.length - 1];
  return top ? baseOf(top, explode) + top.height : 0;
};

/** How the drawing sits in its box: CSS pixels a plate unit, and where the plate's near corner lands. */
export interface Geometry {
  width: number;
  height: number;
  scale: number;
  /** The projected origin, CSS pixels from the box's left and top. */
  ox: number;
  oy: number;
}

/** Fits the fully exploded stack into a box with `pad` clear all round. */
export function fit(width: number, height: number, pad: number): Geometry {
  const w = 2 * C30;
  const h = 2 * S30 + stackHeight(1);
  const scale = Math.max(1, Math.min((width - 2 * pad) / w, (height - 2 * pad) / h));
  return { width, height, scale, ox: width / 2, oy: height - (height - h * scale) / 2 };
}

/** A point of the drawing in the box, CSS pixels from its left and top. */
export function project(g: Geometry, x: number, y: number, z: number): [number, number] {
  return [g.ox + (x - y) * C30 * g.scale, g.oy - ((x + y) * S30 + z) * g.scale];
}

/** Where a part's leader starts: the outer corner of its top face on its label's side. */
export function anchorOf(g: Geometry, part: Part, explode = 1): [number, number] {
  const [x0, y0, x1, y1] = part.foot;
  const z = baseOf(part, explode) + part.height;
  return part.side === "left" ? project(g, x0, y1, z) : project(g, x1, y0, z);
}

/** The three visible faces of a part as polygons in the box (top, left, right), for the still and the pick. */
export function facesOf(g: Geometry, part: Part, explode = 1): [number, number][][] {
  const [x0, y0, x1, y1] = part.foot;
  const z0 = baseOf(part, explode);
  const z1 = z0 + part.height;
  const p = (x: number, y: number, z: number) => project(g, x, y, z);
  return [
    [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)],
    [p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0), p(x0, y0, z0)],
    [p(x0, y0, z1), p(x1, y0, z1), p(x1, y0, z0), p(x0, y0, z0)],
  ];
}

function inside(poly: readonly [number, number][], px: number, py: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (!a || !b) continue;
    if (a[1] > py !== b[1] > py && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

/** The index of the part under a point of the box (the nearest to the eye), or -1. */
export function partAt(g: Geometry, px: number, py: number, explode = 1): number {
  for (let i = PARTS.length - 1; i >= 0; i--) {
    const part = PARTS[i];
    if (part && facesOf(g, part, explode).some((face) => inside(face, px, py))) return i;
  }
  return -1;
}

const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));
const N = PARTS.length;

/** The fragment: the parts as constant arrays, drawn back to front. */
export const ASSEMBLY = compose(
  HASH,
  VALUE_NOISE,
  uniformDecls({
    u_paper: "vec4",
    u_ink: "vec4",
    u_live: "vec4",
    u_origin: "vec2",
    u_scale: "float",
    u_explode: "float",
    u_focus: "float",
    u_focusMix: "float",
    u_tick: "float",
    u_level: "float",
  }),
  `
const int N = ${N};
const vec4 FOOT[N] = vec4[N](${PARTS.map((p) => `vec4(${p.foot.map(f).join(", ")})`).join(", ")});
const float BASE[N] = float[N](${PARTS.map((p) => f(LEVEL_BASE[p.level] ?? 0)).join(", ")});
const float LEVEL[N] = float[N](${PARTS.map((p) => f(p.level)).join(", ")});
const float HEIGHT[N] = float[N](${PARTS.map((p) => f(p.height)).join(", ")});
const int GLYPH[N] = int[N](${PARTS.map((p) => p.glyph).join(", ")});
const float PHANTOM[N] = float[N](${PARTS.map((p) => (p.phantom ? "1.0" : "0.0")).join(", ")});
const float GAP = ${f(GAP)};
const float TOP = ${f(stackHeight(0))};
const float LEVELS = ${f(LEVELS - 1)};
const float C30 = 0.8660254;
const float S30 = 0.5;

// A stroke: 1 inside half-width w of the line (d is a distance in device pixels), one pixel of falloff.
float stroke(float d, float w) {
  return 1.0 - smoothstep(w - 0.5, w + 0.5, abs(d));
}

// A chain line (long, dot, dot): how a drawing shows what is not part of the assembly.
float chain(float along, float pr) {
  float t = mod(along / pr, 26.0);
  return max(step(t, 13.0), max(step(16.0, t) * step(t, 18.5), step(21.5, t) * step(t, 24.0)));
}

// A centre line (long, short).
float centre(float along, float pr) {
  float t = mod(along / pr, 24.0);
  return max(step(t, 14.0), step(18.0, t) * step(t, 20.5));
}

float sdBox2(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// The schematic on a part's top face. Most of a plate hides under the one above, so a schematic lives in the strip
// along its near edge: p runs 0..size across that strip, in face pixels. The result is x: line, y: live fill.
vec2 glyph(int kind, vec2 p, vec2 size, float pr) {
  vec2 c = p - size * 0.5;
  float w = 0.5 * pr;
  float inside = step(0.0, p.x) * step(p.x, size.x) * step(0.0, p.y) * step(p.y, size.y);
  if (kind == 1) {
    // core: the tick's eight phases in a row, the one that just ran filled.
    float cell = min(size.x / 13.0, size.y * 0.6);
    float pitch = cell * 1.5;
    float x = c.x + pitch * 3.5;
    float i = clamp(floor(x / pitch + 0.5), 0.0, 7.0);
    float d = sdBox2(vec2(x - i * pitch, c.y), vec2(cell * 0.5));
    float ran = floor((1.0 - u_tick) * 8.0);
    float lit = step(0.001, u_tick) * step(abs(i - ran), 0.5);
    return vec2(stroke(d, w), lit * (1.0 - smoothstep(-0.5, 0.5, d)));
  }
  if (kind == 2) {
    // sim: a timeline, each bar taller than the last.
    float pitch = size.x / 6.0;
    float i = clamp(floor(p.x / pitch - 0.5), 0.0, 4.0);
    float h = size.y * (0.22 + 0.17 * i);
    float d = sdBox2(vec2(p.x - (i + 1.0) * pitch, p.y - h * 0.5 - size.y * 0.04), vec2(pitch * 0.26, h * 0.5));
    return vec2(stroke(d, w), 0.0);
  }
  if (kind == 3) {
    // test: three boxes, each struck through.
    float pitch = size.x / 4.0;
    float i = clamp(floor(p.x / pitch + 0.5), 1.0, 3.0);
    vec2 q = vec2(p.x - i * pitch, c.y);
    float r = min(size.y * 0.34, pitch * 0.3);
    float tick = stroke((q.x - q.y) * 0.7071, w) * step(max(abs(q.x), abs(q.y)), r);
    return vec2(max(stroke(sdBox2(q, vec2(r)), w), tick), 0.0);
  }
  if (kind == 4) {
    // react: a tree, as boxes inside boxes.
    float a = stroke(sdBox2(c, size * vec2(0.36, 0.42)), w);
    float b = stroke(sdBox2(c - vec2(size.x * 0.1, 0.0), size * vec2(0.22, 0.27)), w);
    float d = stroke(sdBox2(c - vec2(size.x * 0.17, 0.0), size * vec2(0.1, 0.12)), w);
    return vec2(max(a, max(b, d)), 0.0);
  }
  if (kind == 5) {
    // ui: a slider and its knob, outlines only (no fill: it has no look).
    float knob = sdBox2(c - vec2(size.x * 0.1, 0.0), vec2(size.y * 0.16, size.y * 0.38));
    float track = stroke(c.y, w) * step(abs(c.x), size.x * 0.38) * step(0.0, knob);
    return vec2(max(track, stroke(knob, w)), 0.0);
  }
  if (kind == 6) {
    // kit: three bursts.
    float pitch = size.x / 3.0;
    vec2 q = vec2(mod(p.x, pitch) - pitch * 0.5, c.y);
    float r = length(q);
    float spoke = abs(sin(atan(q.y, q.x) * 4.0)) * r;
    return vec2(stroke(spoke, w) * step(size.y * 0.14, r) * step(r, size.y * 0.44) * inside, 0.0);
  }
  if (kind == 7) {
    // shader: a field that is running, as a screen of dots over the whole plate.
    vec2 cellSize = vec2(max(3.2 * pr, size.x / 22.0));
    vec2 id = floor(p / cellSize);
    vec2 q = p - (id + 0.5) * cellSize;
    float n = valueNoise(id * 0.21 + vec2(u_time * 0.2, -u_time * 0.12));
    float m = step(sdBox2(c, size * 0.5 - cellSize), 0.0);
    float dotR = cellSize.x * 0.42 * smoothstep(0.36, 0.72, n);
    return vec2(0.0, m * (1.0 - smoothstep(dotR - 0.6, dotR + 0.6, length(q))));
  }
  if (kind == 8) {
    // sound: a wave, taller when the mixer is.
    float amp = size.y * (0.16 + 0.3 * u_level);
    float k = 5.2 / size.y;
    float phase = c.x * k + u_time * 2.2;
    float fade = smoothstep(size.x * 0.46, size.x * 0.3, abs(c.x));
    float y = sin(phase) * amp * fade;
    float slope = cos(phase) * amp * fade * k;
    return vec2(stroke((c.y - y) / sqrt(1.0 + slope * slope), w * 1.1) * inside, 0.0);
  }
  if (kind == 9) {
    // three: a cube in wire, in the middle of the plate (nothing covers this one).
    float r = min(size.x, size.y) * 0.27;
    float box = stroke(sdBox2(c, vec2(r)), w);
    float inner = stroke(sdBox2(c - vec2(r * 0.36), vec2(r * 0.64)), w) * step(sdBox2(c, vec2(r)), 0.0);
    float tie = stroke((c.x - c.y) * 0.7071, w) * step(c.x, r * -0.28) * step(-r, c.x) * step(abs(c.x - c.y), r);
    return vec2(max(box, max(inner, tie)), 0.0);
  }
  return vec2(0.0);
}

void main() {
  float pr = u_pixelRatio;
  float scale = u_scale * pr;
  vec2 P = (gl_FragCoord.xy - u_origin * pr) / scale;
  float px = scale * C30;
  float thin = 0.55 * pr;
  float thick = 1.3 * pr;

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  // The assembly's axis: a centre line up through the middle of every plate, seen in the gaps.
  float top = TOP + LEVELS * GAP * u_explode;
  float axis = stroke(P.x * scale, 0.45 * pr) * centre(gl_FragCoord.y, pr);
  axis *= step(0.36, P.y) * step(P.y, top + 0.62) * u_explode;
  col = u_ink.rgb * axis * 0.7;
  alpha = axis * 0.7;

  float a = P.x / C30;
  for (int i = 0; i < N; i++) {
    vec4 ft = FOOT[i];
    float z0 = BASE[i] + LEVEL[i] * GAP * u_explode;
    float z1 = z0 + HEIGHT[i];
    float focused = (1.0 - step(0.5, abs(u_focus - float(i)))) * u_focusMix;
    float dimmed = (1.0 - focused) * u_focusMix * step(-0.5, u_focus);
    float ink = mix(1.0, 0.34, dimmed);

    // Top face: (x, y) on the plane z = z1.
    float b = (P.y - z1) / S30;
    vec2 t = vec2((a + b) * 0.5, (b - a) * 0.5);
    vec4 dT = vec4(t.x - ft.x, ft.z - t.x, t.y - ft.y, ft.w - t.y) * px;
    float covT = clamp(min(min(dT.x, dT.y), min(dT.z, dT.w)) + 0.5, 0.0, 1.0);

    // Left face: the plane x = x0, in (y, z).
    float ly = ft.x - a;
    float lz = P.y - (ft.x + ly) * S30;
    vec4 dL = vec4(ly - ft.y, ft.w - ly, lz - z0, z1 - lz) * px;
    float covL = clamp(min(min(dL.x, dL.y), min(dL.z, dL.w)) + 0.5, 0.0, 1.0);

    // Right face: the plane y = y0, in (x, z).
    float rx = a + ft.y;
    float rz = P.y - (rx + ft.y) * S30;
    vec4 dR = vec4(rx - ft.x, ft.z - rx, rz - z0, z1 - rz) * px;
    float covR = clamp(min(min(dR.x, dR.y), min(dR.z, dR.w)) + 0.5, 0.0, 1.0);

    float cov = min(1.0, covT + covL + covR);
    if (cov <= 0.0) continue;

    if (PHANTOM[i] > 0.5) {
      // Not supplied: chain lines, nothing behind them hidden.
      float w = 0.6 * pr;
      float lineT = max(
        max(stroke(dT.x, w), stroke(dT.y, w)) * chain(t.y * scale, pr),
        max(stroke(dT.z, w), stroke(dT.w, w)) * chain(t.x * scale, pr)
      ) * step(0.001, covT);
      float lineL = max(
        max(stroke(dL.x, w), stroke(dL.y, w)) * chain(lz * scale, pr),
        max(stroke(dL.z, w), stroke(dL.w, w)) * chain(ly * scale, pr)
      ) * step(0.001, covL);
      float lineR = max(
        max(stroke(dR.x, w), stroke(dR.y, w)) * chain(rz * scale, pr),
        max(stroke(dR.z, w), stroke(dR.w, w)) * chain(rx * scale, pr)
      ) * step(0.001, covR);
      float line = max(lineT, max(lineL, lineR)) * ink;
      float wash = focused * 0.5 * covT;
      col = col * (1.0 - wash) + u_live.rgb * wash;
      alpha = alpha * (1.0 - wash) + wash;
      col = col * (1.0 - line) + u_ink.rgb * line;
      alpha = alpha * (1.0 - line) + line;
      continue;
    }

    // Edges a face shares with another face of the same part are thin; its outline against the sheet is heavy.
    float lineT = max(max(stroke(dT.x, thin), stroke(dT.z, thin)), max(stroke(dT.y, thick), stroke(dT.w, thick)));
    float lineL = max(max(stroke(dL.x, thin), stroke(dL.w, thin)), max(stroke(dL.y, thick), stroke(dL.z, thick)));
    float lineR = max(max(stroke(dR.x, thin), stroke(dR.w, thin)), max(stroke(dR.y, thick), stroke(dR.z, thick)));

    // Tone is hatching: the face turned away from the light is ruled close, the other sparsely.
    float hatchR = stroke(mod(((rx - ft.x) + (z1 - rz)) * 0.5 * scale, 3.4 * pr) - 1.7 * pr, 0.32 * pr);
    float hatchL = stroke(mod((z1 - lz) * px, 4.4 * pr) - 2.2 * pr, 0.28 * pr) * 0.75;

    // The whole face for the two plates nothing covers; otherwise the strip along the near edge.
    bool whole = GLYPH[i] == 7 || GLYPH[i] == 9;
    vec2 gp = whole ? vec2(t.x - ft.x, t.y - ft.y) * px : vec2(t.x - ft.x - 0.035, t.y - ft.y - 0.04) * px;
    vec2 gs = whole ? vec2(ft.z - ft.x, ft.w - ft.y) * px : vec2(ft.z - ft.x - 0.07, 0.15) * px;
    vec2 g = glyph(GLYPH[i], gp, gs, pr);

    vec3 topFill = mix(u_paper.rgb, u_live.rgb, max(focused, g.y));
    vec3 cT = mix(topFill, u_ink.rgb, max(lineT, g.x * 0.85) * ink);
    vec3 cL = mix(u_paper.rgb, u_ink.rgb, max(lineL, hatchL) * ink);
    vec3 cR = mix(u_paper.rgb, u_ink.rgb, max(lineR, hatchR) * ink);
    vec3 face = (cT * covT + cL * covL + cR * covR) / max(covT + covL + covR, 0.0001);

    col = col * (1.0 - cov) + face * cov;
    alpha = alpha * (1.0 - cov) + cov;
  }

  fragColor = vec4(col, alpha);
}
`,
);
