// @feature cells
import { compose, GLOW, IGN, OKLAB, UV, uniformDecls, VORONOI } from "watchpot/shader";
import { BACKDROP_UNIFORMS, type Surface } from "./surface";

/**
 * The `cells` starter: a crazed glaze. Large cells drift slowly, each its own faint shade; their seams are lit in the
 * accent, a slow pulse travelling from cell to cell, and a finer craze opens inside them as the heat rises. To be
 * replaced by the game's own material.
 */
export const CELLS: Surface = {
  fragment: compose(
    UV,
    VORONOI,
    GLOW,
    OKLAB,
    IGN,
    uniformDecls(BACKDROP_UNIFORMS),
    `
void main() {
  float heat = clamp(u_heat, 0.0, 1.0);
  vec2 p = centeredUv();
  float t = u_time * 0.025;
  // the field: big cells, and a finer craze inside them
  float scale = mix(3.5, 6.0, heat);
  vec3 v = voronoi(p * scale + vec2(t, t * 0.4));
  vec3 f = voronoi(p * scale * 3.2 - vec2(t * 0.6, 0.0));
  // the shapes: a seam where the nearest two points tie
  float edge = v.y - v.x;
  float seam = 1.0 - smoothstep(0.0, 0.05, edge);
  float fine = (1.0 - smoothstep(0.0, 0.035, f.y - f.x)) * smoothstep(0.25, 1.0, heat);
  // colour: each cell a hair darker or lighter, the seams lit, a pulse moving between cells
  float shade = (v.z - 0.5) * 0.08;
  vec3 colour = oklabMix(u_ground.rgb, u_ink.rgb, clamp(0.03 + shade, 0.0, 0.12));
  float pulse = 0.5 + 0.5 * sin(v.z * 6.2831 + u_time * 0.35);
  colour = oklabMix(colour, u_accent.rgb, clamp(seam * (0.22 + 0.18 * pulse) + fine * 0.1, 0.0, 0.5));
  // light: a halo off the seams, stronger with heat
  colour = oklabMix(colour, u_accent.rgb, glowExp(edge, 24.0) * (0.05 + 0.06 * heat));
  colour += (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(colour, 1.0);
}
`,
  ),
  still: [
    "radial-gradient(circle at 22% 30%, transparent 0 17%, color-mix(in srgb, var(--ui-accent) 24%, transparent) 17.4% 17.9%, transparent 18.4%)",
    "radial-gradient(circle at 70% 62%, transparent 0 24%, color-mix(in srgb, var(--ui-accent) 20%, transparent) 24.4% 24.9%, transparent 25.4%)",
    "radial-gradient(circle at 88% 12%, transparent 0 13%, color-mix(in srgb, var(--ui-accent) 18%, transparent) 13.4% 13.9%, transparent 14.4%)",
    "radial-gradient(circle at 35% 92%, transparent 0 20%, color-mix(in srgb, var(--ui-accent) 18%, transparent) 20.4% 20.9%, transparent 21.4%)",
    "var(--ui-ground)",
  ].join(", "),
  reducedTime: 20,
};
