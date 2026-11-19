// The guide's shader section, page 4: what a canvas does when it cannot run. The same surface twice (the second with
// one line the driver will refuse), the CSS still that takes the canvas's place, and the props that decide all of it.
import { useRef } from "react";
import { compose, FBM, IGN, OKLAB, ShaderCanvas, UV, uniformDecls, useShaderTokens } from "watchpot/shader";

/** The surface: a noise field mixed from paper to ink, drifting slowly. */
export const SURFACE = compose(
  UV,
  FBM,
  OKLAB,
  IGN,
  uniformDecls({ u_paper: "vec4", u_ink: "vec4" }),
  `
void main() {
  float h = 0.5 + 0.5 * fbm(screenUv() * 4.0 + vec2(u_time * 0.05, 0.0), 3);
  vec3 colour = oklabMix(u_paper.rgb, u_ink.rgb, 0.12 + 0.76 * h);
  colour += (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(colour, 1.0);
}
`,
);

/**
 * The same surface with one argument wrong: `fbm` counts its octaves with an `int`, and this passes `3.0`. The driver
 * refuses it, and `fixLog` moves the line number to the reader's own line.
 */
export const BROKEN = compose(
  UV,
  FBM,
  OKLAB,
  IGN,
  uniformDecls({ u_paper: "vec4", u_ink: "vec4" }),
  `
void main() {
  float h = 0.5 + 0.5 * fbm(screenUv() * 4.0 + vec2(u_time * 0.05, 0.0), 3.0);
  vec3 colour = oklabMix(u_paper.rgb, u_ink.rgb, 0.12 + 0.76 * h);
  fragColor = vec4(colour, 1.0);
}
`,
);

/** The same idea in CSS, from the same tokens: what the plate shows whenever the canvas does not. */
export const STILL = "linear-gradient(150deg, var(--paper) 0%, var(--ink) 100%)";

const FILL = { position: "absolute", inset: 0, width: "100%", height: "100%" } as const;

/**
 * The surface in a plate, with every prop that matters when the canvas cannot run: `still` for what takes its place,
 * `onError` for why, `reduced` for the player's wish to hold still, `maxPixels` for the budget it draws within. The
 * page's plate is around it; this is the whole of the canvas.
 */
export function Canvas({
  reduced,
  cap,
  broken,
  onError,
}: {
  reduced: boolean;
  cap: number;
  broken: boolean;
  onError: (log: string) => void;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const inks = useShaderTokens(scope, ["--paper", "--ink"]);
  return (
    // `display: contents`: the element is here to read the tokens at, and takes no room in the plate.
    <div ref={scope} style={{ display: "contents" }}>
      {inks ? (
        <ShaderCanvas
          fragment={broken ? BROKEN : SURFACE}
          uniforms={{ u_paper: inks["--paper"], u_ink: inks["--ink"] }}
          reduced={reduced}
          reducedTime={4}
          maxPixels={cap}
          still={<div style={{ ...FILL, background: STILL }} />}
          onError={onError}
          style={FILL}
        />
      ) : null}
    </div>
  );
}
