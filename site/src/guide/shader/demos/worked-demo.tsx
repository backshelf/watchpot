// Page 5's panel: the surface at the stage the reader picks. Every stage is a fragment from the example, drawn on
// the same plate in the page's inks, so the plate is the only thing that does not change.
import { useRef, useState } from "react";
import { useShaderTokens } from "watchpot/shader";
import type * as Example from "../../../../../docs/examples/shader-worked";
import { PanelChoice, useExample } from "../../kit";
import { Surface } from "./surface";

export function Worked() {
  const { BLANK, FIELD, WARM, STILL, TOKENS, UNIFORMS, inkUniforms } = useExample<typeof Example>();
  const scope = useRef<HTMLDivElement>(null);
  const inks = useShaderTokens(scope, TOKENS);
  const [stage, setStage] = useState<"blank" | "field" | "warm">("blank");
  const fragment = stage === "blank" ? BLANK : stage === "field" ? FIELD : WARM;
  const uniforms = inks ? { ...inkUniforms(inks), ...UNIFORMS } : null;
  return (
    <div ref={scope} style={{ display: "grid", gap: "0.9rem" }}>
      <PanelChoice
        title="The surface, so far"
        value={stage}
        options={[
          { value: "blank", label: "One colour" },
          { value: "field", label: "A field" },
          { value: "warm", label: "Finished" },
        ]}
        onChange={setStage}
      />
      <Surface fragment={fragment} uniforms={uniforms} still={STILL} />
    </div>
  );
}
