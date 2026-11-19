// The cache page's panel: a fit that leaves a snapshot every played minute, and a second fit carried on from one of
// them, after the reader moves a gate in the plan.
import { useRef, useState } from "react";
import type * as Oven from "../../../../../docs/examples/sim-oven";
import { PanelChoice } from "../../kit";
import { minute, Press, Shown, ShownRow, useRun } from "./live";

type Move = Oven.PlanMove;
type Answer = ReturnType<typeof Oven.cacheStory>;
type Change = "none" | "before" | "after";

const CHANGES: readonly { value: Change; label: string }[] = [
  { value: "none", label: "Nothing" },
  { value: "before", label: "The hood, to 1:00" },
  { value: "after", label: "The jacket, to 5:00" },
];

const MOVES: Record<Change, Move> = {
  none: null,
  before: { key: "hood", minute: 1 },
  after: { key: "jacket", minute: 5 },
};

export function CachePanel() {
  const [change, setChange] = useState<Change>("none");
  const picked = useRef<Change>("none");
  const { result, ran, again } = useRun<typeof Oven, Answer>((one) =>
    one.cacheStory(MOVES[picked.current], one.AT_MIN * 60_000),
  );
  const pick = (next: Change) => {
    picked.current = next;
    setChange(next);
    if (ran) again();
  };
  return (
    <>
      <PanelChoice title="What changed after the fit" options={CHANGES} value={change} onChange={pick} />
      <ShownRow>
        <Shown label="Snapshots" value={result ? result.taken : "—"} />
        <Shown
          label="Carried on from"
          value={result?.carriedFrom == null ? "—" : minute(result.carriedFrom)}
        />
      </ShownRow>
      <Press onPress={again}>
        {result ? "Fit again and carry on" : "Fit, then carry on from the snapshot"}
      </Press>
      {result === null ? (
        <p className="caption">
          A fit that leaves a snapshot every played minute, then a second fit that starts at one of them.
        </p>
      ) : result.holds.length > 0 ? (
        <>
          <p className="caption" role="status">
            The cache is no good: the plan moved before the snapshot. Start again from nothing.
          </p>
          <ul className="buyrows">
            {result.holds.map((line) => (
              <li key={line} className="buyrows__line">
                {line}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="caption" role="status">
            The plan still holds. A fit carried on from {minute(result.atMs)} finished at {result.carriedTo}.
            {result.sameTable === null
              ? ""
              : result.sameTable
                ? " It wrote the same table the fit from nothing did."
                : " It wrote a different table."}
          </p>
          <table className="notations__table">
            <thead>
              <tr>
                <th scope="col">Gate</th>
                <th scope="col">Price</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.table).map(([key, price]) => (
                <tr key={key}>
                  <th scope="row">{key}</th>
                  <td className="num">{price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
