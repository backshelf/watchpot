import { defineGauge, defineSpawns, type GaugeState, gaugeFill, type SpawnsState } from "watchpot/core";
import { compose, GLOW, ShaderCanvas, UV, uniformDecls } from "watchpot/shader";

/** The state the gauge reads: its own level and a dial the player turns, 0 to 100. */
type Stove = { warmth: GaugeState; dial: { setting: number } };

/**
 * A gauge with no trip, used as a thermostat: each second it closes half the gap to the dial's setting, so it eases
 * up or down to wherever the player set it and holds there.
 */
export const warmth = defineGauge({
  key: "warmth",
  max: 100,
  rate: (s: Stove) => (s.dial.setting - s.warmth.level) * 0.5,
});

/** Something that turns up every few minutes and lingers eight seconds. */
export const drips = defineSpawns({
  key: "drips",
  kinds: [
    {
      id: "drip",
      wait: { minMs: 60_000, maxMs: 180_000 },
      lifeMs: 8000,
      outcomes: [{ id: "splash", weight: 1 }],
    },
  ],
});

/** The shader's inputs, worked out from the game state alone: no event, no animation of the page's own. */
export const glowUniforms = (s: { warmth: GaugeState; drips: SpawnsState }) => ({
  u_heat: gaugeFill(s.warmth, warmth.def.max), // 0 to 1
  u_wobble: s.drips.kinds.drip?.live ? 1 : 0, // 1 while there is something to catch
});

/** A glow that widens with the heat and shivers while a drip is live. */
export const POT = compose(
  UV,
  GLOW,
  uniformDecls({ u_glow: "vec4", u_heat: "float", u_wobble: "float" }),
  `
void main() {
  vec2 p = centeredUv();
  p.x += u_wobble * 0.04 * sin(p.y * 30.0 + u_time * 8.0);
  float light = glowExp(length(p), 9.0 - 6.0 * u_heat);
  fragColor = vec4(u_glow.rgb * light, light);
}
`,
);

/** The pot's light. The parent selects `glowUniforms(state)` from the store and passes it down. */
export function PotGlow({ heat, wobble }: { heat: number; wobble: number }) {
  return (
    <ShaderCanvas
      fragment={POT}
      uniforms={{ u_glow: "#ff8a3d", u_heat: heat, u_wobble: wobble }}
      paused={heat < 0.01 && wobble === 0}
      still={<div />}
    />
  );
}
