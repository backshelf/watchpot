import { useEffect, useId, useState } from "react";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "../../core/time";
import { useClockNow, warpClock } from "../clock";
import { type RuntimeStore, useIdleStore } from "../store";
import s from "./DevPanel.module.css";
import { checkSave, featureJson, featureKeys, jumpToDay, profileDay } from "./devTools";

/** Props of `DevPanel`. */
export interface DevPanelProps {
  /** Closes the panel (the game drops its `#dev` route). Absent, no close button. */
  onClose?: () => void;
}

const WARPS = [
  { label: "+1 min", ms: MINUTE_MS },
  { label: "+1 h", ms: HOUR_MS },
  { label: "+8 h", ms: 8 * HOUR_MS },
  { label: "+1 day", ms: DAY_MS },
] as const;

/**
 * The developer's panel, docked over the game in a development build: time warp, a jump to day N, the state of
 * each feature, and the save as text to read, check, edit and load. It reads the store in context and changes it
 * only through its actions and the clock's offset. The entry exports it through `gate.tsx`, which loads it only in a
 * development build.
 */
export function DevPanel({ onClose }: DevPanelProps) {
  const store = useIdleStore();
  const headingId = useId();
  // The game clock, re-read each second and at once when a warp moves the offset: the day follows it.
  const now = useClockNow(1000);
  const day = profileDay(store);
  return (
    <aside className={s.panel} aria-labelledby={headingId} data-dev-panel="">
      <header className={s.head}>
        <h2 id={headingId} className={s.title}>
          Dev
        </h2>
        <ClockLine now={now} day={day} />
        {onClose && (
          <button type="button" className={s.button} onClick={onClose}>
            Close
          </button>
        )}
      </header>
      <TimeSection store={store} day={day} />
      <StateSection store={store} />
      <SaveSection store={store} />
    </aside>
  );
}

function ClockLine({ now, day }: { now: number; day: number }) {
  return (
    <p className={s.clock}>
      Day <span className={s.num}>{day}</span>
      <span aria-hidden="true" className={s.sep} />
      <time className={s.num} dateTime={new Date(now).toISOString()}>
        {new Date(now).toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" })}
      </time>
    </p>
  );
}

function TimeSection({ store, day }: { store: RuntimeStore; day: number }) {
  const dayId = useId();
  const [wanted, setWanted] = useState(() => String(day + 1));
  const target = Number(wanted);
  const ahead = Number.isFinite(target) && Math.floor(target) > day;
  return (
    <section className={s.section} aria-label="Time">
      <h3 className={s.label}>Time warp</h3>
      <div className={s.row}>
        {WARPS.map((w) => (
          <button key={w.label} type="button" className={s.button} onClick={() => warpClock(store, w.ms)}>
            {w.label}
          </button>
        ))}
      </div>
      <form
        className={s.row}
        onSubmit={(e) => {
          e.preventDefault();
          if (ahead) jumpToDay(store, target);
        }}
      >
        <label className={s.label} htmlFor={dayId}>
          Jump to day
        </label>
        <input
          id={dayId}
          className={s.field}
          type="number"
          inputMode="numeric"
          min={1}
          value={wanted}
          onChange={(e) => setWanted(e.target.value)}
        />
        <button type="submit" className={s.button} disabled={!ahead}>
          Catch up
        </button>
      </form>
    </section>
  );
}

function StateSection({ store }: { store: RuntimeStore }) {
  // Each open feature re-reads on a refresh; a closed one reads nothing.
  const [reads, setReads] = useState(0);
  return (
    <details className={s.section}>
      <summary className={s.label}>State</summary>
      <div className={s.row}>
        <button type="button" className={s.button} onClick={() => setReads((n) => n + 1)}>
          Refresh
        </button>
      </div>
      <ul className={s.features}>
        {featureKeys(store).map((key) => (
          <FeatureRow key={key} store={store} featureKey={key} reads={reads} />
        ))}
      </ul>
    </details>
  );
}

function FeatureRow({
  store,
  featureKey,
  reads,
}: {
  store: RuntimeStore;
  featureKey: string;
  reads: number;
}) {
  const [json, setJson] = useState<string | null>(null);
  const open = json !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `reads` is the refresh's signal
  useEffect(() => {
    if (open) setJson(featureJson(store, featureKey));
  }, [reads]);
  return (
    <li>
      <details
        onToggle={(e) => setJson(e.currentTarget.open ? featureJson(store, featureKey) : null)}
        className={s.feature}
      >
        <summary className={s.key}>{featureKey}</summary>
        {json !== null && <pre className={s.json}>{json}</pre>}
      </details>
    </li>
  );
}

type SaveNote = { tone: "ok" | "bad"; text: string } | null;

function SaveSection({ store }: { store: RuntimeStore }) {
  const fieldId = useId();
  const [text, setText] = useState("");
  const [note, setNote] = useState<SaveNote>(null);

  const read = () => {
    try {
      setText(store.getState().exportProfile());
      setNote({ tone: "ok", text: "Read the save." });
    } catch (error) {
      setNote({ tone: "bad", text: `Could not read the save: ${String(error)}` });
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNote({ tone: "ok", text: "Copied." });
    } catch {
      setNote({ tone: "bad", text: "The clipboard said no. Select the text and copy it." });
    }
  };
  const check = () => {
    const found = checkSave(store, text);
    setNote(
      found.ok
        ? { tone: "ok", text: `Reads as version ${found.version}.` }
        : { tone: "bad", text: `Will not load: ${found.reason}.` },
    );
  };
  const load = () => {
    const found = checkSave(store, text);
    if (!found.ok) {
      setNote({ tone: "bad", text: `Will not load: ${found.reason}.` });
      return;
    }
    try {
      store.getState().importProfile(text);
      setNote({ tone: "ok", text: "Loaded." });
    } catch (error) {
      setNote({ tone: "bad", text: `Load failed: ${String(error)}` });
    }
  };

  return (
    <details className={s.section}>
      <summary className={s.label}>Save</summary>
      <label className={s.label} htmlFor={fieldId}>
        Export, edit, or paste one to import
      </label>
      <textarea
        id={fieldId}
        className={s.text}
        rows={6}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setNote(null);
        }}
      />
      <div className={s.row}>
        <button type="button" className={s.button} onClick={read}>
          Export
        </button>
        <button type="button" className={s.button} disabled={text === ""} onClick={() => void copy()}>
          Copy
        </button>
        <button type="button" className={s.button} disabled={text === ""} onClick={check}>
          Check
        </button>
        <button type="button" className={s.button} disabled={text === ""} onClick={load}>
          Import
        </button>
      </div>
      <p className={s.note} role="status" data-tone={note?.tone}>
        {note?.text}
      </p>
    </details>
  );
}
