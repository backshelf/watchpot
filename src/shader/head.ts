// What every fragment starts with, and the one vertex shader: a single triangle over the whole canvas.

/**
 * The lines put before every fragment a game hands `ShaderCanvas` or `ShaderTile`: GLSL ES 3.00, high precision, the
 * standard uniforms (`u_time` seconds, `u_resolution` px, `u_pixelRatio`, `u_pointer` 0..1 from the bottom-left)
 * and the output `fragColor`. A game's fragment declares its own uniforms and `void main()`.
 */
export const SHADER_HEAD = `#version 300 es
precision highp float;
precision highp int;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform vec2 u_pointer;
out vec4 fragColor;
`;

/** How many lines `SHADER_HEAD` takes: a driver's line N is the game's line N minus this. */
export const HEAD_LINES = SHADER_HEAD.split("\n").length - 1;

/** The vertex shader: three vertices from `gl_VertexID`, no buffer, one triangle covering clip space. */
export const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * The line `compose` puts between the chunks and the game's own code, so a log can count from there.
 * @internal
 */
export const MAIN_MARK = "// ---- main";

/**
 * A driver's compile log with its line numbers moved from the full source to the game's fragment
 * (`ERROR: 0:12:` becomes `ERROR: 0:4:`); a line inside the head reads `head:N`. Given the `fragment` and it came
 * from `compose`, a line past the chunks reads `main:N`, counted from the first line of the code given to `compose`
 * after them. Pure.
 */
export function fixLog(log: string, headLines = HEAD_LINES, fragment?: string): string {
  // The fragment line the mark is on (1-based); 0 for none.
  const mark = (fragment?.split("\n").indexOf(MAIN_MARK) ?? -1) + 1;
  return log.replace(/\b(\d+):(\d+):/g, (_whole, file: string, line: string) => {
    const n = Number(line) - headLines;
    if (n <= 0) return `head:${line}:`;
    return mark > 0 && n > mark ? `main:${n - mark}:` : `${file}:${n}:`;
  });
}
