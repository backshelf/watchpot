/**
 * The lines put before every fragment a game hands `ShaderCanvas` or `ShaderTile`: GLSL ES 3.00, high precision, the
 * standard uniforms (`u_time` seconds, `u_resolution` px, `u_pixelRatio`, `u_pointer` 0..1 from the bottom-left)
 * and the output `fragColor`. A game's fragment declares its own uniforms and `void main()`.
 */
export declare const SHADER_HEAD = "#version 300 es\nprecision highp float;\nprecision highp int;\nuniform float u_time;\nuniform vec2 u_resolution;\nuniform float u_pixelRatio;\nuniform vec2 u_pointer;\nout vec4 fragColor;\n";
/** How many lines `SHADER_HEAD` takes: a driver's line N is the game's line N minus this. */
export declare const HEAD_LINES: number;
/** The vertex shader: three vertices from `gl_VertexID`, no buffer, one triangle covering clip space. */
export declare const VERTEX_SHADER = "#version 300 es\nvoid main() {\n  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));\n  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);\n}\n";
/**
 * A driver's compile log with its line numbers moved from the full source to the game's fragment
 * (`ERROR: 0:12:` becomes `ERROR: 0:4:`); a line inside the head reads `head:N`. Pure.
 */
export declare function fixLog(log: string, headLines?: number): string;
