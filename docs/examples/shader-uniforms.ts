// The guide's shader section, page 2: uniforms. The surface is told the game's numbers (heat, a pulse, how far a
// transition has run) and reads its three inks from the page's design tokens, so a scheme switch recolours it.
import { BAYER, compose, DOMAIN_WARP, GLOW, IGN, OKLAB, UV, uniformDecls } from "watchpot/shader";

/** The tokens the surface's three inks come from: the page's own, read at the element as `#rrggbbaa`. */
export const TOKENS = ["--paper", "--ink", "--live"] as const;

/** The numbers the game tells the surface: how warm the pot is, and how far a transition has run. */
export const UNIFORMS = {
  u_heat: 0.35,
  u_progress: 1.0,
} as const;

/** A palette as the surface's colour uniforms: a token is already `#rrggbbaa`, which is what a colour uniform takes. */
export function inkUniforms(palette: Record<(typeof TOKENS)[number], string>) {
  return {
    u_paper: palette["--paper"],
    u_ink: palette["--ink"],
    u_live: palette["--live"],
  };
}

/**
 * The surface: a warped noise field mixed from paper to ink, warmer and more broken up the higher `u_heat`; a ring
 * that runs out on `u_pulse`; and a dither of ink over all of it that `u_progress` opens. Nothing here is compiled
 * when any of those move.
 */
export const SURFACE = compose(
  UV,
  DOMAIN_WARP,
  GLOW,
  OKLAB,
  BAYER,
  IGN,
  uniformDecls({
    u_paper: "vec4",
    u_ink: "vec4",
    u_live: "vec4",
    u_heat: "float",
    u_pulse: "float",
    u_progress: "float",
  }),
  `
void main() {
  vec2 p = centeredUv() * 3.0;
  float field = 0.5 + 0.5 * fbm(domainWarp(p, 0.35 + 0.8 * u_heat, u_time * 0.15), 4);
  float ring = glowExp(abs(length(centeredUv()) - (1.0 - u_pulse) * 0.8), 15.0) * u_pulse;
  float t = clamp(field * (0.30 + 0.70 * u_heat) + ring, 0.0, 1.0);

  vec3 colour = oklabMix(u_paper.rgb, u_ink.rgb, t);
  colour = mix(colour, u_live.rgb, 0.45 * ring);

  float threshold = bayer8(gl_FragCoord.xy / max(1.0, u_pixelRatio));
  float covered = step(u_progress * 1.0001, threshold * 0.85 + 0.075);
  colour = mix(colour, u_ink.rgb, covered * 0.92);

  colour += (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(colour, 1.0);
}
`,
);

/** The same idea in CSS, from the same tokens: the plate reads before the first frame, and without a canvas at all. */
export const STILL = "linear-gradient(155deg, var(--paper) 0%, var(--ink) 100%)";
