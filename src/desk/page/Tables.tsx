// The tables under the graphs: one row per whole hour, one column per visible series; then the gates.
import type { Decimal } from "../../core";
import { type Column, type GateRow, hourlyRows, hoursMinutes } from "./series";

const cell = (v: Decimal | undefined): string => (v === undefined ? "–" : v.toString());

export function HourTable({ columns, waiting }: { columns: readonly Column[]; waiting: boolean }) {
  const rows = hourlyRows(columns);
  return (
    <section className="plate sheet">
      <div className="plate__head">
        <h2 className="lettering">By the hour</h2>
      </div>
      {columns.length === 0 || rows.length === 0 ? (
        <p className="empty">
          {columns.length === 0
            ? "Tick a series in the left column: its value at every whole hour is listed here."
            : waiting
              ? "Waiting for the first window: a row for every whole hour is listed here as it plays."
              : "No whole hour has been played yet."}
        </p>
      ) : (
        <div className="sheet__scroll">
          <table className="parts" aria-label="Hourly values">
            <thead>
              <tr>
                <th scope="col">Hour</th>
                {columns.map((c) => (
                  <th scope="col" key={c.id}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.hour}>
                  <th scope="row" className="num">
                    {r.hour}
                  </th>
                  {r.cells.map((v, i) => (
                    <td className="num" key={columns[i]?.id}>
                      {cell(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const hours = (h: number | undefined): string => (h === undefined ? "–" : h.toFixed(2));

export function GateTable({ gates, waiting }: { gates: readonly GateRow[]; waiting: boolean }) {
  return (
    <section className="plate sheet">
      <div className="plate__head">
        <h2 className="lettering">Gates</h2>
      </div>
      {gates.length === 0 ? (
        <p className="empty">
          {waiting
            ? "Waiting for the first window: each gate's planned and opened hour land here."
            : "No gates."}
        </p>
      ) : (
        <div className="sheet__scroll">
          <table className="parts" aria-label="Gates">
            <thead>
              <tr>
                <th scope="col">Gate</th>
                <th scope="col">Planned h</th>
                <th scope="col">Opened h</th>
                <th scope="col">Drift</th>
                <th scope="col">Pinned</th>
              </tr>
            </thead>
            <tbody>
              {gates.map((g) => (
                <tr key={g.key}>
                  <th scope="row" className="num">
                    {g.key}
                  </th>
                  <td className="num">{hours(g.plannedH)}</td>
                  <td className="num">
                    {hours(g.openedH)}
                    {g.seeds > 1 && g.opened < g.seeds ? ` (${g.opened}/${g.seeds})` : ""}
                  </td>
                  <td className="num">{g.driftH === undefined ? "–" : hoursMinutes(g.driftH, true)}</td>
                  <td>{g.pinned ? "pinned" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
