// @feature print
import { BAYER, compose, FBM, HALFTONE, HASH, OKLAB, UV, uniformDecls } from "watchpot/shader";
import { BACKDROP_UNIFORMS, type Surface } from "./surface";

/**
 * The `print` starter: a cheap two-ink job on paper. A broad tonal sweep is printed twice: once as an ordered dither
 * in a thin ink tint, once as a coarse accent dot screen laid a hair out of register, with the paper's tooth over
 * both. Heat swells the dots and darkens the tint, as if the presses were running hotter. To be replaced by the
 * game's own print.
 */
export const PRINT: Surface = {
  fragment: compose(
    UV,
    FBM,
    BAYER,
    HALFTONE,
    HASH,
    OKLAB,
    uniformDecls(BACKDROP_UNIFORMS),
    `
void main() {
  // in CSS pixels, so the screen stays coarse on a sharp display
  vec2 px = gl_FragCoord.xy / max(u_pixelRatio, 1.0);
  vec2 uv = screenUv();
  float heat = clamp(u_heat, 0.0, 1.0);
  float t = u_time * 0.03;
  // the field: a slow blot over a sweep that is heavier toward the foot
  float blot = 0.5 + 0.5 * fbm(centeredUv() * 1.1 + vec2(t, -t * 0.6), 4);
  float tone = clamp(mix(blot, 1.0 - uv.y, 0.35), 0.0, 1.0);
  // the shapes: a dither for the flat tint, a rotated dot screen for the accent, slightly misregistered
  float tint = step(bayer8(floor(px / 2.0)), tone * (0.22 + 0.2 * heat));
  float dots = halftone(px + vec2(1.5, -1.0), 10.0, tone * (0.14 + 0.36 * heat), 0.7854);
  // colour: two inks over the ground, never solid (text sits on this)
  vec3 colour = u_ground.rgb;
  colour = mix(colour, oklabMix(u_ground.rgb, u_ink.rgb, 0.08), tint);
  colour = mix(colour, oklabMix(u_ground.rgb, u_accent.rgb, 0.3), dots * 0.7);
  // finish: the paper's tooth, fixed to the page so it does not crawl
  colour += (hash12(floor(px)) - 0.5) * 0.03;
  fragColor = vec4(colour, 1.0);
}
`,
  ),
  still: [
    "radial-gradient(circle at 5px 5px, color-mix(in srgb, var(--ui-accent) 32%, transparent) 1.4px, transparent 1.9px) 0 0 / 10px 10px",
    "linear-gradient(to top, color-mix(in srgb, var(--ui-ink) 6%, transparent), transparent 60%)",
    "var(--ui-ground)",
  ].join(", "),
  reducedTime: 12,
};
