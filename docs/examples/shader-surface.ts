// The guide's shader section, page 1: one surface. A fragment of GLSL and the canvas that runs it, drawn in colours
// written into the shader itself.
//
// `DRIFT` sits inside the fragment's text, so moving it builds a different string and the canvas compiles it again.
// That is the point of the page: everything in a fragment is compiled, and page 2 is the way to change a value
// without compiling anything.
import { compose, FBM, IGN, UV } from "watchpot/shader";

/** How fast the contour map drifts: in canvas widths a second, and written into the shader's text. */
export const DRIFT = 0.12;

/**
 * A contour map of a moving noise field: a line everywhere the field crosses another multiple of 0.07, pale on a deep
 * ink, with the high side of the field in the live tone. The field is `centeredUv()` times three, so its cells are
 * the same shape at any canvas; the drift is `u_time * DRIFT`, which is the only thing in it that moves.
 */
export const SURFACE = compose(
  UV,
  FBM,
  IGN,
  `
void main() {
  vec2 p = centeredUv() * 3.0 + vec2(u_time * ${DRIFT}, u_time * ${DRIFT} * 0.25);
  float h = fbm(p, 4);
  float level = h / 0.07;
  float at = abs(fract(level + 0.5) - 0.5) / max(length(vec2(dFdx(level), dFdy(level))), 1e-6);
  float line = 1.0 - smoothstep(0.45, 1.5, at);
  vec3 ink = vec3(0.075, 0.125, 0.310);
  vec3 paper = vec3(0.815, 0.882, 0.973);
  vec3 live = vec3(0.365, 0.812, 0.882);
  vec3 colour = mix(ink, paper, 0.20 + 0.70 * line);
  colour = mix(colour, live, line * step(0.42, h) * 0.85);
  colour += (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(colour, 1.0);
}
`,
);

/** The same idea in CSS: what the plate shows before the first frame, and when a canvas cannot run at all. */
export const STILL = "radial-gradient(120% 90% at 28% 18%, #2a4a8f 0%, #14265c 45%, #0d1c4a 100%)";
