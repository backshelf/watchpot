// One shader surface, written for a fiction rather than lifted from a library: a kiln's glaze (the `cells` direction).
// It shows the pieces `shaders.md` asks of every surface: the fragment composed from the engine's chunks and colours
// read from the game's tokens, a `still`, a held frame under reduced motion, an error log, a pixel budget, and the
// numbers that drive it (`u_heat` from the game's rate, `u_pulse` from an event, fed without a React render).
//
// Type-checked with the engine. GLSL is a string here: only the browser compiles it, so a surface counts once it has
// drawn there with a clean console.
import { useRef } from "react";
import { useReducedMotion } from "watchpot/kit";
import {
  compose,
  createPulse,
  GLOW,
  IGN,
  OKLAB,
  type Pulse,
  ShaderCanvas,
  type ShaderHandle,
  UV,
  uniformDecls,
  usePulseUniform,
  useShaderTokens,
  VORONOI,
} from "watchpot/shader";

/** Glaze crazing in a kiln: cells that crack finer as the heat rises, their seams glowing, a ring on every firing. */
export const GLAZE = compose(
  UV,
  VORONOI,
  GLOW,
  OKLAB,
  IGN,
  uniformDecls({ u_ground: "vec4", u_ink: "vec4", u_accent: "vec4", u_heat: "float", u_pulse: "float" }),
  `
void main() {
  float heat = clamp(u_heat, 0.0, 1.0);
  vec2 p = centeredUv();
  vec3 v = voronoi(p * mix(3.5, 7.0, heat) + vec2(u_time * 0.02, 0.0));
  float edge = v.y - v.x;
  float seam = 1.0 - smoothstep(0.0, 0.05, edge);
  vec3 colour = oklabMix(u_ground.rgb, u_ink.rgb, 0.04 + (v.z - 0.5) * 0.06);
  colour = oklabMix(colour, u_accent.rgb, seam * (0.2 + 0.5 * heat) + glowExp(edge, 24.0) * 0.08 * (1.0 + u_pulse));
  colour += (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(colour, 1.0);
}`,
);

/** The same idea as CSS: shown without WebGL2, or when the fragment fails to build. */
export const GLAZE_STILL =
  "radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--ui-accent) 18%, transparent), transparent 55%), var(--ui-ground)";

/** Heat as a 0..1 number from the rate: log-scaled against where the late game runs. */
export const heatOf = (perSecond: number, lateRate = 1e12): number =>
  Math.min(1, Math.log10(perSecond + 1) / Math.log10(lateRate));

/** One pulse for the page: `bump()` on a firing, and every canvas fed from it rings. Half a second to fall back. */
export const firing: Pulse = createPulse(500, () => performance.now());

/** The backdrop: fixed behind the page, a pixel budget, held still under reduced motion, never hex in GLSL. */
export function Backdrop({ heat }: { heat: number }) {
  const scope = useRef<HTMLDivElement>(null);
  const canvas = useRef<ShaderHandle>(null);
  const reduced = useReducedMotion();
  const palette = useShaderTokens(scope, ["--ui-ground", "--ui-ink", "--ui-accent"]);
  usePulseUniform(canvas, firing);
  const still = <div style={{ position: "absolute", inset: 0, background: GLAZE_STILL }} />;
  return (
    <div ref={scope} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1 }}>
      {palette ? (
        <ShaderCanvas
          ref={canvas}
          fragment={GLAZE}
          uniforms={{
            u_ground: palette["--ui-ground"],
            u_ink: palette["--ui-ink"],
            u_accent: palette["--ui-accent"],
            u_heat: heat,
          }}
          reduced={reduced}
          reducedTime={12}
          maxPixels={1_000_000}
          still={still}
          onError={(log) => console.error(`backdrop shader: ${log}`)}
        />
      ) : (
        still
      )}
    </div>
  );
}
