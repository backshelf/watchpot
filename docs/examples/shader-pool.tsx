// The guide's shader section, page 3: a pool. Many small surfaces, one WebGL context, and a budget of how many of
// them animate at once. `Album` is the whole of it: a `ShaderPool`, one `ShaderTile` per surface, and the tokens a
// tile is washed with read once for the grid.
import { useRef } from "react";
import { compose, FBM, ShaderPool, ShaderTile, UV, uniformDecls, useShaderTokens } from "watchpot/shader";

/** The pool's budget: how many tiles animate at once. Past it the oldest hold a true frame; the newest win. */
export const MAX_LIVE = 12;

/** The tokens a tile is washed with, alternating down the grid: the page's ink and its live tone. */
export const TINTS = ["--ink", "--live"] as const;

/**
 * A tile's field: contour lines of a noise field scrolling up at `u_speed`, mixed from the tile's own tint toward the
 * paper. Every tile draws this same string, which is why the pool builds one program for all of them.
 */
export const TILE = compose(
  UV,
  FBM,
  uniformDecls({ u_tint: "vec4", u_speed: "float" }),
  `
void main() {
  float h = fbm(screenUv() * vec2(3.0, 4.0) + vec2(0.0, u_time * u_speed), 3);
  float level = h / 0.14;
  float at = abs(fract(level + 0.5) - 0.5) / max(length(vec2(dFdx(level), dFdy(level))), 1e-6);
  float line = 1.0 - smoothstep(0.45, 1.5, at);
  fragColor = vec4(mix(u_tint.rgb, vec3(1.0), 0.16 + 0.62 * line), 1.0);
}
`,
);

/** A tile's ground: what it shows before its first frame, and when the pool cannot draw it at all. */
export const STILL = "linear-gradient(160deg, var(--paper-sunk), var(--ink))";

const GRID = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "3px",
} as const;

const CELL = { display: "block", width: "100%", aspectRatio: "4 / 3" } as const;

/**
 * One grid of surfaces on one context: `count` tiles, `maxLive` of them animating (the newest). A new budget is a new
 * pool, so the key is the budget: nothing else here changes when the reader moves it.
 */
export function Album({ count, maxLive, reduced }: { count: number; maxLive: number; reduced: boolean }) {
  const scope = useRef<HTMLDivElement>(null);
  const inks = useShaderTokens(scope, TINTS);
  return (
    <div ref={scope} style={GRID} aria-hidden="true">
      <ShaderPool key={maxLive} maxLive={maxLive} reduced={reduced}>
        {Array.from({ length: count }, (_, i) => (
          <ShaderTile
            key={i}
            fragment={TILE}
            uniforms={{
              u_tint: inks?.[TINTS[i % 2] ?? "--ink"] ?? "#1c2b6eff",
              u_speed: 0.12 + (i % 5) * 0.05,
            }}
            maxPixels={40_000}
            style={{ ...CELL, background: STILL }}
            still={<div style={{ ...CELL, background: STILL }} />}
          />
        ))}
      </ShaderPool>
    </div>
  );
}
