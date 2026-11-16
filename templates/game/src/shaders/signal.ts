// @feature signal
import {
  CHROMATIC,
  CRT_CURVE,
  compose,
  GLOW,
  IGN,
  OKLAB,
  SCANLINES,
  UV,
  uniformDecls,
  VALUE_NOISE,
} from "watchpot/shader";
import { BACKDROP_UNIFORMS, type Surface } from "./surface";

/**
 * The `signal` starter: a tube left on. The page sits behind a gently curved screen with fine scanlines; a phosphor
 * glow rises from low on the glass, split a little at its edges, faint interference drifts through, and a soft roll
 * bar climbs past now and then. Heat widens and brightens the glow. To be replaced by the game's own instrument.
 */
export const SIGNAL: Surface = {
  fragment: compose(
    UV,
    CRT_CURVE,
    CHROMATIC,
    GLOW,
    SCANLINES,
    VALUE_NOISE,
    OKLAB,
    IGN,
    uniformDecls(BACKDROP_UNIFORMS),
    `
float phosphor(vec2 uv, float heat) {
  vec2 d = (uv - vec2(0.5, 0.22)) * vec2(1.0, 1.7);
  return glow(length(d), 0.16 + 0.12 * heat);
}

void main() {
  float heat = clamp(u_heat, 0.0, 1.0);
  vec2 uv = crtCurve(screenUv(), 0.035);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  // the field: the glow, read once per channel for a slight split
  vec2 ur;
  vec2 ug;
  vec2 ub;
  chromaticUvs(uv, vec2(0.5, 0.22), 0.012, ur, ug, ub);
  vec3 light = vec3(phosphor(ur, heat), phosphor(ug, heat), phosphor(ub, heat));
  // interference and the roll bar
  float noise = valueNoise(vec2(uv.y * 60.0, u_time * 0.7));
  float bar = fract(uv.y - u_time * 0.04);
  float roll = smoothstep(0.0, 0.04, bar) * (1.0 - smoothstep(0.04, 0.16, bar));
  float amount = (0.22 + 0.16 * heat);
  // colour: the ground lit toward the accent, per channel, kept low (text sits on this)
  vec3 lit = vec3(
    oklabMix(u_ground.rgb, u_accent.rgb, clamp(light.r * amount, 0.0, 0.45)).r,
    oklabMix(u_ground.rgb, u_accent.rgb, clamp(light.g * amount, 0.0, 0.45)).g,
    oklabMix(u_ground.rgb, u_accent.rgb, clamp(light.b * amount, 0.0, 0.45)).b
  );
  lit = oklabMix(lit, u_accent.rgb, roll * 0.04 + noise * 0.015);
  // finish: scanlines in CSS pixels, the bezel outside the curve, dither
  float lines = u_resolution.y / (3.0 * max(u_pixelRatio, 1.0));
  lit = oklabMix(lit, u_ink.rgb, (1.0 - scanlines(uv.y, lines, 1.0)) * 0.05);
  vec3 colour = mix(oklabMix(u_ground.rgb, u_ink.rgb, 0.1), lit, inside);
  colour += (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(colour, 1.0);
}
`,
  ),
  still: [
    "repeating-linear-gradient(to bottom, transparent 0 2px, color-mix(in srgb, var(--ui-ink) 5%, transparent) 2px 3px)",
    "radial-gradient(60% 45% at 50% 78%, color-mix(in srgb, var(--ui-accent) 22%, transparent), transparent 70%)",
    "var(--ui-ground)",
  ].join(", "),
  reducedTime: 7,
};
