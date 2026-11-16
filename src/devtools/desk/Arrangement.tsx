/**
 * The arrangement: the game's numbers that have a place in a grid, one table per group (a score's sections by its
 * stems), each cell a small level; and each loaded pack's tempo and key, changed through the sample host when it can
 * retune.
 */
import { useState } from "react";
import type { DeskPack, DeskTunable } from "../../sound/desk";
import s from "../SoundDesk.module.css";
import { useDesk, useView } from "./context";
import { tip, ValueField } from "./controls";
import { KeyPip, useKey } from "./layered";
import { tuneKey } from "./model";
import { tunableHint, useTunable } from "./Tunables";

interface Grid {
  group: string;
  rows: string[];
  columns: string[];
  cells: Map<string, DeskTunable>;
}

function gridsOf(tunables: readonly DeskTunable[]): Grid[] {
  const grids = new Map<string, Grid>();
  for (const t of tunables) {
    if (!t.cell) continue;
    let g = grids.get(t.group);
    if (!g) {
      g = { group: t.group, rows: [], columns: [], cells: new Map() };
      grids.set(t.group, g);
    }
    if (!g.rows.includes(t.cell.row)) g.rows.push(t.cell.row);
    if (!g.columns.includes(t.cell.column)) g.columns.push(t.cell.column);
    g.cells.set(`${t.cell.row}\n${t.cell.column}`, t);
  }
  return [...grids.values()];
}

export function Arrangement() {
  const { snap } = useView();
  const grids = gridsOf(snap.tunables);
  return (
    <div className={s.arrangement}>
      {grids.length === 0 && snap.packs.length === 0 && (
        <p className={s.empty}>
          Nothing to arrange yet. A tunable with a <code>cell</code> is drawn here in its group's grid, and a
          pack appears once it has loaded.
        </p>
      )}
      {grids.map((g) => (
        <section key={g.group} className={s.gridBlock} aria-label={g.group}>
          <h3 className={s.blockTitle}>{g.group}</h3>
          <table className={s.grid}>
            <thead>
              <tr>
                <td />
                {g.columns.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r}>
                  <th scope="row">{r}</th>
                  {g.columns.map((c) => {
                    const t = g.cells.get(`${r}\n${c}`);
                    return <td key={c}>{t ? <Cell t={t} /> : null}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {snap.packs.length > 0 && (
        <section className={s.gridBlock} aria-label="Packs">
          <h3 className={s.blockTitle}>Packs</h3>
          <div className={s.packs}>
            {snap.packs.map((p) => (
              <Pack key={p.name} pack={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Cell({ t }: { t: DeskTunable }) {
  const { scale, format, parse } = useTunable(t);
  const key = useKey(tuneKey(t.id), t.initial);
  const info = key.info(t.label, format, tunableHint(t, format));
  return (
    <span className={s.cell}>
      <ValueField
        value={key.shown}
        format={format}
        parse={parse}
        onCommit={key.write}
        onReset={key.reset}
        scale={scale}
        bar
        label={t.label}
        info={info}
        tone={key.wear.tone}
        says={key.says}
        shadowed={key.shadowed}
      />
      <KeyPip k={key} label={t.label} />
    </span>
  );
}

function Pack({ pack }: { pack: DeskPack }) {
  const { host, note } = useDesk();
  const [tempo, setTempo] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const retune = host?.retune?.bind(host);
  const nextTempo = tempo === null ? undefined : Number(tempo);
  const tempoOk =
    nextTempo === undefined || (Number.isFinite(nextTempo) && nextTempo >= 20 && nextTempo <= 400);
  const changed =
    (nextTempo !== undefined && nextTempo !== pack.tempo) ||
    (key !== null && key.trim() !== (pack.key ?? ""));
  const apply = async () => {
    if (!retune || !host || !changed || !tempoOk || busy) return;
    setBusy(true);
    note(null);
    try {
      const to = {
        ...(nextTempo !== undefined && nextTempo !== pack.tempo ? { tempo: nextTempo } : {}),
        ...(key !== null && key.trim() !== (pack.key ?? "") ? { key: key.trim() } : {}),
      };
      const loops = await retune(pack.name, to);
      // A retuned loop cannot be heard against the old clock, so it is written at once.
      if (loops.length) await host.commit(loops.map((each) => each.token));
      setTempo(null);
      setKey(null);
      note({
        tone: "warn",
        text: `${pack.name} is retuned${loops.length ? ` (${loops.length} loops rebuilt)` : ""} and written. Reload the game to hear it.`,
      });
    } catch (error) {
      note({
        tone: "bad",
        text: `Retuning ${pack.name} failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setBusy(false);
    }
  };
  const fixed = retune ? undefined : "The sample host cannot retune a pack: shown, not changed";
  return (
    <form
      className={s.pack}
      aria-label={`Pack ${pack.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        void apply();
      }}
    >
      <span className={s.packName}>{pack.name}</span>
      <label
        className={s.packField}
        {...tip(fixed ?? "The tempo every loop in the pack is cut to, in beats a minute")}
      >
        <span className={s.mini}>tempo</span>
        <input
          className={s.text}
          type="text"
          inputMode="decimal"
          aria-label={`${pack.name} tempo`}
          aria-invalid={!tempoOk}
          readOnly={!retune}
          placeholder="none"
          value={tempo ?? (pack.tempo === undefined ? "" : String(pack.tempo))}
          onChange={(e) => setTempo(e.target.value)}
        />
      </label>
      <label className={s.packField} {...tip(fixed ?? 'The pack\'s key, as a note name ("C", "Am")')}>
        <span className={s.mini}>key</span>
        <input
          className={s.text}
          type="text"
          aria-label={`${pack.name} key`}
          readOnly={!retune}
          placeholder="none"
          value={key ?? pack.key ?? ""}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      {retune && (
        <button
          type="submit"
          className={s.button}
          disabled={!changed || !tempoOk || busy}
          {...tip(
            "Rebuild the pack's loops at the new tempo and write them now. The game must be reloaded to hear it",
          )}
        >
          {busy ? "Retuning" : "Retune"}
        </button>
      )}
    </form>
  );
}
