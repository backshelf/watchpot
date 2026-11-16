import { type ReactNode, useRef } from "react";
import {
  BAYER,
  compose,
  DOMAIN_WARP,
  GLOW,
  IGN,
  OKLAB,
  PALETTE,
  SDF,
  SDF_OPS,
  ShaderCanvas,
  ShaderPool,
  ShaderTile,
  UV,
  uniformDecls,
  useShaderTokens,
  VALUE_NOISE,
  VIGNETTE,
  VORONOI,
} from "watchpot/shader";

/**
 * A living backdrop: a warped noise field mixed between two of the game's colour tokens, hotter as the game heats up,
 * with a ring that pulses out on a big moment. Dithered against banding, darkened at the edges.
 */
export const BACKDROP = compose(
  UV,
  DOMAIN_WARP,
  GLOW,
  OKLAB,
  VIGNETTE,
  IGN,
  uniformDecls({ u_ground: "vec4", u_glow: "vec4", u_heat: "float", u_pulse: "float" }),
  `
void main() {
  vec2 uv = screenUv();
  vec2 p = centeredUv() * 3.0;
  float field = 0.5 + 0.5 * fbm(domainWarp(p, 0.6 + 0.8 * u_heat, u_time * 0.2), 5);
  float ring = glowExp(abs(length(centeredUv()) - u_pulse * 0.8), 18.0) * u_pulse;
  float t = clamp(field * (0.4 + 0.6 * u_heat) + ring, 0.0, 1.0);
  vec3 colour = oklabMix(u_ground.rgb, u_glow.rgb, t);
  colour *= mix(0.75, 1.0, vignette(uv, 0.95, 0.6));
  colour += (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(colour, 1.0);
}
`,
);

/**
 * A card foil: rainbow bands that turn with `u_angle` (the card's tilt), laid over the card's tint, with sparkles on
 * Voronoi cells. Alpha is premultiplied: the colour is multiplied by it.
 */
export const FOIL = compose(
  UV,
  PALETTE,
  VORONOI,
  uniformDecls({ u_tint: "vec4", u_angle: "float" }),
  `
void main() {
  vec2 uv = screenUv();
  float band = dot(uv - 0.5, vec2(cos(u_angle), sin(u_angle))) * 3.0 + u_time * 0.15;
  vec3 foil = cosinePalette(band, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
  vec3 cells = voronoi(uv * 12.0);
  float sparkle = smoothstep(0.08, 0.0, cells.x) * step(0.85, fract(cells.z + u_time * 0.5));
  vec3 colour = mix(u_tint.rgb, foil, 0.35) + sparkle;
  float alpha = u_tint.a;
  fragColor = vec4(colour * alpha, alpha);
}
`,
);

/**
 * A button's glow: a rounded box the size of the canvas, a soft light around it and a sweep across it, both only
 * while `u_ready` (the player can afford the buy).
 */
export const BUTTON_GLOW = compose(
  UV,
  SDF,
  SDF_OPS,
  GLOW,
  uniformDecls({ u_glow: "vec4", u_ready: "float" }),
  `
void main() {
  vec2 centre = u_resolution * 0.5;
  vec2 halfSize = centre - 6.0 * u_pixelRatio;
  float d = sdRoundBox(gl_FragCoord.xy - centre, halfSize, 10.0 * u_pixelRatio);
  float inside = sdfCoverage(d);
  float halo = glow(d, 4.0 * u_pixelRatio) * (1.0 - inside);
  float sweep = smoothstep(0.1, 0.0, abs(fract(u_time * 0.4) * 1.6 - 0.3 - screenUv().x)) * inside;
  float alpha = clamp((halo + 0.25 * sweep) * u_ready, 0.0, 1.0);
  fragColor = vec4(u_glow.rgb * alpha, alpha);
}
`,
);

/**
 * A screen transition: an ordered dissolve of the cover colour as `u_progress` runs 0 to 1, broken up by value noise.
 * The game drives `time` (and `u_progress`) itself, so it draws only when they change.
 */
export const DISSOLVE = compose(
  UV,
  BAYER,
  VALUE_NOISE,
  uniformDecls({ u_cover: "vec4", u_progress: "float" }),
  `
void main() {
  float threshold = bayer8(gl_FragCoord.xy / max(1.0, u_pixelRatio));
  float wobble = valueNoise(screenUv() * 6.0) * 0.3;
  float on = step(threshold * 0.7 + wobble, u_progress * 1.0001);
  fragColor = vec4(u_cover.rgb, 1.0) * on;
}
`,
);

/** The backdrop behind a screen: the palette is the game's tokens, so a theme switch recolours it. */
export function Backdrop({ heat, pulse, reduced }: { heat: number; pulse: number; reduced: boolean }) {
  const scope = useRef<HTMLDivElement>(null);
  const palette = useShaderTokens(scope, ["--ground", "--glow"]);
  return (
    <div ref={scope} className="backdrop">
      {palette ? (
        <ShaderCanvas
          className="backdrop-canvas"
          fragment={BACKDROP}
          uniforms={{
            u_ground: palette["--ground"],
            u_glow: palette["--glow"],
            u_heat: heat,
            u_pulse: pulse,
          }}
          reduced={reduced}
          reducedTime={6}
          maxPixels={1_000_000}
          still={<div className="backdrop-still" />}
        />
      ) : (
        <div className="backdrop-still" />
      )}
    </div>
  );
}

/** A grid of cards, each with a foil, on one shared context: only twelve animate at once. */
export function Album({
  cards,
  reduced,
}: {
  cards: { id: string; tilt: number; art: ReactNode }[];
  reduced: boolean;
}) {
  return (
    <ShaderPool maxLive={12} reduced={reduced}>
      <ul className="album">
        {cards.map((card) => (
          <li key={card.id} className="card">
            {card.art}
            <ShaderTile
              className="foil"
              fragment={FOIL}
              uniforms={{ u_tint: "#ffffff66", u_angle: card.tilt }}
              maxPixels={120_000}
              still={<div className="foil-still" />}
            />
          </li>
        ))}
      </ul>
    </ShaderPool>
  );
}

/** A buy button whose glow lights while the buy is affordable; it sits in a pool with the other buttons. */
export function GlowingBuy({ ready, children }: { ready: boolean; children: ReactNode }) {
  return (
    <span className="glow-wrap">
      <ShaderTile
        className="glow"
        fragment={BUTTON_GLOW}
        uniforms={{ u_glow: "#ffd76a", u_ready: ready ? 1 : 0 }}
        paused={!ready}
      />
      {children}
    </span>
  );
}

/** A transition over the page, driven by the game's own clock. */
export function Dissolve({ progress }: { progress: number }) {
  return (
    <ShaderCanvas
      className="transition"
      fragment={DISSOLVE}
      time={progress}
      uniforms={{ u_cover: "#101018", u_progress: progress }}
      still={<div className="transition-still" style={{ opacity: progress }} />}
    />
  );
}
