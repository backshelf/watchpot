// More building blocks for the getting-started pages, added with steps 10 to 18: a price curve, a stat's breakdown,
// a slice with what is saved and what is worked out, a row of choices the panel keeps to itself, a figure set against
// a stale copy of it, and a panel that runs an example's own React page. Styled with the site's tokens inline (this
// file adds no stylesheet), and from the classes the panel already has.
import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  clearSave,
  createGameStorage,
  createMemoryBackend,
  D,
  fmt,
  fmtPlayed,
  type GameStorage,
  localStorageBackend,
  type StorageBackend,
} from "watchpot/core";
import { IdleStoreProvider, type RuntimeStore } from "watchpot/react";
import { useGuide, useSnapshot } from "./context";
import type { Run } from "./page";
import { written } from "./prose";

/**
 * A small figure with its fraction: `fmt` prints whole numbers below a thousand (it rounds down, so a screen never
 * promises more than there is), which hides the 0.5 of a stat; a multiplier or a heat needs its decimals.
 */
export function figure(value: unknown): string {
  const d = D(value as never);
  if (d.abs().gte(1000)) return fmt(d).text;
  return String(Number(d.toNumber().toFixed(2)));
}

/**
 * A name from the code as a readout's label: in the code's own face and case, where a label is otherwise lettering
 * (small capitals would print `nextPrice` as NEXTPRICE).
 */
export function CodeName({ children }: { children: string }) {
  return (
    <code style={{ textTransform: "none", letterSpacing: 0, fontSize: "0.8125rem", fontWeight: 400 }}>
      {children}
    </code>
  );
}

/**
 * A small press that calls one of the game's actions as a convenience of the page, not a move in the game ("Add
 * 1,000 bubbles"): set small and apart from the game's own buttons, with a line saying what it does.
 */
