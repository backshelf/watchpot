// The tables under the graphs: one row per whole hour, one column per visible series (and, against a run before, its
// difference); then the gates, where a gate can be pinned by hand.
import { useState } from "react";
import { D, type Decimal } from "../../core";
import type { DeskInfo } from "../protocol";
import { HandMark } from "./Panel";
import {
  beforeAt,
  type Column,
  type GateRow,
  HOUR_MS,
  hourlyRows,
  hoursMinutes,
  orders,
  parseHours,
  parsePrice,
  short,
  signedOrders,
} from "./series";

export type Pins = NonNullable<DeskInfo["pins"]>;
export type Pin = Pins[string];

const cell = (v: Decimal | undefined): string => (v === undefined ? "–" : v.toString());

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
                <th scope="col">Hour</th>
                {columns.flatMap((c) => [
                  <th scope="col" key={c.id}>
                    {c.label}
                  </th>,
                  ...(compare
                    ? [
                        <th scope="col" key={`${c.id}:delta`} className="parts__delta">
                          {`Δ ${c.label}`}
                        </th>,
                      ]
                    : []),
                ])}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.hour}>
                  <th scope="row" className="num">
                    {r.hour}
                  </th>
                  {columns.flatMap((c, i) => [
                    <td className="num" key={c.id}>
                      {cell(r.cells[i])}
                    </td>,
                    ...(compare
                      ? [
                          <td className="num parts__delta" key={`${c.id}:delta`}>
                            {signedOrders(orders(r.cells[i], beforeAt(c.before, r.hour)))}
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
const figure = (v: string | undefined): string => {
  if (v === undefined) return "–";
  const d = D(v);
  return d.isNan() ? v : short(d);
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
      <td className="num">
        {pin?.atMs === undefined ? (
          hours(g.plannedH)
        ) : (
          <span className="hand">
            <HandMark />
            <strong>{hours(pin.atMs / HOUR_MS)}</strong>
          </span>
        )}
      </td>
      <td className="num">
        {hours(g.openedH)}
        {g.seeds > 1 && g.opened < g.seeds ? ` (${g.opened}/${g.seeds})` : ""}
      </td>
      <td className="num">{g.driftH === undefined ? "–" : hoursMinutes(g.driftH, true)}</td>
      <td className="num">
        {pin?.price === undefined ? (
          figure(g.value)
        ) : (
          <span className="hand">
            <HandMark />
            <strong>{figure(pin.price)}</strong>
            {fitted !== undefined && <s className="hand__code">{figure(fitted)}</s>}
          </span>
        )}
      </td>
      <td className="pincell">
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
                <th scope="col">Planned h</th>
                <th scope="col">Opened h</th>
                <th scope="col">Drift</th>
                <th scope="col">Price</th>
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
