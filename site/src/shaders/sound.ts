// The tap drawn as five ruled meter columns: `level`, `bass`, `mid`, `high`, `flux`, each 0..1 as `sound.tap.read()`
// gives them (`useAudioUniforms` writes them each frame). Line work in the ink; what is empty is hatched; the signal
// is a screen of dots in the live tone, so the cyan appears only where there is sound. Everything is analytic in device
// pixels, so a hairline stays a hairline at any density.
import { compose, uniformDecls } from "watchpot/shader";

/** The columns, in the order the uniforms are drawn; the page prints the same names under them. */
export const TAP_FIGURES = ["level", "bass", "mid", "high", "flux"] as const;

/** The gap between two columns, CSS pixels: the page's labels use the same. */
export const TAP_GAP = 12;

export const TAP = compose(
  uniformDecls({
    u_ground: "vec4",
    u_ink: "vec4",
    u_live: "vec4",
    u_level: "float",
    u_bass: "float",
    u_mid: "float",
    u_high: "float",
    u_flux: "float",
  }),
  `
float stroke(float d, float w) {
  return 1.0 - smoothstep(w - 0.5, w + 0.5, abs(d));
}

float figure(int i) {
  if (i == 0) return u_level;
  if (i == 1) return u_bass;
  if (i == 2) return u_mid;
  if (i == 3) return u_high;
  return u_flux;
}

void main() {
  float pr = u_pixelRatio;
  vec2 p = gl_FragCoord.xy;
  vec2 R = u_resolution;
  float gap = ${TAP_GAP.toFixed(1)} * pr;
  float cw = (R.x - gap * 4.0) / 5.0;
  float slot = cw + gap;
  int i = int(clamp(floor(p.x / slot), 0.0, 4.0));
  float x = p.x - float(i) * slot;
  vec3 col = u_ground.rgb;

  if (x <= cw) {
    float hw = 0.5 * pr;
    // The column's frame: the left, right and floor edges (the top is the scale's last rule).
    float dx = min(x - hw, cw - hw - x);
    float frame = max(stroke(dx, hw), stroke(p.y - hw, hw));

    // The scale: a tick every tenth (3 dB of the 30), every fifth longer and ruled faintly across the column.
    float pitch = (R.y - pr) / 10.0;
    float t = (p.y - hw) / pitch;
    float d = (fract(t + 0.5) - 0.5) * pitch;
    float k = floor(t + 0.5);
    float fifth = 1.0 - step(0.5, abs(mod(k, 5.0)));
    float tick = stroke(d, 0.5 * hw) * step(x, mix(5.0, 9.0, fifth) * pr);
    float rule = stroke(d, 0.5 * hw) * fifth * 0.3;

    float v = clamp(figure(i), 0.0, 1.0);
    float top = hw + v * (R.y - pr);
    float filled = step(p.y, top) * step(0.0005, v);

    // Empty is hatched (tone is ruling, never a grey); the signal is a screen of dots.
    float hatch = stroke(mod(x + p.y, 6.0 * pr) - 3.0 * pr, 0.35 * pr) * 0.22 * (1.0 - filled);
    float cell = 4.0 * pr;
    vec2 q = mod(vec2(x, p.y), cell) - 0.5 * cell;
    float dots = (1.0 - smoothstep(1.25 * pr - 0.5, 1.25 * pr + 0.5, length(q))) * filled;
    float needle = stroke(p.y - top, 0.75 * pr) * step(0.0005, v);

    col = mix(col, u_ink.rgb, hatch);
    col = mix(col, u_live.rgb, dots);
    col = mix(col, u_ink.rgb, max(max(frame, needle), max(tick, rule)));
  }

  fragColor = vec4(col, 1.0);
}
`,
);
