// The fit page's panel: the plan priced in one pass, then the same table replayed between the fit's snapshots, which
// must arrive at each exactly.
import { proveFit } from "watchpot/sim";
import type * as Oven from "../../../../../docs/examples/sim-oven";
import { useExample } from "../../kit";
import { GateRows, minute, Press, Shown, ShownRow, useRun } from "./live";

type Fit = ReturnType<typeof Oven.fitPlan>;
type Proof = ReturnType<typeof proveFit>;
type Stage = { fit: Fit; proof: Proof | null };

export function FitPanel() {
  const example = useExample<typeof Oven>();
  const { result, again, set } = useRun<typeof Oven, Stage>((one) => ({
    fit: one.fitPlan({ snapshots: true }),
    proof: null,
  }));
  const fit = result?.fit;
  const proof = result?.proof;
  const prove = () => {
    if (!fit) return;
    const answer = proveFit({ marks: fit.snapshots, replay: (from) => example.ovenRun(from).run });
    set((prior) => ({ ...prior, proof: answer }));
  };
  const opened = fit?.gates.filter((gate) => gate.openedMs !== undefined).length ?? 0;
  return (
    <>
      <ShownRow>
        <Shown label="The fit finished at" value={fit ? minute(fit.playedMs) : "—"} />
        <Shown label="Gates opened" value={fit ? `${opened} of ${fit.gates.length}` : "—"} />
      </ShownRow>
      <Press
        onPress={() => {
          set((prior) => ({ ...prior, proof: null }));
          again();
        }}
      >
        {fit ? "Fit the plan again" : "Fit the plan"}
      </Press>
      {fit ? (
        <GateRows gates={fit.gates} />
      ) : (
        <p className="caption">Nothing priced yet: every gate is shut.</p>
      )}
      {fit ? (
        <>
          <Press onPress={prove}>{proof ? "Prove it again" : "Prove the table"}</Press>
          {proof ? (
            <>
              <p className="caption" role="status">
                {proof.stretches} stretches replayed,{" "}
                {proof.failed.length === 0
                  ? "and the replay is the fit's run."
                  : `${proof.failed.length} parted from the fit's run.`}
              </p>
              {proof.failed.length > 0 ? (
                <pre className="savetext__body num">{proof.failed.join("\n")}</pre>
              ) : null}
            </>
          ) : (
            <p className="caption">
              Not proved yet: the table plays in the replay with every price in place.
            </p>
          )}
        </>
      ) : null}
    </>
  );
}
