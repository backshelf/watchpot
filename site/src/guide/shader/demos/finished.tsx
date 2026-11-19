// The finished thing at the end of page 5: the last fragment in the page's inks, with the pulse from page 2 pushed
// through the handle, and the same fragment four more times at four depths on one pool — the whole section in one
// plate and a strip.
import { type CSSProperties, useRef, useState } from "react";
import {
  createPulse,
  type ShaderHandle,
  ShaderPool,
  ShaderTile,
  usePulseUniform,
  useShaderTokens,
} from "watchpot/shader";
import { useMediaQuery } from "watchpot/ui";
import type * as Example from "../../../../../docs/examples/shader-worked";
import { useExample } from "../../kit";
import { Surface } from "./surface";

const STRIP: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "3px",
};

const CELL: CSSProperties = { display: "block", width: "100%", aspectRatio: "16 / 9" };

/** How deep into the run each small surface is: four steps from the start of a run to its end. */
const DEPTHS = [0.1, 0.35, 0.6, 0.9];

export function Finished() {
  const { WARM, STILL, TOKENS, UNIFORMS, inkUniforms } = useExample<typeof Example>();
  const scope = useRef<HTMLDivElement>(null);
  const canvas = useRef<ShaderHandle>(null);
  const inks = useShaderTokens(scope, TOKENS);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [pulse] = useState(() => createPulse(1400, () => performance.now()));
  usePulseUniform(canvas, pulse);
  const uniforms = inks ? { ...inkUniforms(inks), u_heat: UNIFORMS.u_heat, u_depth: UNIFORMS.u_depth } : null;
  return (
    <div ref={scope} style={{ display: "grid", gap: "0.75rem" }}>
      <Surface fragment={WARM} uniforms={uniforms} still={STILL} handleRef={canvas} reduced={reduced} />
      <div className="panel__row">
        <button type="button" className="button" onClick={() => pulse.bump()}>
          A big moment
        </button>
        <span className="shortcut__note">The pulse from page 2, on the finished surface.</span>
      </div>
      {uniforms ? (
        <ShaderPool maxLive={DEPTHS.length} reduced={reduced}>
          <div style={STRIP} aria-hidden="true">
            {DEPTHS.map((depth) => (
              <ShaderTile
                key={depth}
                fragment={WARM}
                uniforms={{ ...uniforms, u_depth: depth, u_pulse: 0 }}
                maxPixels={40_000}
                style={{ ...CELL, background: STILL }}
                still={<div style={{ ...CELL, background: STILL }} />}
              />
            ))}
          </div>
        </ShaderPool>
      ) : (
        <div style={STRIP} aria-hidden="true">
          {DEPTHS.map((depth) => (
            <div key={depth} style={{ ...CELL, background: STILL }} />
          ))}
        </div>
      )}
    </div>
  );
}
