// Page 4's panel: the example's `Canvas` under three of its props, and whatever the driver said when it failed. The
// plate is the page's: the canvas fills it, or the still takes its place.
import { type CSSProperties, useState } from "react";
import type * as Example from "../../../../../docs/examples/shader-limits";
import { PanelChoice, useExample } from "../../kit";
import { Toggle } from "./panel-bits";

const PLATE: CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
  overflow: "hidden",
  border: "1px solid var(--ink)",
  borderRadius: 2,
};

export function LimitsDemo() {
  const { Canvas, STILL } = useExample<typeof Example>();
  const [reduced, setReduced] = useState(false);
  const [fragment, setFragment] = useState<"good" | "broken">("good");
  const [cap, setCap] = useState<"million" | "small">("million");
  const [log, setLog] = useState<string | null>(null);
  const pixels = cap === "million" ? 1_000_000 : 120_000;
  return (
    <>
      <div style={{ ...PLATE, background: STILL }} aria-hidden="true">
        <Canvas reduced={reduced} cap={pixels} broken={fragment === "broken"} onError={setLog} />
      </div>
      <PanelChoice
        title="The fragment"
        value={fragment}
        options={[
          { value: "good", label: "The one that compiles" },
          { value: "broken", label: "One line broken" },
        ]}
        onChange={setFragment}
      />
      <Toggle label="Reduced motion" on={reduced} onText="Holding" offText="Drawing" onChange={setReduced} />
      <PanelChoice
        title="The cap"
        value={cap}
        options={[
          { value: "million", label: "A million pixels" },
          { value: "small", label: "120,000" },
        ]}
        onChange={setCap}
      />
      <pre className="savetext__body num" aria-live="polite">
        {log ?? "No error: the canvas built its program and is drawing."}
      </pre>
    </>
  );
}
