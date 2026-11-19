// The plan page's panel: the plan as the code writes it, and, on a press, the same plan fitted: what each gate cost
// and the minute it actually opened.
import type * as Oven from "../../../../../docs/examples/sim-oven";
import { useExample } from "../../kit";
import { GateRows, minute, Press, Shown, ShownRow, useRun } from "./live";

type Fit = ReturnType<typeof Oven.fitPlan>;

export function PlanPanel() {
  // The example as it stands, for the plan's minutes: a control moved rebuilds it, so the still follows the code.
  const example = useExample<typeof Oven>();
  const { result, again } = useRun<typeof Oven, Fit>((one) => one.fitPlan());
  const still = example.FITTINGS.map((key) => ({ key, atMs: example.PLAN[key] * 60_000 }));
  return (
    <>
      <ShownRow>
        <Shown label="The plan ends at" value={result ? minute(result.playedMs) : "—"} />
        <Shown label="Gates" value={example.FITTINGS.length} />
      </ShownRow>
      <Press onPress={again}>{result ? "Price the plan again" : "Price the plan"}</Press>
      <GateRows gates={result?.gates ?? still} />
      <p className="caption">
        {result
          ? "Each gate is priced at the minute the plan gives it, from what the pilot held then."
          : "Not priced yet: these are the plan's minutes, and every gate is shut until a fit prices it."}
      </p>
    </>
  );
}
