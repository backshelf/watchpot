// Page 1's panel: the one surface, with its drift control in the column and a switch that holds the frame. Nothing
// here knows what the fragment draws: the example hands over a string and a still.
import { useState } from "react";
import type * as Example from "../../../../../docs/examples/shader-surface";
import { useExample } from "../../kit";
import { Toggle } from "./panel-bits";
import { Surface } from "./surface";

export function OneSurface() {
  const { SURFACE, STILL } = useExample<typeof Example>();
  const [held, setHeld] = useState(false);
  return (
    <>
      <Surface fragment={SURFACE} still={STILL} paused={held} />
      <Toggle label="The canvas" on={held} onText="Held" offText="Drawing" onChange={setHeld} />
    </>
  );
}
