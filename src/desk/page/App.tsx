// The sim desk's page: the game runs on load and its pacing is drawn as the windows stream in. A masthead with the run's
// state, a filter column, two graphs and the tables, and the knob panel in the column to the right of the graphs.
// Whatever is turned or pinned by hand reruns the pacing half a second after the last change and is drawn over the run
// before it; Save writes it to the game's tuning file.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Decimal } from "../../core";
import type { DeskInfo } from "../protocol";
import { Filter, type FilterGroup } from "./Filter";
import { type GateMark, Graph, type GraphLine } from "./Graph";
import { type Connect, connectSocket, type DeskLink } from "./link";
import { type Hand, Panel } from "./Panel";
import { idleRun, runReducer } from "./run";
import {
  beforeAt,
  type Column,
  currencySeries,
  figure,
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
  orders,
  type Pt,
  seedNumbers,
  signedOrders,
  toNumber,
  valueAt,
  yAxis,
} from "./series";
import { GateTable, HourTable, type Pin } from "./Tables";

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

/** The six slots a series can take: each is a dash pattern and a `--dp-series-N` colour, by index in the filter column. */
const SLOTS = 6;
const slotOf = (index: number) => index % SLOTS;
/** How long after the last change to a knob or a pin the pacing reruns. */
const RERUN_MS = 500;
const cid = (name: string) => `cur:${name}`;
const nid = (key: string) => `next:${key}`;

type Xy = readonly [number, number];

