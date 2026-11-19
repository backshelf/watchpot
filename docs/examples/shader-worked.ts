// The guide's shader section, page 5: one surface, in the order it is built. Three fragments, each the one before it
// with one thing added: a flat colour, then a field of contour lines, then the page's inks and the game's numbers.
//
// The finished one is the section's own surface: `WARM` is `FIELD` with the tokens and three uniforms, and the page
// draws it large and again four times over in a pool.
import { compose, DOMAIN_WARP, GLOW, IGN, OKLAB, UV, uniformDecls } from "watchpot/shader";

/** The tokens the finished surface's inks come from: the page's own. */
export const TOKENS = ["--paper", "--ink", "--live"] as const;

/** The numbers the game tells the finished surface: how warm the run is, and how deep into it. */
export const UNIFORMS = {
  u_heat: 0.55,
  u_depth: 0.35,
} as const;

/** A palette as the surface's colour uniforms: a token is already `#rrggbbaa`, which is what a colour uniform takes. */
export function inkUniforms(palette: Record<(typeof TOKENS)[number], string>) {
  return {
    u_paper: palette["--paper"],
    u_ink: palette["--ink"],
    u_live: palette["--live"],
  };
}

/** The first step: one colour, filled edge to edge. No chunks, no uniforms, nothing to get wrong. */
export const BLANK = compose(`
void main() {
  fragColor = vec4(0.075, 0.125, 0.310, 1.0);
}
`);

/**
 * The second step: a contour map of a warped noise field. The field is sample, the level is the field in units of
 * 0.09, and `at` is the distance to the nearest line in pixels, which is what makes the line one device pixel wide.
 */
export const FIELD = compose(
  UV,
  DOMAIN_WARP,
  `
void main() {
  float h = 0.5 + 0.5 * fbm(domainWarp(centeredUv() * 3.0, 0.7, u_time * 0.12), 4);
  float level = h / 0.09;
  float at = abs(fract(level + 0.5) - 0.5) / max(length(vec2(dFdx(level), dFdy(level))), 1e-6);
  float line = 1.0 - smoothstep(0.45, 1.5, at);
  fragColor = vec4(vec3(0.075 + 0.870 * line), 1.0);
}
`,
);

/**
 * The finished surface: the same field, mixed from the page's paper to its ink as `u_heat` and `u_depth` say, its
 * contour lines in the ink, its high side and a ring on `u_pulse` in the live tone, dithered against banding.
 */
export const WARM = compose(
  UV,
  DOMAIN_WARP,
  GLOW,
  OKLAB,
  IGN,
  uniformDecls({
    u_paper: "vec4",
    u_ink: "vec4",
    u_live: "vec4",
    u_heat: "float",
    u_depth: "float",
    u_pulse: "float",
  }),
  `
void main() {
  vec2 p = centeredUv() * (2.4 + 1.8 * u_depth);
  float h = 0.5 + 0.5 * fbm(domainWarp(p, 0.4 + 0.9 * u_heat, u_time * 0.15), 4);
  float ring = glowExp(abs(length(centeredUv()) - (1.0 - u_pulse) * 0.85), 14.0) * u_pulse;
  float t = clamp(h * (0.45 + 0.55 * u_depth) + ring, 0.0, 1.0);

  float level = h / (0.05 + 0.06 * u_depth);
  float at = abs(fract(level + 0.5) - 0.5) / max(length(vec2(dFdx(level), dFdy(level))), 1e-6);
  float line = 1.0 - smoothstep(0.45, 1.5, at);

  vec3 colour = oklabMix(u_paper.rgb, u_ink.rgb, 0.12 + 0.80 * t);
  colour = mix(colour, u_live.rgb, max(line * 0.55 * step(0.5, h), ring * 0.6));
  colour += (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(colour, 1.0);
}
`,
);

/** The same idea in CSS, from the same tokens: the plate reads before the first frame and without a canvas. */
export const STILL = "linear-gradient(150deg, var(--paper) 12%, var(--ink) 100%)";
