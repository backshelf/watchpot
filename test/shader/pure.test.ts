import { describe, expect, test } from "bun:test";
import {
  CHUNKS,
  canvasSize,
  chunk,
  compose,
  createPulse,
  FBM,
  fixLog,
  type GlslChunk,
  GRADIENT_NOISE,
  HASH,
  HEAD_LINES,
  hexToVec4,
  inferKind,
  kindsOf,
  MATH,
  RASTER_FAULTS,
  SHADER_HEAD,
  SIMPLEX_NOISE,
  sameUniforms,
  toFloats,
  uniformDecls,
  VERTEX_SHADER,
} from "watchpot/shader";

describe("uniforms", () => {
  test("kinds are inferred from values and declared ones win", () => {
    expect(inferKind(1)).toBe("float");
    expect(inferKind(true)).toBe("bool");
    expect(inferKind("#fff")).toBe("vec4");
    expect(inferKind([1, 2])).toBe("vec2");
    expect(inferKind([1, 2, 3])).toBe("vec3");
    expect(inferKind([1, 2, 3, 4])).toBe("vec4");
    expect(inferKind([1, 2, 3, 4, 5, 6])).toBe("float[6]");
    expect(kindsOf({ a: 1, b: [1, 2, 3] }, { a: "int", b: "float[3]" })).toEqual({ a: "int", b: "float[3]" });
  });

  test("hex colours become vec4 in 0..1, every form; anything else is null", () => {
    expect(hexToVec4("#ff0000")).toEqual([1, 0, 0, 1]);
    expect(hexToVec4("#0f08")).toEqual([0, 1, 0, 0x88 / 255]);
    expect(hexToVec4("#FFFFFF80")).toEqual([1, 1, 1, 0x80 / 255]);
    expect(hexToVec4("#abc")).toEqual(hexToVec4("#aabbcc"));
    expect(hexToVec4("red")).toBeNull();
    expect(hexToVec4("#12345")).toBeNull();
    for (const h of ["#123", "#a1b2c3", "#a1b2c3d4"])
      for (const c of hexToVec4(h) ?? []) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
  });

  test("values send the floats their kind holds", () => {
    expect(toFloats("#ff0000", "vec3")).toEqual([1, 0, 0]);
    expect(toFloats(true, "bool")).toEqual([1]);
    expect(toFloats([1, 2], "float[4]")).toEqual([1, 2, 0, 0]);
    expect(toFloats("nonsense", "vec4")).toEqual([0, 0, 0, 0]);
  });

  test("declarations in name order; equality by value", () => {
    expect(uniformDecls({ u_b: "vec4", u_a: "float[8]" })).toBe("uniform float u_a[8];\nuniform vec4 u_b;");
    expect(sameUniforms({ a: [1, 2], b: "#fff" }, { b: "#fff", a: [1, 2] })).toBe(true);
    expect(sameUniforms({ a: [1, 2] }, { a: [1, 3] })).toBe(false);
    expect(sameUniforms({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

describe("the head", () => {
  test("starts with the version line and declares the standard uniforms", () => {
    expect(SHADER_HEAD.startsWith("#version 300 es\n")).toBe(true);
    for (const u of ["u_time", "u_resolution", "u_pixelRatio", "u_pointer", "fragColor"])
      expect(SHADER_HEAD).toContain(u);
    expect(VERTEX_SHADER.startsWith("#version 300 es\n")).toBe(true);
  });

  test("a driver's line numbers are moved back to the game's fragment", () => {
    const line = HEAD_LINES + 4;
    expect(fixLog(`ERROR: 0:${line}: 'x' : undeclared identifier\nERROR: 0:${line + 1}: oops`)).toBe(
      "ERROR: 0:4: 'x' : undeclared identifier\nERROR: 0:5: oops",
    );
    expect(fixLog("ERROR: 0:2: precision")).toBe("ERROR: head:2: precision");
    // Line 1 of the fragment is the line after the head.
    expect(`${SHADER_HEAD}void main() {}`.split("\n")[HEAD_LINES]).toBe("void main() {}");
  });

  test("canvas size: the ratio is capped by dpr and the area by maxPixels", () => {
    expect(canvasSize(100, 50, 3, 2, 1e9)).toEqual({ width: 200, height: 100, ratio: 2 });
    const capped = canvasSize(1000, 1000, 2, 2, 1_000_000);
    expect(capped.width * capped.height).toBeLessThanOrEqual(1_000_000);
    expect(capped.ratio).toBeCloseTo(1, 5);
  });
});

describe("compose", () => {
  test("pulls dependencies in first, each once, then the strings in order", () => {
    const glsl = compose(SIMPLEX_NOISE, FBM, "uniform float u_x;", "void main() {}");
    const order = [...glsl.matchAll(/^\/\/ (\w+)$/gm)].map((m) => m[1]);
    expect(order).toEqual(["hash", "math", "gradientNoise", "simplexNoise", "fbm"]);
    expect(glsl.indexOf("uniform float u_x;")).toBeLessThan(glsl.indexOf("void main() {}"));
    expect(glsl.indexOf("fbm")).toBeLessThan(glsl.indexOf("uniform float u_x;"));
  });

  test("a chunk interpolates as its own code", () => {
    expect(`${HASH}`).toBe(HASH.code);
    const mine = chunk("mine", "float twice(float x) { return 2.0 * x; }", [MATH]);
    expect(compose(mine)).toContain("const float TAU");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// GLSL sanity: no compiler here, so the chunks are read as text.

const ALL: GlslChunk[] = Object.values(CHUNKS);

/** GLSL ES 3.00 keywords and reserved words that can never name a function, variable or parameter. */
const RESERVED = new Set(
  (
    "attribute const uniform varying layout centroid flat smooth break continue do for while switch case default " +
    "if else in out inout float int void bool true false invariant discard return mat2 mat3 mat4 mat2x2 mat2x3 " +
    "mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 vec2 vec3 vec4 ivec2 ivec3 ivec4 bvec2 bvec3 bvec4 uint " +
    "uvec2 uvec3 uvec4 lowp mediump highp precision sampler2D sampler3D samplerCube struct coherent volatile " +
    "restrict readonly writeonly resource atomic_uint noperspective patch sample subroutine common partition " +
    "active asm class union enum typedef template this goto inline noinline public static extern external " +
    "interface long short double half fixed unsigned superp input output hvec2 hvec3 hvec4 dvec2 dvec3 dvec4 " +
    "fvec2 fvec3 fvec4 filter sizeof cast namespace using"
  ).split(" "),
);

const TYPES = "float|int|bool|vec2|vec3|vec4|ivec2|ivec3|ivec4|mat2|mat3|mat4|void";
/** Every name a chunk declares: functions, parameters, locals and constants. */
const declared = (code: string) =>
  [...code.matchAll(new RegExp(`\\b(?:${TYPES})\\s+([A-Za-z_]\\w*)`, "g"))].map((m) => m[1] ?? "");
/** The functions and constants a chunk defines for others to call. */
const defines = (code: string) => [
  ...[...code.matchAll(new RegExp(`^(?:${TYPES})\\s+(\\w+)\\s*\\(`, "gm"))].map((m) => m[1] ?? ""),
  ...[...code.matchAll(/^const\s+\w+\s+(\w+)\s*=/gm)].map((m) => m[1] ?? ""),
];
const closure = (c: GlslChunk, out = new Set<GlslChunk>()): Set<GlslChunk> => {
  for (const d of c.deps) if (!out.has(d)) closure(d, out.add(d));
  return out;
};

describe("the chunks", () => {
  test.each(ALL.map((c) => [c.name, c] as const))("%s: braces and parentheses balance", (_, c) => {
    for (const [open, close] of [
      ["{", "}"],
      ["(", ")"],
      ["[", "]"],
    ] as const) {
      let depth = 0;
      for (const ch of c.code) {
        if (ch === open) depth++;
        if (ch === close) depth--;
        expect(depth).toBeGreaterThanOrEqual(0);
      }
      expect(depth).toBe(0);
    }
  });

  test.each(ALL.map((c) => [c.name, c] as const))(
    "%s: no reserved word or double underscore as a name",
    (_, c) => {
      const names = declared(c.code);
      expect(names.length).toBeGreaterThan(0);
      expect(names.filter((n) => RESERVED.has(n) || n.includes("__") || n.startsWith("gl_"))).toEqual([]);
    },
  );

  test.each(ALL.map((c) => [c.name, c] as const))(
    "%s: everything it calls from another chunk is a stated dependency",
    (_, c) => {
      const reach = closure(c);
      for (const other of ALL) {
        if (other === c || reach.has(other)) continue;
        const used = defines(other.code).filter((name) => new RegExp(`\\b${name}\\b`).test(c.code));
        // A name both define (a parameter called like another's helper) is not a call.
        const own = new Set(declared(c.code));
        expect(used.filter((n) => !own.has(n)).map((n) => `${n} from ${other.name}`)).toEqual([]);
      }
    },
  );

  test("no two chunks define the same function or constant", () => {
    const seen = new Map<string, string>();
    for (const c of ALL)
      for (const name of new Set(defines(c.code))) {
        expect(seen.get(name)).toBeUndefined();
        seen.set(name, c.name);
      }
  });

  test("every line ends a statement or a block, or continues into a `(`, `,` or a closing `)`", () => {
    for (const c of ALL) {
      const lines = c.code
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l !== "" && !l.startsWith("//"));
      lines.forEach((line, i) => {
        const ok = /[;{}(,]$/.test(line) || (lines[i + 1] ?? "").startsWith(")");
        expect(ok ? "" : `${c.name}: ${line}`).toBe("");
      });
    }
  });

  test("GRADIENT_NOISE needs the hash and the constants", () => {
    expect([...closure(GRADIENT_NOISE)]).toEqual(expect.arrayContaining([HASH, MATH]));
  });

  test("the raster chunks are on the list, and the faults bring the hash they call", () => {
    expect(ALL.map((c) => c.name)).toEqual(expect.arrayContaining(["mosaic", "dotScreens", "rasterFaults"]));
    expect([...closure(RASTER_FAULTS)]).toEqual([HASH]);
    const glsl = compose(RASTER_FAULTS, "void main() {}");
    expect(glsl.indexOf("float hash12(")).toBeLessThan(glsl.indexOf("float deadDot("));
    expect(glsl).toContain("float rowSkew(float row, float band, float seed)");
  });
});

describe("createPulse", () => {
  test("jumps on a bump, falls to nothing over its decay, and never drops on a weaker bump", () => {
    let t = 0;
    const pulse = createPulse(500, () => t);
    expect(pulse.value()).toBe(0);
    let woke = 0;
    const stop = pulse.subscribe(() => {
      woke += 1;
    });
    pulse.bump();
    expect(pulse.value()).toBe(1);
    t = 250;
    expect(pulse.value()).toBeCloseTo(0.5, 6);
    pulse.bump(0.2);
    expect(pulse.value()).toBeCloseTo(0.5, 6);
    t = 2000;
    expect(pulse.value()).toBe(0);
    expect(woke).toBe(2);
    stop();
    pulse.bump();
    expect(woke).toBe(2);
  });
});