export function Shortcut({
  call,
  args = [],
  children,
  note,
}: {
  call: string;
  args?: unknown[];
  children: ReactNode;
  note: ReactNode;
}) {
  const { host } = useGuide();
  return (
    <div className="panel__row">
      <button type="button" className="button button--small" onClick={() => host.call(call, ...args)}>
        {children}
      </button>
      <span style={{ fontSize: "0.8125rem", color: "var(--ink-soft)" }}>{note}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// A listing whose tokens may span several coloured runs

/**
 * The kit's `Code`, for a token the highlighter splits into several runs (`["bubbles"]` is three: a bracket, a
 * string, a bracket). `Code` prints the control's value once per run, so such a token shows three times; here the
 * runs of one token are one boxed span, printing the value once (or the file's own runs, coloured, while the value
 * is the file's).
 */
export function Listing({ id, caption }: { id: string; caption?: ReactNode }) {
  const { data, page, params } = useGuide();
  const code = data.code[id];
  if (!code) throw new Error(`the page has no listing "${id}"`);
  const defs = page.params ?? {};
  const paint = (run: Run, key: number) => {
    const colour = code.palette[run[1]];
    return (
      <span key={key} style={colour ? { color: colour } : undefined}>
        {run[0]}
      </span>
    );
  };
  return (
    <figure className="code guide-code" data-lang={code.lang}>
      <figcaption className="code__bar">
        <span className="code__lang">{caption ?? code.file}</span>
      </figcaption>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a listing that scrolls sideways is reached by keyboard */}
      <pre tabIndex={0}>
        <code>
          {code.lines.map((line, i) => {
            // Runs grouped: a plain run alone, a token's runs together.
            const groups: { param?: string; runs: Run[] }[] = [];
            for (const run of line) {
              const last = groups[groups.length - 1];
              if (run[2] && last?.param === run[2]) last.runs.push(run);
              else groups.push({ param: run[2], runs: [run] });
            }
            return (
              <span className="line" key={i}>
                {groups.map((group, j) => {
                  if (!group.param) return group.runs.map((run, k) => paint(run, j * 1000 + k));
                  const def = defs[group.param];
                  const value = params[group.param];
                  const original = group.runs.map((run) => run[0]).join("");
                  const now = def && value !== undefined ? written(def, value) : original;
                  return (
                    <span
                      key={j}
                      className="guide-code__param"
                      data-changed={now !== original ? "" : undefined}
                      title={def?.label}
                    >
                      {now === original ? group.runs.map(paint) : now}
                    </span>
                  );
                })}
                {"\n"}
              </span>
            );
          })}
        </code>
      </pre>
    </figure>
  );
}

/** Ruled tone: what is empty, locked or still to come (DESIGN.md: tone is hatching, never a grey). */
const HATCH = "repeating-linear-gradient(-45deg, var(--ink-soft) 0 1px, transparent 1px 4px)";

const label: CSSProperties = {
  fontStretch: "125%",
  fontWeight: 560,
  fontSize: "0.6875rem",
  lineHeight: 1.3,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "var(--ink-soft)",
};

// ---------------------------------------------------------------------------------------------------------------
// A price curve

const ordinal = (n: number) =>
  `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

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
    <figure style={{ margin: 0, display: "grid", gap: "0.45rem" }}>
      <figcaption style={label}>
        Each {what[0]}'s price, 1st to {ordinal(n)}
      </figcaption>
      <div
        role="img"
        aria-label={summary}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          gap: "2px",
          height: "6.5rem",
          borderBottom: "var(--hair) solid var(--ink)",
        }}
      >
        <span
          className="num"
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            fontSize: "0.75rem",
            color: "var(--ink-soft)",
            paddingTop: "0.05rem",
            borderTop: "var(--hair) dashed var(--rule-strong)",
            width: "100%",
          }}
        >
          {print(top)}
        </span>
        {prices.map((price, i) => {
          const state = i < owned ? "owned" : i === owned ? "next" : "ahead";
          return (
            <span
              key={i}
              title={`${ordinal(i + 1)} ${what[0]}: ${print(price)}`}
              style={{
                flex: "1 1 0",
                minWidth: 0,
                height: `${Math.max(1.5, (price / top) * 100)}%`,
                boxSizing: "border-box",
                border: "var(--hair) solid var(--ink)",
                borderBottom: 0,
                background: state === "owned" ? "var(--ink)" : state === "next" ? "var(--live)" : undefined,
                backgroundImage: state === "ahead" ? HATCH : undefined,
                transition: "height 140ms var(--ease-out)",
              }}
            />
          );
        })}
      </div>
      <div
        className="num"
        aria-hidden="true"
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.75rem",
          color: "var(--ink-soft)",
        }}
      >
        <span>1st: {print(prices[0] ?? 0)}</span>
        <span>
          {ordinal(n)}: {print(last)}
        </span>
      </div>
      <p style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem 1rem", fontSize: "0.8125rem" }}>
        <Key fill="var(--ink)">owned</Key>
        <Key fill="var(--live)">the next one</Key>
        <Key image={HATCH}>still to buy</Key>
      </p>
    </figure>
  );
}

function Key({ fill, image, children }: { fill?: string; image?: string; children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "var(--ink-soft)" }}>
      <span
        aria-hidden="true"
        style={{
          width: "0.7rem",
          height: "0.7rem",
          border: "var(--hair) solid var(--ink)",
          background: fill,
          backgroundImage: image,
        }}
      />
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// A breakdown: where a number comes from

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
  const cell: CSSProperties = { padding: "0.4rem 0", borderTop: "var(--hair) solid var(--rule)" };
  const figure: CSSProperties = { ...cell, textAlign: "right", fontFamily: "var(--font-mono)" };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9375rem" }}>
      <caption style={{ ...label, textAlign: "left", paddingBottom: "0.35rem" }}>{title}</caption>
      <tbody>
        <tr>
          <th scope="row" style={{ ...cell, textAlign: "left", fontWeight: 400 }}>
            Base
          </th>
          <td style={{ ...cell, color: "var(--ink-soft)", fontSize: "0.8125rem" }}>to start from</td>
          <td style={figure}>{base}</td>
        </tr>
        {rows.map((row, i) => (
          <tr key={i} style={row.off ? { color: "var(--text-faint)" } : undefined}>
            <th
              scope="row"
              style={{
                ...cell,
                textAlign: "left",
                fontWeight: 400,
                // Not counting: a ruled strip at the row's head, the words left clear to read.
                ...(row.off
                  ? {
                      paddingLeft: "0.9rem",
                      backgroundImage: HATCH,
                      backgroundSize: "0.45rem 100%",
                      backgroundRepeat: "no-repeat",
                    }
                  : {}),
              }}
            >
              {row.label}
            </th>
            <td style={{ ...cell, fontSize: "0.8125rem", color: row.off ? undefined : "var(--ink-soft)" }}>
              {row.off ?? "counting"}
            </td>
            <td style={{ ...figure, textDecoration: row.off ? "line-through" : undefined }}>{row.gives}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th
            scope="row"
            colSpan={2}
            style={{ ...cell, borderTop: "var(--hair) solid var(--ink)", textAlign: "left", fontWeight: 620 }}
          >
            {total.label}
          </th>
          <td
            style={{
              ...figure,
              borderTop: "var(--hair) solid var(--ink)",
              fontSize: "1.25rem",
              fontWeight: 500,
            }}
          >
            {total.value}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// A slice, saved and worked out

/** A value as the panel prints it: a Decimal's figures, a boolean or a number as written. */
function printed(value: unknown, print: (v: unknown) => string): string {
  return print(value);
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
                  <span className="statetree__value">{printed(value, print)}</span>{" "}
                  <span
                    style={{
                      ...label,
                      fontFamily: "var(--font-sans)",
                      fontSize: "0.625rem",
                      marginLeft: "0.35rem",
                      padding: "0 0.3rem",
                      border: `var(--hair) ${kept === false ? "dashed" : "solid"} currentColor`,
                      borderRadius: "1px",
                      verticalAlign: "0.1em",
                    }}
                  >
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

// ---------------------------------------------------------------------------------------------------------------
// A figure beside a copy that can go stale

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
  const box: CSSProperties = {
    alignContent: "start",
    padding: "0.55rem 0.7rem 0.6rem",
    border: "var(--hair) solid var(--rule-strong)",
    borderRadius: "2px",
  };
  const note: CSSProperties = { fontSize: "0.8125rem", lineHeight: 1.35, color: "var(--ink-soft)" };
  return (
    <div className="readouts">
      <div className="readout" style={box}>
        <span className="readout__label">{liveLabel}</span>
        <span className="readout__value num">{live}</span>
        <span style={note}>Always the rule's answer</span>
      </div>
      <div
        className="readout"
        style={
          stale
            ? {
                ...box,
                border: "var(--hair) dashed var(--ink)",
                // A ruled strip down the side: what is out of date is hatched, never greyed.
                paddingLeft: "1.25rem",
                backgroundImage: HATCH,
                backgroundSize: "0.55rem 100%",
                backgroundRepeat: "no-repeat",
              }
            : box
        }
      >
        <span className="readout__label">{copyLabel}</span>
        <span className="readout__value num" style={stale ? { textDecoration: "line-through" } : undefined}>
          {copy}
        </span>
        <span role="status" style={stale ? { ...note, color: "var(--ink)" } : note}>
          {stale ? `Stale: the price is now ${live}` : "Matches, for now"}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// A row of choices the panel keeps (not a token in the code)

/** A choice the panel keeps to itself, such as a buy mode: ruled cells, the chosen one inked. */
export function PanelChoice<T extends string | number>({
  title,
  options,
  value,
  onChange,
}: {
  title: ReactNode;
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: "0.45rem" }}>
      <legend className="panel__label" style={{ padding: 0, marginBottom: "0.45rem" }}>
        {title}
      </legend>
      <span className="control__choices">
        {options.map((option) => (
          <label key={String(option.value)} className="control__choice">
            <input
              type="radio"
              name={name}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className="control__face">{option.label}</span>
          </label>
        ))}
      </span>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// A panel that runs an example's own page

const PREFIX = "watchpot.guide.";
const AWAY_STOPS = [60_000, 10 * 60_000, 3_600_000, 4 * 3_600_000, 12 * 3_600_000, 24 * 3_600_000];

function prefixedLocal(prefix: string): StorageBackend | null {
  const ls = localStorageBackend();
  if (!ls) return null;
  return {
    getItem: (name) => ls.getItem(prefix + name),
    setItem: (name, value) => ls.setItem(prefix + name, value),
    removeItem: (name) => ls.removeItem(prefix + name),
  };
}

function readSkew(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeSkew(key: string, value: number) {
  try {
    if (value) localStorage.setItem(key, String(value));
    else localStorage.removeItem(key);
  } catch {
    // The page still moves on for this visit.
  }
}

/** The styles for an example's own markup inside the panel: the page's look over plain elements. */
const OWN_CSS = `
.own-game main { display: grid; gap: 1rem; }
.own-game h2 { margin: 0; font-size: clamp(2rem, 1.5rem + 1.6vw, 2.75rem); font-stretch: 112%;
  font-weight: 620; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; line-height: 1.05;
  overflow-wrap: anywhere; }
.own-game header p { margin: 0.2rem 0 0; color: var(--ink-soft); font-family: var(--font-mono); }
.own-game p { margin: 0; }
.own-game section { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem;
  padding-top: 1rem; border-top: var(--hair) solid var(--rule); }
.own-game section > p { flex: 1 1 100%; }
.own-game ul { flex: 1 1 100%; display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
.own-game li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.4rem 0.75rem; }
.own-game li > span { font-variant-numeric: tabular-nums; }
.own-game button { display: inline-flex; align-items: center; justify-content: center; min-height: 2.5rem;
  padding: 0 0.9rem; background: transparent; border: var(--hair) solid var(--ink); border-radius: 2px;
  color: var(--ink); font-weight: 560; font-stretch: 108%; line-height: 1.15;
  transition: background-color 140ms var(--ease-out), color 140ms var(--ease-out); }
.own-game button:hover:not(:disabled) { background: var(--ink); color: var(--paper); }
.own-game button:active:not(:disabled) { translate: 0 1px; }
.own-game button:disabled { border-style: dashed; border-color: var(--rule-strong); color: var(--ink-faint); cursor: default; }
.own-game li button:enabled { background: var(--live); color: var(--on-live); }
.own-game li button:enabled:hover { background: var(--ink); color: var(--paper); }
.own-game [role="radiogroup"] { display: inline-flex; flex: 1 1 100%; }
.own-game [role="radio"] { min-width: 3.25rem; border-radius: 0; font-family: var(--font-mono); font-weight: 400; }
.own-game [role="radio"] + [role="radio"] { border-left: 0; }
.own-game [role="radio"][aria-checked="true"] { background: var(--ink); color: var(--paper); }
.own-game [aria-pressed="true"] { background: var(--ink); color: var(--paper); }
.own-game aside { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem;
  padding: 0.7rem 0.8rem; border: var(--hair) solid var(--ink); background: var(--paper-sunk); }
`;

interface Running {
  store: RuntimeStore;
  storage: GameStorage;
  n: number;
}

/**
 * A panel that runs an example's own React page: a store from `make`, saved in this browser under the page's name,
 * with `App` drawn inside the engine's store provider (`App` starts the clock itself, as a game's page does). The
 * reader can reload it, send it away for a while, and start it over. Drawn at build time as a note, and started once
 * the page is in a browser.
 */
export function OwnGame({
  title,
  page,
  make,
  App,
  source,
}: {
  title: ReactNode;
  /** The page's slug: the save and the time skew are kept under it. */
  page: string;
  make: (options: { now: () => number; storage: GameStorage }) => RuntimeStore;
  App: ComponentType;
  /** The example's file and its source page. */
  source: { file: string; href: string };
}) {
  const [run, setRun] = useState<Running | null>(null);
  const [stop, setStop] = useState(2);
  const [back, setBack] = useState<string | null>(null);
  const skew = useRef(0);
  const live = useRef<Running | null>(null);
  const count = useRef(0);
  const skewKey = `${PREFIX}${page}:skew`;
  const id = useId();

  const open = useCallback(() => {
    const backend = prefixedLocal(`${PREFIX}${page}.`);
    const storage = createGameStorage(backend ?? createMemoryBackend(), { durable: backend !== null });
    const store = make({ now: () => Date.now() + skew.current, storage });
    count.current += 1;
    const next = { store, storage, n: count.current };
    live.current = next;
    setRun(next);
  }, [make, page]);

  const close = useCallback(() => {
    const current = live.current;
    if (!current) return;
    // The old store writes what it has, then nothing more: the next one loads it.
    current.storage.flush();
    current.storage.block();
    live.current = null;
  }, []);

  useEffect(() => {
    skew.current = readSkew(skewKey);
    open();
    return close;
  }, [open, close, skewKey]);

  const ms = AWAY_STOPS[stop] ?? 3_600_000;

  return (
    <section className="panel" aria-label="Your first page, running">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the panel's own fixed styles, no input in them */}
      <style dangerouslySetInnerHTML={{ __html: OWN_CSS }} />
      <header className="panel__bar">
        <span className="panel__title">{title}</span>
        <span className="panel__state" data-running={run ? "" : undefined}>
          <span className="panel__lamp" aria-hidden="true" />
          {run ? "Running" : "Starting"}
        </span>
      </header>
      <div className="panel__body">
        <div className="own-game">
          {run ? (
            <IdleStoreProvider key={run.n} store={run.store}>
              <App />
            </IdleStoreProvider>
          ) : (
            <p className="panel__label">The game starts once the page has loaded.</p>
          )}
        </div>
        <div className="away">
          <div className="away__row">
            <label className="panel__label" htmlFor={id}>
              Be away for
            </label>
            <output className="num away__ms" htmlFor={id}>
              {fmtPlayed(ms)}
            </output>
            <input
              id={id}
              className="control__slider"
              type="range"
              min={0}
              max={AWAY_STOPS.length - 1}
              step={1}
              value={stop}
              aria-valuetext={fmtPlayed(ms)}
              onChange={(e) => setStop(Number(e.currentTarget.value))}
            />
            <button
              type="button"
              className="button"
              onClick={() => {
                close();
                skew.current += ms;
                writeSkew(skewKey, skew.current);
                setBack(
                  `Back after ${fmtPlayed(ms)}: the page opened again on the save and paid for the gap.`,
                );
                open();
              }}
            >
              Leave and come back
            </button>
          </div>
          {back ? (
            <p className="away__note" role="status">
              {back}
            </p>
          ) : null}
        </div>
        <div className="panel__row">
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              close();
              setBack("Reloaded: a new store, made from the save.");
              open();
            }}
          >
            Reload it
          </button>
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              const current = live.current;
              if (current) void clearSave(current.store as never);
              live.current = null;
              skew.current = 0;
              writeSkew(skewKey, 0);
              setBack(null);
              open();
            }}
          >
            Start over
          </button>
        </div>
      </div>
      <footer className="panel__foot">
        Running <a href={source.href}>{source.file}</a> on the engine, in this page.
      </footer>
    </section>
  );
}
