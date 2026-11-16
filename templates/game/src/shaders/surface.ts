import type { UniformKind } from "watchpot/shader";

/**
 * A backdrop: its fragment (GLSL ES 3.00 after the engine's `SHADER_HEAD`), the CSS still shown without WebGL2 or
 * when the fragment fails, and the frame it holds under reduced motion.
 *
 * Every backdrop takes the same uniforms (`BACKDROP_UNIFORMS`): the palette as `--ui-ground`, `--ui-ink` and
 * `--ui-accent` (read by `useShaderTokens`, so a scheme change recolours it; never a hex in the GLSL) and `u_heat`,
 * 0..1, how well the run is going.
 */
export interface Surface {
  fragment: string;
  /** A CSS `background` of the same idea, from the `--ui-*` tokens. */
  still: string;
  /** The `u_time` it holds under reduced motion: a frame that looks good frozen. */
  reducedTime: number;
}

/** The uniforms every backdrop declares. */
export const BACKDROP_UNIFORMS = {
  u_ground: "vec4",
  u_ink: "vec4",
  u_accent: "vec4",
  u_heat: "float",
} as const satisfies Record<string, UniformKind>;
