// @feature weather
import { compose, DOMAIN_WARP, FBM, IGN, OKLAB, UV, uniformDecls, VIGNETTE } from "watchpot/shader";
import { BACKDROP_UNIFORMS, type Surface } from "./surface";

/**
 * The `weather` starter: a slow, warped mist drifting up the page, gathering toward the foot, the accent breathed
 * into its thick parts and a faint ink vein where the warp folds. Heat thickens it, quickens the drift and lets more
 * of the accent through. A starting point in the right direction, to be replaced by the game's own weather.
 */
export const WEATHER: Surface = {
  fragment: compose(
    UV,
    DOMAIN_WARP,
    FBM,
    OKLAB,
    VIGNETTE,
    IGN,
    uniformDecls(BACKDROP_UNIFORMS),
    `
void main() {
  vec2 uv = screenUv();
  vec2 p = centeredUv() * 1.5;
  float heat = clamp(u_heat, 0.0, 1.0);
  float t = u_time * (0.025 + 0.05 * heat);
  // the field: the mist, pushed along its own drifting noise
  vec2 w = domainWarp(p + vec2(0.0, -t * 0.8), 0.8 + 0.9 * heat, t * 3.0);
  float mist = smoothstep(0.32, 0.9, 0.5 + 0.5 * fbm(w * 1.25, 5));
  // the shape: heavier toward the foot of the page, where condensation gathers
  float pool = smoothstep(0.85, 0.0, uv.y);
  float amount = clamp(mist * (0.45 + 0.4 * heat + 0.35 * pool), 0.0, 1.0);
  // colour: ground toward the accent, never more than a quarter of the way (text sits on this)
  vec3 colour = oklabMix(u_ground.rgb, u_accent.rgb, amount * (0.16 + 0.1 * heat));
  float vein = 1.0 - smoothstep(0.0, 0.035, abs(fbm(w * 2.6 + 7.3, 3)));
  colour = oklabMix(colour, u_ink.rgb, vein * mist * 0.05);
  // finish: the corners settle toward the ink, then dither so the gradient never bands
  colour = oklabMix(colour, u_ink.rgb, (1.0 - vignette(uv, 1.15, 0.8)) * 0.06);
  colour += (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(colour, 1.0);
}
`,
  ),
  still: [
    "radial-gradient(120% 70% at 30% 100%, color-mix(in srgb, var(--ui-accent) 16%, transparent), transparent 70%)",
    "radial-gradient(80% 60% at 85% 15%, color-mix(in srgb, var(--ui-accent) 8%, transparent), transparent 65%)",
    "var(--ui-ground)",
  ].join(", "),
  reducedTime: 40,
};
