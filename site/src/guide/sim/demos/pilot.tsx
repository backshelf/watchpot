// The pilot page's panel: one look on the oven, what the auto-player bought and why, and a day under three schedules
// as played hours against waited ones.
import type * as Oven from "../../../../../docs/examples/sim-oven";
import { Press, Shown, ShownRow, useRun } from "./live";

type Day = ReturnType<typeof Oven.dayOf>;
type Look = ReturnType<typeof Oven.lookOnce>;
type Answer = { look: Look; days: Day[] };

const WHICH = ["active", "evening", "checker"] as const;

export function PilotPanel() {
  const { result, again } = useRun<typeof Oven, Answer>((one) => ({
    look: one.lookOnce(),
    days: WHICH.map((which) => one.dayOf(which)),
  }));
  const look = result?.look;
  return (
    <>
      <ShownRow>
        <Shown label="The pilot bought" value={look ? look.bought : "—"} />
        <Shown label="Bubbles left" value={look ? look.bubbles : "—"} />
      </ShownRow>
      <Press onPress={again}>{look ? "Let it look again" : "Let the pilot look"}</Press>
      {look ? (
        <p className="caption">
          {look.moves.length === 0
            ? "It bought nothing: no move was affordable and worth taking."
            : `It took ${look.moves.join(", then ")}.`}
        </p>
      ) : (
        <p className="caption">Sixty bubbles in hand, a look every three seconds, and one look taken here.</p>
      )}

      {result ? (
        <table className="notations__table">
          <thead>
            <tr>
              <th scope="col">A day</th>
              <th scope="col">Played</th>
              <th scope="col">Waited</th>
              <th scope="col">Looks</th>
            </tr>
          </thead>
          <tbody>
            {result.days.map((day) => (
              <tr key={day.label}>
                <th scope="row">{day.label}</th>
                <td className="num">{day.playedHours.toFixed(1)} h</td>
                <td className="num">{day.waitedHours.toFixed(1)} h</td>
                <td className="num">{day.looks.toLocaleString("en")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