const cloneHand = (h: Hand): Hand => ({ knobs: { ...h.knobs }, pins: structuredClone(h.pins) });
const sameHand = (a: Hand, b: Hand): boolean =>
  JSON.stringify([Object.entries(a.knobs).sort(), Object.entries(a.pins).sort()]) ===
  JSON.stringify([Object.entries(b.knobs).sort(), Object.entries(b.pins).sort()]);

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
  // What is set now and what the tuning file holds: `hand` is what the next run sends.
  const [hand, setHandState] = useState<Hand>({ knobs: {}, pins: {} });
  const [saved, setSaved] = useState<Hand>({ knobs: {}, pins: {} });
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: "saved" | "error"; text: string }>();
  // Counts reverts: a revert remounts the gates table, whose pin fields hold what was typed.
  const [epoch, setEpoch] = useState(0);
  const handRef = useRef(hand);
  const seedsRef = useRef(1);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Sends a run of what is set now; the server cancels an older one still streaming. */
  const play = useCallback((seeds: number, via: DeskLink | undefined = link.current) => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    if (!via) return;
    const id = ++lastId.current;
    const { knobs, pins } = handRef.current;
    dispatch({ type: "start", id, seeds });
    via.send({ type: "run", id, knobs: { ...knobs }, pins: structuredClone(pins), seeds });
  }, []);

  /** Changes what is set by hand, and reruns once it has been left alone for a moment. */
  const edit = useCallback(
    (change: (h: Hand) => Hand) => {
      const next = change(handRef.current);
      handRef.current = next;
      setHandState(next);
      setNote(undefined);
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = setTimeout(() => play(seedsRef.current), RERUN_MS);
    },
    [play],
  );
  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    let live = true;
    load().then(
      (info) => {
        if (!live) return;
        const start: Hand = {
          knobs: Object.fromEntries(info.knobs.map((k) => [k.key, k.value])),
          pins: structuredClone(info.pins ?? {}),
        };
        handRef.current = start;
        seedsRef.current = info.seeds.tuning;
        setHandState(start);
        setSaved(cloneHand(start));
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
        play(desk.seeds.tuning, via);
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

  const setKnob = (key: string, value: number) =>
    edit((h) => ({ ...h, knobs: { ...h.knobs, [key]: value } }));
  const resetKnob = (key: string) => {
    const code = desk?.knobs.find((k) => k.key === key)?.code;
    if (code !== undefined) setKnob(key, code);
  };
  const setPin = (key: string, pin: Pin | undefined) =>
    edit((h) => {
      const pins = { ...h.pins };
      if (pin) pins[key] = pin;
      else delete pins[key];
      return { ...h, pins };
    });
  const revert = () => {
    edit(() => cloneHand(saved));
    setEpoch((e) => e + 1);
  };
  const tuningFile = desk?.tuningFile ?? "sim.tuning.json";
  const dirty = !sameHand(hand, saved);
  const save = async () => {
    if (!desk) return;
    const sent = cloneHand(handRef.current);
    setSaving(true);
    setNote(undefined);
    try {
      const res = await fetch("/api/tuning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sent),
      });
      if (res.ok) {
        setSaved(sent);
        setNote({ kind: "saved", text: `saved to ${tuningFile}` });
      } else {
        let text = `/api/tuning answered ${res.status}`;
        try {
          const body = (await res.json()) as { error?: unknown };
          if (typeof body.error === "string") text = body.error;
        } catch {
          // Not JSON: the status says enough.
        }
        setNote({ kind: "error", text });
      }
    } catch (err) {
      setNote({ kind: "error", text: `could not save: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  const data = run.data;
  const before = run.before;
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
    const nextSlot = (k: string) => slotOf(currencies.length + keys.indexOf(k));
    const yOf = (d: Decimal) => (log ? log10(d) : toNumber(d));
    const line = (id: string, slot: number, weight: GraphLine["weight"], pts: readonly Pt[]) =>
      ({ id, slot, weight, pts: pts.map(([h, v]): Xy => [h, yOf(v)]) }) satisfies GraphLine;

    const medians = new Map<string, Pt[]>(shown.map((c) => [c, medianCurrency(data, c)]));
    const befores = new Map<string, Pt[]>(shown.map((c) => [c, before ? medianCurrency(before, c) : []]));
    const lines1: GraphLine[] = shown.flatMap((c) => {
      const pts = befores.get(c) ?? [];
      return pts.length > 0 ? [line(`before:${c}`, slotOf(currencies.indexOf(c)), "before", pts)] : [];
    });
    for (const c of shown) {
      const slot = slotOf(currencies.indexOf(c));
      if (many)
        for (const s of eachSeed) lines1.push(line(`${c}#${s}`, slot, "hair", currencySeries(data, s, c)));
      lines1.push(line(c, slot, "strong", medians.get(c) ?? []));
    }
    const axis1 = yAxis(
      lines1.flatMap((l) => l.pts.map((p) => p[1])),
      log,
    );

    const nexts = new Map<string, NextPt[]>(shownNext.map((k) => [k, medianNext(data, k)]));
    const beforeNexts = new Map<string, { held: Pt[]; cost: Pt[] }>(
      shownNext.map((k) => {
        const med = before ? medianNext(before, k) : [];
        return [
          k,
          { held: med.map((p): Pt => [p.hours, p.held]), cost: med.map((p): Pt => [p.hours, p.cost]) },
        ];
      }),
    );
    const lines2: GraphLine[] = shownNext.flatMap((k) => {
      const b = beforeNexts.get(k);
      const slot = nextSlot(k);
      return [
        ...(b && b.held.length > 0 ? [line(`before:${k}:held`, slot, "before", b.held)] : []),
        ...(b && b.cost.length > 0 ? [line(`before:${k}:cost`, slot, "before", b.cost)] : []),
      ];
    });
    const held: Pt[][] = [];
    for (const k of shownNext) {
      const slot = nextSlot(k);
      const med = nexts.get(k) ?? [];
      if (many)
        for (const s of eachSeed) {
          const own = nextSeries(data, s, k);
          lines2.push(
            line(
              `${k}#${s}:held`,
              slot,
              "hair",
              own.map((p): Pt => [p.hours, p.held]),
            ),
          );
          lines2.push(
            line(
              `${k}#${s}:cost`,
              slot,
              "hair",
              own.map((p): Pt => [p.hours, p.cost]),
            ),
          );
        }
      const heldPts = med.map((p): Pt => [p.hours, p.held]);
      held.push(heldPts);
      lines2.push(line(`${k}:held`, slot, "mid", heldPts));
      lines2.push(
        line(
          `${k}:cost`,
          slot,
          "strong",
          med.map((p): Pt => [p.hours, p.cost]),
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
      ...shown.map((c) => ({
        id: cid(c),
        label: c,
        pts: medians.get(c) ?? [],
        before: before ? (befores.get(c) ?? []) : undefined,
      })),
      ...shownNext.map((k) => ({
        id: nid(k),
        label: `${k} cost`,
        pts: (nexts.get(k) ?? []).map((p): Pt => [p.hours, p.cost]),
        before: before ? (beforeNexts.get(k)?.cost ?? []) : undefined,
      })),
    ];

    // While a new run waits for its first window the gates stay listed, from the run before: a pin being typed stays.
    const gates = gateRows(data.seeds.size > 0 || !before ? data : before);
    const marks: GateMark[] = gates.map((g) => {
      const at = hand.pins[g.key]?.atMs;
      const plannedH = at === undefined ? g.plannedH : at / HOUR_MS;
      return {
        key: g.key,
        plannedH,
        openings: g.openings,
        labelH: g.openedH ?? plannedH,
        hand: hand.pins[g.key] !== undefined,
      };
    });
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
      befores,
      beforeNexts,
    };
  }, [desk, data, before, hand.pins, selected, keys, log, currencies]);

  const groups: FilterGroup[] = [
    {
      id: "currencies",
      heading: "Currencies",
      items: currencies.map((c, i) => ({ id: cid(c), label: c, slot: slotOf(i) })),
    },
    {
      id: "next",
      heading: "Next cost",
      items: keys.map((k, i) => ({
        id: nid(k),
        label: k,
        name: `Next cost of ${k}`,
        slot: slotOf(currencies.length + i),
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

  /** A readout row: now, and against the run before when there is one. */
  const row = (label: string, slot: number, now: Decimal | undefined, then: Decimal | undefined) => ({
    label,
    slot,
    text: figure(now),
    ...(before ? { before: figure(then), delta: signedOrders(orders(now, then)) } : {}),
  });
  const readout1 = (h: number) =>
    (view?.shown ?? []).map((c) =>
      row(
        c,
        slotOf(currencies.indexOf(c)),
        valueAt(view?.medians.get(c) ?? [], h),
        beforeAt(view?.befores.get(c), h),
      ),
    );
  const readout2 = (h: number) =>
    (view?.shownNext ?? []).flatMap((k) => {
      const p = nextAt(view?.nexts.get(k) ?? [], h);
      const b = view?.beforeNexts.get(k);
      return [
        row(`${k} held`, slotOf(currencies.length + keys.indexOf(k)), p?.held, beforeAt(b?.held, h)),
        row(`${k} cost`, slotOf(currencies.length + keys.indexOf(k)), p?.cost, beforeAt(b?.cost, h)),
      ];
    });

  const many = seeds.length > 1;
  const resumed =
    run.resumedFromMs === undefined
      ? ""
      : ` Resumed from the cache at ${(run.resumedFromMs / HOUR_MS).toFixed(1)} h: the hours before it were not replayed.`;
  const basis = many ? `median of ${seeds.length} seeds` : "seed 1";
  const scale = log ? "log₁₀" : "linear";
  const dashed = before ? " · dashed: the run before" : "";
  const against = before ? " The dashed hairline beneath each line is the run before." : "";

  return (
    <div className="desk" data-run={run.phase}>
      <header className="mast">
        <h1 className="mast__name lettering">watchpot sim</h1>
        <p className="mast__currency">
          <span className="lettering">{desk?.currency ?? ""}</span>{" "}
          <span className="num">{figure(view?.main)}</span>
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
            onClick={() => desk && play(desk.seeds.tuning)}
          >
            Run
          </button>
          <button
            type="button"
            className="control"
            disabled={!desk || !online}
            onClick={() => desk && play(desk.seeds.full)}
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
          <div className="main__graphs">
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
              {before && (
                <button type="button" className="control" onClick={() => dispatch({ type: "clearBefore" })}>
                  Clear before
                </button>
              )}
            </div>
            <Graph
              title="Currencies over time"
              caption={`${scale}, ${basis}${dashed}`}
              note={`Played hours along the bottom, ${log ? "log10 of the value" : "the value"} up the side; ${many ? `the median of ${seeds.length} seeds, each seed a hairline` : "seed 1"}. The line is the highest value in each pixel column and the faint band its range. A hairline down the plot is where a gate opened; the chain-line tick at the foot is where it was planned.${resumed}${against}`}
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
                caption={`${scale}, ${basis} · hatched: price above balance${dashed}`}
                note={`The balance that pays for each ticked buyable, and its price. Hatched where the price is above the balance: a long hatched plateau is a stall.${against}`}
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
          </div>
          <div className="main__tables">
            <HourTable columns={view?.columns ?? []} waiting={waiting} />
            <GateTable
              key={epoch}
              gates={view?.gates ?? []}
              pins={hand.pins}
              waiting={waiting}
              onPin={setPin}
            />
          </div>
        </main>
        {desk && (
          <Panel
            knobs={desk.knobs}
            values={hand.knobs}
            tuningFile={tuningFile}
            dirty={dirty}
            saving={saving}
            note={note}
            onKnob={setKnob}
            onReset={resetKnob}
            onSave={save}
            onRevert={revert}
          />
        )}
      </div>
    </div>
  );
}
