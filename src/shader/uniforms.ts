// Uniforms as a plain record: kinds inferred from values (or declared), colours as hex, set on the GPU by kind.

/** A uniform's GLSL type. `float[N]` is a float array of N. */
export type UniformKind = "float" | "int" | "bool" | "vec2" | "vec3" | "vec4" | `float[${number}]`;

/** A uniform's value: a number, a flag, a vector or float array, or a colour as `#rgb`, `#rrggbb` or `#rrggbbaa`. */
export type UniformValue = number | boolean | string | readonly number[];

/** A fragment's uniforms by name. */
export type Uniforms = Readonly<Record<string, UniformValue>>;

/** Uniform kinds by name, for the values whose kind inference would get wrong (an `int`, a 3-float array). */
export type UniformKinds = Readonly<Record<string, UniformKind>>;

/**
 * The kind a value implies: a number is a `float`, a flag a `bool`, a colour string a `vec4`, an array of 2 to 4 a
 * vector and any other length a float array. Pure.
 */
export function inferKind(value: UniformValue): UniformKind {
  if (typeof value === "number") return "float";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "string") return "vec4";
  const n = value.length;
  if (n === 2) return "vec2";
  if (n === 3) return "vec3";
  if (n === 4) return "vec4";
  return `float[${Math.max(1, n)}]`;
}

/** Every uniform's kind: declared where given, inferred otherwise. Pure. */
export function kindsOf(values: Uniforms, declared: UniformKinds = {}): Record<string, UniformKind> {
  const out: Record<string, UniformKind> = {};
  for (const [name, value] of Object.entries(values)) out[name] = declared[name] ?? inferKind(value);
  return out;
}

/**
 * A colour as the vec4 a shader takes (0..1, straight alpha): `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`; null for
 * anything else. Pure.
 */
export function hexToVec4(hex: string): [number, number, number, number] | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1] as string;
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  if (h.length === 6) h += "ff";
  const at = (i: number) => Number.parseInt(h.slice(i, i + 2), 16) / 255;
  return [at(0), at(2), at(4), at(6)];
}

/** The floats a value sends for its kind (a colour's four channels, a flag's 0 or 1, an array padded to length). */
export function toFloats(value: UniformValue, kind: UniformKind): number[] {
  const raw =
    typeof value === "number"
      ? [value]
      : typeof value === "boolean"
        ? [value ? 1 : 0]
        : typeof value === "string"
          ? (hexToVec4(value) ?? [0, 0, 0, 0])
          : [...value];
  const size = sizeOf(kind);
  const out = raw.slice(0, size);
  while (out.length < size) out.push(0);
  return out;
}

/** How many floats a kind holds. */
export function sizeOf(kind: UniformKind): number {
  switch (kind) {
    case "float":
    case "int":
    case "bool":
      return 1;
    case "vec2":
      return 2;
    case "vec3":
      return 3;
    case "vec4":
      return 4;
    default:
      return Number(/\[(\d+)\]/.exec(kind)?.[1] ?? 1);
  }
}

/** The GLSL declarations for a set of uniforms (`uniform float u_x;`, `uniform float u_ys[8];`), in name order. */
export function uniformDecls(kinds: Readonly<Record<string, UniformKind>>): string {
  return Object.keys(kinds)
    .sort()
    .map((name) => {
      const kind = kinds[name] as UniformKind;
      const array = /^float\[(\d+)\]$/.exec(kind);
      return array ? `uniform float ${name}[${array[1]}];` : `uniform ${kind} ${name};`;
    })
    .join("\n");
}

/** Whether two values send the same floats: uniforms reach the GPU only when one changes by value. Pure. */
export function sameValue(a: UniformValue | undefined, b: UniformValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

/** Whether two uniform records hold the same values by name. Pure. */
export function sameUniforms(a: Uniforms, b: Uniforms): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => sameValue(a[k], b[k]));
}

type Gl = WebGL2RenderingContext;

/** Sets one uniform on the program in use, by kind. A null location (the shader does not use it) is skipped. */
export function setUniform(gl: Gl, loc: WebGLUniformLocation | null, kind: UniformKind, value: UniformValue) {
  if (loc === null) return;
  const f = toFloats(value, kind);
  switch (kind) {
    case "float":
      gl.uniform1f(loc, f[0] ?? 0);
      return;
    case "int":
    case "bool":
      gl.uniform1i(loc, Math.round(f[0] ?? 0));
      return;
    case "vec2":
      gl.uniform2f(loc, f[0] ?? 0, f[1] ?? 0);
      return;
    case "vec3":
      gl.uniform3f(loc, f[0] ?? 0, f[1] ?? 0, f[2] ?? 0);
      return;
    case "vec4":
      gl.uniform4f(loc, f[0] ?? 0, f[1] ?? 0, f[2] ?? 0, f[3] ?? 0);
      return;
    default:
      gl.uniform1fv(loc, new Float32Array(f));
  }
}
