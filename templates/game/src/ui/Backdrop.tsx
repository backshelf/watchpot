import { useReducedMotion } from "watchpot/kit";
import { ShaderCanvas, useShaderTokens } from "watchpot/shader";
import { cx } from "watchpot/ui";
import { useRef } from "react";
import s from "./Backdrop.module.css";

/** Props of `Backdrop`: the fragment and its still, the run's heat, and a class. */
export interface BackdropProps {
  /**
   * GLSL ES 3.00 after the engine's `SHADER_HEAD`, declaring `u_ground`, `u_ink`, `u_accent` (vec4) and `u_heat`
   * (float): the game's own, from `src/shaders/`.
   */
  fragment: string;
  /** A CSS `background` of the same idea, shown without WebGL2 or when the fragment fails. */
  still: string;
  /** 0..1: how well the run is going. */
  heat?: number;
  /** The `u_time` held under reduced motion. */
  reducedTime?: number;
  className?: string;
}

/**
 * A living backdrop fixed behind the page, on `ShaderCanvas`: its palette is the theme's `--ui-ground`, `--ui-ink`
 * and `--ui-accent` (read by `useShaderTokens`, so a scheme change recolours it), it holds one frame under reduced
 * motion, it draws only while the page shows, and without WebGL2 it is the CSS still. A fragment that fails says why
 * in the console, at its own line numbers.
 */
export function Backdrop({ fragment, still, heat = 0, reducedTime = 12, className }: BackdropProps) {
  const scope = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const palette = useShaderTokens(scope, ["--ui-ground", "--ui-ink", "--ui-accent"]);
  const fallback = <div className={s.still} style={{ background: still }} />;
  return (
    <div ref={scope} className={cx(s.backdrop, className)} aria-hidden="true">
      {palette ? (
        <ShaderCanvas
          className={s.canvas}
          fragment={fragment}
          uniforms={{
            u_ground: palette["--ui-ground"],
            u_ink: palette["--ui-ink"],
            u_accent: palette["--ui-accent"],
            u_heat: heat,
          }}
          reduced={reduced}
          reducedTime={reducedTime}
          maxPixels={1_000_000}
          still={fallback}
          onError={(log) => console.error(`backdrop shader: ${log}`)}
        />
      ) : (
        fallback
      )}
    </div>
  );
}
