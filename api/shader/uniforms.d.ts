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
export declare function inferKind(value: UniformValue): UniformKind;
/** Every uniform's kind: declared where given, inferred otherwise. Pure. */
export declare function kindsOf(values: Uniforms, declared?: UniformKinds): Record<string, UniformKind>;
/**
 * A colour as the vec4 a shader takes (0..1, straight alpha): `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`; null for
 * anything else. Pure.
 */
export declare function hexToVec4(hex: string): [number, number, number, number] | null;
/** The floats a value sends for its kind (a colour's four channels, a flag's 0 or 1, an array padded to length). */
export declare function toFloats(value: UniformValue, kind: UniformKind): number[];
/** How many floats a kind holds. */
export declare function sizeOf(kind: UniformKind): number;
/** The GLSL declarations for a set of uniforms (`uniform float u_x;`, `uniform float u_ys[8];`), in name order. */
export declare function uniformDecls(kinds: Readonly<Record<string, UniformKind>>): string;
/** Whether two values send the same floats: uniforms reach the GPU only when one changes by value. Pure. */
export declare function sameValue(a: UniformValue | undefined, b: UniformValue | undefined): boolean;
/** Whether two uniform records hold the same values by name. Pure. */
export declare function sameUniforms(a: Uniforms, b: Uniforms): boolean;
type Gl = WebGL2RenderingContext;
/** Sets one uniform on the program in use, by kind. A null location (the shader does not use it) is skipped. */
export declare function setUniform(gl: Gl, loc: WebGLUniformLocation | null, kind: UniformKind, value: UniformValue): void;
export {};
