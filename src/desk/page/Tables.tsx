// The tables under the graphs: one row per whole hour, one column per visible series (and, against a run before, its
// difference); then the gates, where a gate can be pinned by hand.
import { useState } from "react";
import { D } from "../../core";
import type { DeskInfo } from "../protocol";
import { HandMark } from "./Panel";
import {
  beforeAt,
  type Column,
  figure,
  type GateRow,
  HOUR_MS,
  hourlyRows,
  hoursMinutes,
  parseHours,
  parsePrice,
  percentChange,
} from "./series";

export type Pins = NonNullable<DeskInfo["pins"]>;
export type Pin = Pins[string];

export function HourTable({ columns, waiting }: { columns: readonly Column[]; waiting: boolean }) {
  const rows = hourlyRows(columns);
  const compare = columns.some((c) => c.before !== undefined);
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
                <th scope="col" className="parts__hour">
                  Hour
                </th>
                {columns.flatMap((c) => [
                  <th scope="col" key={c.id} className="parts__n">
                    {c.label}
                  </th>,
                  ...(compare
                    ? [
                        <th
                          scope="col"
                          key={`${c.id}:delta`}
                          className="parts__n parts__delta"
                          title={`${c.label}: change against the run before`}
                        >
                          Δ vs before
                        </th>,
                      ]
                    : []),
                ])}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.hour}>
                  <th scope="row" className="num parts__hour">
                    {r.hour}
                  </th>
                  {columns.flatMap((c, i) => [
                    <td className="num parts__n" key={c.id}>
                      {figure(r.cells[i])}
                    </td>,
                    ...(compare
                      ? [
                          <td className="num parts__n parts__delta" key={`${c.id}:delta`}>
                            {percentChange(r.cells[i], c.before ? beforeAt(c.before, r.hour) : undefined)}
                          </td>,
                        ]
                      : []),
                  ])}
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
const price = (v: string | undefined): string => {
  if (v === undefined) return "–";
  const d = D(v);
  return d.isNan() ? v : figure(d);
};

/** The inline fields of a pin: a price and an hour. A valid entry is a pin at once; both empty is no pin. */
function PinFields({
  gate,
  pin,
  onPin,
}: {
  gate: string;
  pin: Pin | undefined;
  onPin: (p: Pin | undefined) => void;
}) {
  const [price, setPrice] = useState(pin?.price ?? "");
  const [hour, setHour] = useState(pin?.atMs === undefined ? "" : hoursMinutes(pin.atMs / HOUR_MS));
  const priceOk = price.trim() === "" || parsePrice(price) !== undefined;
  const hourOk = hour.trim() === "" || parseHours(hour) !== undefined;
  const send = (nextPrice: string, nextHour: string) => {
    const p = parsePrice(nextPrice);
    const h = parseHours(nextHour);
    const out: Pin = {};
    if (p !== undefined) out.price = p;
    if (h !== undefined) out.atMs = h;
    onPin(out.price === undefined && out.atMs === undefined ? undefined : out);
  };
  return (
    <span className="pinfields">
      <input
        className="field num"
        type="text"
        inputMode="decimal"
        placeholder="price"
        aria-label={`Price of ${gate}`}
        aria-invalid={!priceOk}
        value={price}
        onChange={(e) => {
          setPrice(e.target.value);
          send(e.target.value, hour);
        }}
      />
      <input
        className="field num"
        type="text"
        placeholder="h:mm"
        aria-label={`Hour of ${gate}`}
        aria-invalid={!hourOk}
        value={hour}
        onChange={(e) => {
          setHour(e.target.value);
          send(price, e.target.value);
        }}
      />
    </span>
  );
}

function GateRowView({
  gate: g,
  pin,
  onPin,
}: {
  gate: GateRow;
  pin: Pin | undefined;
  onPin: (key: string, pin: Pin | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const pinned = pin !== undefined;
  const editing = pinned || open;
  const fitted = g.fitValue ?? (g.pinned ? undefined : g.value);
  return (
    <tr data-hand={pinned ? "true" : undefined}>
      <th scope="row" className="num">
        {g.key}
      </th>
      <td className="num parts__n">
        {pin?.atMs === undefined ? (
          hours(g.plannedH)
        ) : (
          <span className="hand">
            <HandMark />
            <strong>{hours(pin.atMs / HOUR_MS)}</strong>
          </span>
        )}
      </td>
      <td className="num parts__n">
        {hours(g.openedH)}
        {g.seeds > 1 && g.opened < g.seeds ? ` (${g.opened}/${g.seeds})` : ""}
      </td>
      <td className="num parts__n">{g.driftH === undefined ? "–" : hoursMinutes(g.driftH, true)}</td>
      <td className="num parts__n">
        {pin?.price === undefined ? (
          price(g.value)
        ) : (
          <span className="hand">
            <HandMark />
            <strong>{price(pin.price)}</strong>
            {fitted !== undefined && <s className="hand__code">{price(fitted)}</s>}
          </span>
        )}
      </td>
      <td>
        <span className="pincell">
          {editing ? (
            <>
              <PinFields gate={g.key} pin={pin} onPin={(p) => onPin(g.key, p)} />
              <button
                type="button"
                className="control control--small"
                onClick={() => {
                  setOpen(false);
                  onPin(g.key, undefined);
                }}
              >
                {pinned ? "Unpin" : "Cancel"}
              </button>
            </>
          ) : (
            <button type="button" className="control control--small" onClick={() => setOpen(true)}>
              Pin
            </button>
          )}
        </span>
      </td>
    </tr>
  );
}

export function GateTable({
  gates,
  pins,
  waiting,
  onPin,
}: {
  gates: readonly GateRow[];
  pins: Pins;
  waiting: boolean;
  onPin: (key: string, pin: Pin | undefined) => void;
}) {
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
                <th scope="col" className="parts__n">
                  Planned h
                </th>
                <th scope="col" className="parts__n">
                  Opened h
                </th>
                <th scope="col" className="parts__n">
                  Drift
                </th>
                <th scope="col" className="parts__n">
                  Price
                </th>
                <th scope="col">Pin</th>
              </tr>
            </thead>
            <tbody>
              {gates.map((g) => (
                <GateRowView key={g.key} gate={g} pin={pins[g.key]} onPin={onPin} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
