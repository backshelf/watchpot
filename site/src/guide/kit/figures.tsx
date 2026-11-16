// Figures a panel draws from the state: a price curve, a number's breakdown, a slice marked by what the save holds,
// and a figure set beside a copy of it that can go stale. Each takes props only; the page reads the state and hands
// them what to draw. The look is `guide.css`'s (`.curve`, `.breakdown`, `.slicefields`, `.copy`).
import type { ReactNode } from "react";
import { useSnapshot } from "./context";

const ordinal = (n: number) =>
  `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

/** A key to a figure's marks: a small swatch of the mark, and what it means. */
function Key({ kind, children }: { kind: string; children: ReactNode }) {
  return (
    <span className="figkey">
      <span className="figkey__swatch" data-kind={kind} aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * The price of each of the first few, as bars: the ones owned inked, the next lit, the ones to come ruled. `prices`
 * is the price with 0, 1, 2… owned; `owned` how many are owned now; `print` writes a price.
 */
export function PriceCurve({
  prices,
  owned,
  what,
  print,
}: {
  prices: readonly number[];
  owned: number;
  /** The thing bought, singular and plural: ["burner", "burners"]. */
  what: readonly [string, string];
  print: (price: number) => string;
}) {
  const top = Math.max(...prices, 1);
  const n = prices.length;
  const next = prices[owned];
  const last = prices[n - 1] ?? 0;
  const summary = `The prices of the first ${n} ${what[1]}, from ${print(prices[0] ?? 0)} to ${print(last)}. ${owned} owned${
    next === undefined ? "" : `; the next costs ${print(next)}`
  }.`;
  return (
    <figure className="curve">
      <figcaption className="panel__label">
        Each {what[0]}'s price, 1st to {ordinal(n)}
      </figcaption>
      <div className="curve__bars" role="img" aria-label={summary}>
        <span className="curve__top num" aria-hidden="true">
          {print(top)}
        </span>
        {prices.map((price, i) => (
          <span
            key={i}
            className="curve__bar"
            data-state={i < owned ? "owned" : i === owned ? "next" : "ahead"}
            title={`${ordinal(i + 1)} ${what[0]}: ${print(price)}`}
            style={{ height: `${Math.max(1.5, (price / top) * 100)}%` }}
          />
        ))}
      </div>
      <div className="curve__ends num" aria-hidden="true">
        <span>1st: {print(prices[0] ?? 0)}</span>
        <span>
          {ordinal(n)}: {print(last)}
        </span>
      </div>
      <p className="figkeys">
        <Key kind="owned">owned</Key>
        <Key kind="next">the next one</Key>
        <Key kind="ahead">still to buy</Key>
      </p>
    </figure>
  );
}

export interface BreakdownRow {
  label: ReactNode;
  /** What it gives, as written: "×2", "+0.5". */
  gives: string;
  /** Set when the row is listed but does not count now, with why ("the lid is off"). */
  off?: ReactNode;
}

/** A number's parts, as a parts list: its base, a row per thing that changes it, and what they come to. */
export function Breakdown({
  title,
  base,
  rows,
  total,
}: {
  title: ReactNode;
  base: string;
  rows: readonly BreakdownRow[];
  total: { label: ReactNode; value: string };
}) {
  return (
    <table className="breakdown">
      <caption className="panel__label">{title}</caption>
      <tbody>
        <tr>
          <th scope="row">Base</th>
          <td className="breakdown__note">to start from</td>
          <td className="breakdown__figure num">{base}</td>
        </tr>
        {rows.map((row, i) => (
          <tr key={i} data-off={row.off ? "" : undefined}>
            <th scope="row">{row.label}</th>
            <td className="breakdown__note">{row.off ?? "counting"}</td>
            <td className="breakdown__figure num">{row.gives}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={2} className="breakdown__foot">
            {total.label}
          </th>
          <td className="breakdown__foot breakdown__figure breakdown__total num">{total.value}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/**
 * One slice of the state, field by field, each marked by whether the save holds it: a field in `initial` is saved, a
 * derived value is worked out and never saved. The marks are read off the save as it stands, not declared.
 */
export function SliceFields({
  slice,
  title,
  print,
}: {
  slice: string;
  title: ReactNode;
  print: (value: unknown) => string;
}) {
  const { state, saved } = useSnapshot();
  const fields = Object.entries((state[slice] ?? {}) as Record<string, unknown>).filter(
    ([, v]) => typeof v !== "function",
  );
  let inSave: Record<string, unknown> | null = null;
  try {
    inSave = saved
      ? ((JSON.parse(saved) as { state?: Record<string, Record<string, unknown>> }).state?.[slice] ?? {})
      : null;
  } catch {
    inSave = null;
  }
  return (
    <div className="statetree">
      <p className="panel__label">{title}</p>
      <ul className="statetree__list num">
        <li>
          <span className="statetree__key">{slice}</span>
          <ul>
            {fields.map(([key, value]) => {
              const kept = inSave ? key in inSave : null;
              return (
                <li key={key}>
                  <span className="statetree__key">{key}</span>{" "}
                  <span className="statetree__value">{print(value)}</span>{" "}
                  <span className="slicefields__mark" data-kept={kept === false ? "no" : "yes"}>
                    {kept === null ? "…" : kept ? "saved" : "worked out"}
                  </span>
                </li>
              );
            })}
          </ul>
        </li>
      </ul>
    </div>
  );
}

/**
 * Two figures side by side: the one the engine works out, and a copy written down at some moment. While they differ
 * the copy is ruled through and hatched: stale.
 */
export function AgainstCopy({
  live,
  copy,
  liveLabel,
  copyLabel,
}: {
  live: string;
  copy: string;
  liveLabel: ReactNode;
  copyLabel: ReactNode;
}) {
  const stale = live !== copy;
  return (
    <div className="readouts">
      <div className="readout copy">
        <span className="readout__label">{liveLabel}</span>
        <span className="readout__value num">{live}</span>
        <span className="copy__note">Always the rule's answer</span>
      </div>
      <div className="readout copy" data-stale={stale ? "" : undefined}>
        <span className="readout__label">{copyLabel}</span>
        <span className="readout__value num">{copy}</span>
        <span className="copy__note" role="status">
          {stale ? `Stale: the price is now ${live}` : "Matches, for now"}
        </span>
      </div>
    </div>
  );
}
