// The report page's panel: the fit's report as the script prints it, the longest wait it leaves, and a pacing
// contract judged on the same run. Beside it, the desk's own numbers.
import type * as Oven from "../../../../../docs/examples/sim-oven";
import { Press, Shown, ShownRow, useRun } from "./live";

type Report = ReturnType<typeof Oven.readReport>;

export function ReportPanel() {
  const { result, again } = useRun<typeof Oven, Report>((one) => one.readReport());
  return (
    <>
      <ShownRow>
        <Shown label="Longest wait" value={result ? `${Math.round(result.wait.ms / 60_000)} min` : "—"} />
        <Shown
          label="In the contract"
          value={result ? `${result.verdicts.filter((v) => v.ok).length} of ${result.verdicts.length}` : "—"}
        />
      </ShownRow>
      <Press onPress={again}>{result ? "Fit and report again" : "Fit and read the report"}</Press>
      {result ? (
        <>
          <pre className="savetext__body num">{result.report}</pre>
          <p className="caption">
            The longest wait is between {Math.floor(result.wait.from / 60_000)}:
            {String(Math.floor(result.wait.from / 1000) % 60).padStart(2, "0")} and{" "}
            {Math.floor(result.wait.to / 60_000)}:
            {String(Math.floor(result.wait.to / 1000) % 60).padStart(2, "0")}: those two rows of the table
            above.
          </p>
          <ul className="buyrows">
            {result.verdicts.map((verdict) => (
              <li key={verdict.name} className="buyrows__row">
                <span className="buyrows__name">{verdict.name}</span>
                <span className="num">{verdict.ok ? "in" : "OUT"}</span>
                <span className="num buyrows__line">
                  {verdict.value.toFixed(2)}, target {verdict.target}
                </span>
              </li>
            ))}
          </ul>
          <dl className="passes__list">
            <div className="passes__row">
              <dt>The desk's currency</dt>
              <dd className="num">{result.desk.currency}</dd>
            </div>
            <div className="passes__row">
              <dt>A run ends at</dt>
              <dd className="num">{Math.round(result.desk.hours * 60)} played minutes</dd>
            </div>
            <div className="passes__row">
              <dt>Seeds</dt>
              <dd className="num">
                {result.desk.seeds.tuning} tuning, {result.desk.seeds.full} full
              </dd>
            </div>
            <div className="passes__row">
              <dt>Knobs</dt>
              <dd className="num">{result.desk.knobs.join(", ") || "none"}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="caption">
          The fit's report, the longest wait between two gates, and a contract judged on the same run: none of
          it printed yet.
        </p>
      )}
    </>
  );
}
