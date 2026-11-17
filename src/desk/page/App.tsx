// The sim desk's page: the game runs on load and its pacing is drawn as the windows stream in. A masthead with the run's
// state, a filter column, two graphs and the tables. The knob panel (D5) gets the column to the right of the graphs.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Decimal } from "../../core";
import type { DeskInfo } from "../protocol";
import { Filter, type FilterGroup } from "./Filter";
import { type GateMark, Graph, type GraphLine } from "./Graph";
import { type Connect, connectSocket, type DeskLink } from "./link";
import { idleRun, runReducer } from "./run";
import {
  type Column,
  currencySeries,
  gapPolygons,
  gateRows,
  HOUR_MS,
  log10,
  medianCurrency,
  medianNext,
  type NextPt,
  nextAt,
  nextKeys,
  nextSeries,
  type Pt,
  seedNumbers,
  short,
  toNumber,
  valueAt,
  yAxis,
} from "./series";
import { GateTable, HourTable } from "./Tables";

export interface AppProps {
  /** Opens the line to the desk server. Default: the WebSocket at `/ws`. A test passes a fake. */
  connect?: Connect;
  /** Reads the desk. Default: `GET /api/desk`. */
  load?: () => Promise<DeskInfo>;
}

async function fetchDesk(): Promise<DeskInfo> {
  const res = await fetch("/api/desk");
  if (!res.ok) throw new Error(`/api/desk answered ${res.status}`);
  return (await res.json()) as DeskInfo;
}

const DASHES = 6;
const cid = (name: string) => `cur:${name}`;
const nid = (key: string) => `next:${key}`;

type Xy = readonly [number, number];

