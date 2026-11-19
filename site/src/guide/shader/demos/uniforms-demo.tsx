// Page 2's panel: one surface told the game's numbers, its inks read from a design token scope the reader can swap.
// The pulse goes through the canvas's handle a frame at a time, so pressing the button renders nothing.
import { type CSSProperties, useRef, useState } from "react";
import { createPulse, type ShaderHandle, usePulseUniform, useShaderTokens } from "watchpot/shader";
import type * as Example from "../../../../../docs/examples/shader-uniforms";
import { PanelChoice, useExample } from "../../kit";
import { Surface } from "./surface";

/**
 * A game's own three inks, written on the scope: a palette swapped in for the page's. `CSSProperties` has no index
 * signature for custom properties, hence the cast.
 */
const GAME_INKS = {
  "--paper": "#f5e7e2",
  "--ink": "#5c1f33",
  "--live": "#c8557a",
} as unknown as CSSProperties;

export function ToldSurface() {
  const { SURFACE, STILL, TOKENS, UNIFORMS, inkUniforms } = useExample<typeof Example>();
  const scope = useRef<HTMLDivElement>(null);
  const canvas = useRef<ShaderHandle>(null);
  const inks = useShaderTokens(scope, TOKENS);
  const [palette, setPalette] = useState<"page" | "game">("page");
  const [pulse] = useState(() => createPulse(1300, () => performance.now()));
  usePulseUniform(canvas, pulse);
  const uniforms = inks
    ? { ...inkUniforms(inks), u_heat: UNIFORMS.u_heat, u_progress: UNIFORMS.u_progress }
    : null;
  return (
    <>
      <PanelChoice
        title="The surface's inks"
        value={palette}
        options={[
          { value: "page", label: "The page's" },
          { value: "game", label: "A game's" },
        ]}
        onChange={setPalette}
      />
      <div ref={scope} style={palette === "game" ? GAME_INKS : undefined}>
        <Surface fragment={SURFACE} uniforms={uniforms} still={STILL} handleRef={canvas} />
      </div>
      <div className="panel__row">
        <button type="button" className="button" onClick={() => pulse.bump()}>
          A big moment
        </button>
        <span className="shortcut__note">The ring falls back to nothing in 1.3 seconds.</span>
      </div>
    </>
  );
}