export function App({ connect = connectSocket, load = fetchDesk }: AppProps = {}) {
  const [desk, setDesk] = useState<DeskInfo>();
  const [problem, setProblem] = useState<string>();
  const [run, dispatch] = useReducer(runReducer, undefined, idleRun);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState("");
  const [log, setLog] = useState(true);
  const [online, setOnline] = useState(false);
  const link = useRef<DeskLink>(undefined);
  const lastId = useRef(0);

  const play = useCallback((info: DeskInfo, seeds: number, via: DeskLink | undefined = link.current) => {
    if (!via) return;
    const id = ++lastId.current;
    const knobs = Object.fromEntries(info.knobs.map((k) => [k.key, k.value]));
    dispatch({ type: "start", id, seeds });
    via.send({ type: "run", id, knobs, pins: {}, seeds });
  }, []);

  useEffect(() => {
    let live = true;
    load().then(
      (info) => {
        if (!live) return;
        setSelected(new Set([cid(info.currency)]));
        setDesk(info);
      },
      (err: unknown) => {
        if (live) setProblem(`could not read the desk: ${err instanceof Error ? err.message : String(err)}`);
      },
    );
    return () => {
      live = false;
    };
  }, [load]);

  useEffect(() => {
    if (!desk) return;
    let live = true;
    const mine = connect({
      onOpen: (via) => {
        if (!live) return;
        link.current = via;
        setOnline(true);
        play(desk, desk.seeds.tuning, via);
      },
      onMessage: (msg) => {
        if (live) dispatch({ type: "message", msg });
      },
      onClose: () => {
        if (!live) return;
        link.current = undefined;
        setOnline(false);
        setProblem("the connection to the desk closed: restart `watchpot sim` and reload");
      },
    });
    return () => {
      live = false;
      link.current = undefined;
      setOnline(false);
      mine.close();
    };
  }, [desk, connect, play]);

  const set = useCallback((ids: string[], on: boolean) => {
    setSelected((before) => {
      const next = new Set(before);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const data = run.data;
  const seeds = seedNumbers(data);
  const keys = useMemo(() => nextKeys(data), [data]);
  const currencies = desk?.currencies ?? [];

  /** What the graphs and the table draw, built once per window and per tick of a checkbox. */
  const view = useMemo(() => {
    if (!desk) return undefined;
    const many = seedNumbers(data).length > 1;
    const eachSeed = seedNumbers(data);
    const shown = currencies.filter((c) => selected.has(cid(c)));
    const shownNext = keys.filter((k) => selected.has(nid(k)));
    const yOf = (d: Decimal) => (log ? log10(d) : toNumber(d));
    const line = (
      id: string,
      dash: number,
      weight: GraphLine["weight"],
      pts: readonly Pt[],
      label?: string,
    ) => ({ id, dash, weight, label, pts: pts.map(([h, v]): Xy => [h, yOf(v)]) }) satisfies GraphLine;

    const medians = new Map<string, Pt[]>(shown.map((c) => [c, medianCurrency(data, c)]));
    const lines1: GraphLine[] = [];
    for (const c of shown) {
      const dash = currencies.indexOf(c) % DASHES;
      if (many)
        for (const s of eachSeed) lines1.push(line(`${c}#${s}`, dash, "hair", currencySeries(data, s, c)));
      lines1.push(line(c, dash, "strong", medians.get(c) ?? [], c));
    }
    const axis1 = yAxis(
      lines1.flatMap((l) => l.pts.map((p) => p[1])),
      log,
    );

    const nexts = new Map<string, NextPt[]>(shownNext.map((k) => [k, medianNext(data, k)]));
    const lines2: GraphLine[] = [];
    const held: Pt[][] = [];
    for (const k of shownNext) {
      const dash = (currencies.length + keys.indexOf(k)) % DASHES;
      const med = nexts.get(k) ?? [];
      if (many)
        for (const s of eachSeed) {
          const own = nextSeries(data, s, k);
          lines2.push(
            line(
              `${k}#${s}:held`,
              dash,
              "hair",
              own.map((p): Pt => [p.hours, p.held]),
            ),
          );
          lines2.push(
            line(
              `${k}#${s}:cost`,
              dash,
              "hair",
              own.map((p): Pt => [p.hours, p.cost]),
            ),
          );
        }
      const heldPts = med.map((p): Pt => [p.hours, p.held]);
      held.push(heldPts);
      lines2.push(line(`${k}:held`, dash, "mid", heldPts, `${k} held`));
      lines2.push(
        line(
          `${k}:cost`,
          dash,
          "strong",
          med.map((p): Pt => [p.hours, p.cost]),
          `${k} cost`,
        ),
      );
    }
    const axis2 = yAxis(
      lines2.flatMap((l) => l.pts.map((p) => p[1])),
      log,
    );
    const gaps2 = shownNext.flatMap((k) =>
      gapPolygons(
        (nexts.get(k) ?? []).map((p) => ({
          x: p.hours,
          high: Math.max(yOf(p.cost), axis2.lo),
          low: Math.max(yOf(p.held), axis2.lo),
        })),
      ),
    );

    const stopsOf = (pts: readonly (readonly [number, unknown])[][]) =>
      [...new Set(pts.flatMap((p) => p.map((q) => q[0])))].sort((a, b) => a - b);
    const stops1 = stopsOf([...medians.values()]);
    const stops2 = stopsOf([...nexts.values()].map((n) => n.map((p): Pt => [p.hours, p.cost])));

    const columns: Column[] = [
      ...shown.map((c) => ({ id: cid(c), label: c, pts: medians.get(c) ?? [] })),
      ...shownNext.map((k) => ({
        id: nid(k),
        label: `${k} cost`,
        pts: (nexts.get(k) ?? []).map((p): Pt => [p.hours, p.cost]),
      })),
    ];

    const gates = gateRows(data);
    const marks: GateMark[] = gates.map((g) => ({
      key: g.key,
      plannedH: g.plannedH,
      openings: g.openings,
      labelH: g.openedH ?? g.plannedH,
    }));
    const main = valueAt(medianCurrency(data, desk.currency), Number.POSITIVE_INFINITY);

    return {
      shown,
      shownNext,
      medians,
      nexts,
      lines1,
      axis1,
      lines2,
      axis2,
      gaps2,
      stops1,
      stops2,
      columns,
      gates,
      marks,
      main,
    };
  }, [desk, data, selected, keys, log, currencies]);

  const groups: FilterGroup[] = [
    {
      id: "currencies",
      heading: "Currencies",
      items: currencies.map((c, i) => ({ id: cid(c), label: c, dash: i % DASHES })),
    },
    {
      id: "next",
      heading: "Next cost",
      items: keys.map((k, i) => ({
        id: nid(k),
        label: k,
        name: `Next cost of ${k}`,
        dash: (currencies.length + i) % DASHES,
      })),
    },
  ];

  const end = desk?.end.hours ?? 0;
  const playedH = Math.floor(run.playedMs / HOUR_MS);
  const phase =
    run.phase === "running"
      ? `running ${playedH} / ${end} h`
      : run.phase === "idle" && !desk
        ? "loading"
        : run.phase;
  const waiting = run.phase === "running" && seeds.length === 0;
  const errors = [
    ...(problem ? [problem] : []),
    ...run.errors.map((e) => (e.seed ? `seed ${e.seed}: ${e.message}` : e.message)),
  ];

  const emptyFor = (none: string): string | undefined => {
    if (!desk) return "Reading the desk…";
    if (none) return none;
    if (waiting) return `Playing the first window… 0 / ${end} h`;
    if (seeds.length === 0)
      return run.phase === "idle" ? "Nothing played yet: press Run" : "Nothing came back from the run";
    return undefined;
  };

  const readout1 = (h: number) =>
    (view?.shown ?? []).map((c) => {
      const v = valueAt(view?.medians.get(c) ?? [], h);
      return { label: c, text: v ? short(v) : "–" };
    });
  const readout2 = (h: number) =>
    (view?.shownNext ?? []).flatMap((k) => {
      const p = nextAt(view?.nexts.get(k) ?? [], h);
      return [
        { label: `${k} held`, text: p ? short(p.held) : "–" },
        { label: `${k} cost`, text: p ? short(p.cost) : "–" },
      ];
    });

  const many = seeds.length > 1;
  const resumed =
    run.resumedFromMs === undefined
      ? ""
      : ` Resumed from the cache at ${(run.resumedFromMs / HOUR_MS).toFixed(1)} h: the hours before it were not replayed.`;
  const basis = many ? `the median of ${seeds.length} seeds, each seed a hairline` : "seed 1";

  return (
    <div className="desk" data-dp-tool="sim" data-run={run.phase}>
      <header className="mast">
        <h1 className="mast__name lettering">watchpot sim</h1>
        <p className="mast__currency">
          <span className="lettering">{desk?.currency ?? ""}</span>{" "}
          <span className="num">{view?.main ? short(view.main) : "–"}</span>
        </p>
        <p className="mast__state" role="status" data-phase={run.phase}>
          <span className="mast__lamp" aria-hidden="true" />
          <span className="num">{phase}</span>
        </p>
        <div className="mast__controls">
          <button
            type="button"
            className="control"
            disabled={!desk || !online}
            onClick={() => desk && play(desk, desk.seeds.tuning)}
          >
            Run
          </button>
          <button
            type="button"
            className="control"
            disabled={!desk || !online}
            onClick={() => desk && play(desk, desk.seeds.full)}
          >
            All seeds
          </button>
        </div>
      </header>
      {errors.length > 0 && (
        <div className="errors" role="alert">
          {errors.map((e, i) => (
            <p key={i} className="num">
              {e}
            </p>
          ))}
        </div>
      )}
      <div className="body">
        <Filter groups={groups} selected={selected} search={search} onSearch={setSearch} onSet={set} />
        <main className="main">
          <div className="scale">
            <span className="lettering">Scale</span>
            <div className="seg">
              <button type="button" className="control" aria-pressed={log} onClick={() => setLog(true)}>
                log
              </button>
              <button type="button" className="control" aria-pressed={!log} onClick={() => setLog(false)}>
                linear
              </button>
            </div>
          </div>
          <Graph
            title="Currencies over time"
            caption={`Played hours along the bottom, ${log ? "log10 of the value" : "the value"} up the side; ${basis}. A hairline down the plot is where a gate opened; the chain-line tick at the foot is where it was planned.${resumed}`}
            height={420}
            endHours={end || 1}
            axis={view?.axis1 ?? { lo: 0, hi: 1, ticks: [0, 1] }}
            log={log}
            lines={view?.lines1 ?? []}
            gates={view?.marks}
            stops={view?.stops1 ?? []}
            readout={readout1}
            empty={emptyFor(view && view.shown.length === 0 ? "Tick a currency in the left column" : "")}
          />
          {view && view.shownNext.length > 0 && (
            <Graph
              title="Wallet against next cost"
              caption="The balance that pays for each ticked buyable, and its price. Hatched where the price is above the balance: a long hatched plateau is a stall."
              height={340}
              endHours={end || 1}
              axis={view.axis2}
              log={log}
              lines={view.lines2}
              gaps={view.gaps2}
              stops={view.stops2}
              readout={readout2}
              empty={emptyFor("")}
            />
          )}
          <HourTable columns={view?.columns ?? []} waiting={waiting} />
          <GateTable gates={view?.gates ?? []} waiting={waiting} />
        </main>
        {/* The knob panel's column (D5) goes here: the grid reserves it. */}
      </div>
    </div>
  );
}
