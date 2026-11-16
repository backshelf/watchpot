/**
 * The selected source: its own strip at full width (where its audio goes, its trim, its sends, mute, solo, audition),
 * its takes (each a place to drop a recording, with what was there to compare against, its level and weight), and the
 * edit of one sample (its waveform with the part that is kept, fades, pitch, reverse; a loop's tempo and bars).
 */
import { type DragEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeskChannel, DeskSample, SampleSource } from "../../sound/desk";
import type { Take } from "../../sound/types";
import s from "../SoundDesk.module.css";
import { useDesk, useView } from "./context";
import { CloseIcon, IconButton, Picker, PlayIcon, Segmented, Toggle, tip, ValueField } from "./controls";
import { dbText, ParamRow, Params, parseDb, parseSend, SEND, sendText, TRIM } from "./layered";
import { chKey, chSendKey, cueKeyOf, MASTER, pressSolo } from "./model";
import { sourceName } from "./Sources";
import {
  addTake,
  discard,
  guessLoop,
  messageOf,
  type Peaks,
  peaksOf,
  removeTake,
  replaceSample,
  restage,
  type SampleDraft,
  setTake,
  tidyEdit,
} from "./samples";
import { dbScale, fmtDb, fmtValue, linScale, parseValue } from "./scale";
import { Waveform } from "./Waveform";

const TAKE_LEVEL = dbScale(-36, 12);
const WEIGHT = linScale(0, 10, 0.1);
const PITCH = linScale(-24, 24, 0.1);
const BPM = linScale(20, 400, 0.01);
const BARS = linScale(1, 64, 1);
/** The level a send the desk adds to a source starts at: a send of nothing is no send. */
const NEW_SEND = 0.25;

const fmtSeconds = (v: number) => fmtValue(v, "s");
const parseSeconds = (text: string) => parseValue(text, "s");
const plain = (unit: string, digits: number) => (v: number) =>
  `${Number(v.toFixed(digits))}${unit ? ` ${unit}` : ""}`;
const parsePlain = (text: string) => parseValue(text, "");

export function SourceDetail({ channel }: { channel: DeskChannel }) {
  const { snap } = useView();
  const isCue = channel.kind === "cue";
  const cue = isCue ? cueKeyOf(channel) : undefined;
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [rev, setRev] = useState(0);
  const bump = useCallback(() => setRev((n) => n + 1), []);
  const sampleKey = picked !== undefined && channel.samples.includes(picked) ? picked : channel.samples[0];
  const sample = sampleKey === undefined ? undefined : snap.samples.find((each) => each.key === sampleKey);
  return (
    <div className={s.sourceDetail}>
      <SourceStrip channel={channel} />
      {channel.samples.length === 0 && !isCue ? (
        <p className={s.empty}>
          {sourceName(channel)} plays no sample of a pack: there is nothing to replace or edit here.
        </p>
      ) : (
        <>
          <TakeList channel={channel} cue={cue} picked={sampleKey} onPick={setPicked} onChange={bump} />
          {sampleKey !== undefined && (
            <SampleEditor key={sampleKey} sampleKey={sampleKey} sample={sample} rev={rev} />
          )}
        </>
      )}
    </div>
  );
}

/** The source's own strip: what its row in the browser holds, with whole names and its sends. */
function SourceStrip({ channel: c }: { channel: DeskChannel }) {
  const { desk, snap, edit, note } = useDesk();
  const view = useView();
  const name = sourceName(c);
  const isRole = c.role !== undefined;
  const roles = view.snap.channels.filter((each) => each.parent === c.id).length;
  const buses = view.snap.buses.map((b) => b.name).filter((b) => b !== MASTER);
  const free = buses.filter((b) => b !== c.bus && !c.sends.some((send) => send.to === b));
  const reach = isRole
    ? "What is written here reaches this role alone, on top of its cue's."
    : roles > 1
      ? `What is written here reaches all ${roles} roles of this cue.`
      : undefined;
  return (
    <section className={s.device} data-kind="track" aria-label={`${name} source`}>
      <header className={s.deviceHead}>
        <span className={s.kindTag}>{c.kind}</span>
        <h3 className={s.deviceName} title={c.id}>
          {name}
        </h3>
        <span className={s.deviceTools}>
          <Toggle
            kind="mute"
            on={c.muted}
            label={`Mute ${name} (detail)`}
            onPress={() => desk.mute(c.id, !c.muted)}
          />
          <Toggle
            kind="solo"
            on={c.soloed}
            label={`Solo ${name} (detail)`}
            title={`Solo ${name} alone; Ctrl-click adds it to the solos`}
            onPress={(e: MouseEvent) => pressSolo(desk, snap.current, c.id, e.ctrlKey || e.metaKey)}
          />
          {c.kind === "cue" && (
            <button
              type="button"
              className={s.play}
              aria-label={`Audition ${name} (detail)`}
              {...tip(`Play ${name} once`)}
              onClick={() => desk.audition(c.id)}
            >
              <PlayIcon />
            </button>
          )}
        </span>
      </header>
      {reach && <p className={s.reach}>{reach}</p>}
      <Params>
        <div className={s.row} data-choice="">
          <span className={s.rowName}>audio to</span>
          <span className={s.rowWide}>
            <Picker
              label="Source audio to"
              value={c.route ?? ""}
              tone={c.route !== undefined ? "live" : undefined}
              options={[
                { value: "", label: `As the game says${c.bus ? ` (${c.bus})` : ""}` },
                ...buses.map((b) => ({ value: b, label: b })),
                { value: MASTER, label: MASTER },
              ]}
              info={`Where ${name} plays: where its plays ask, or a bus chosen here (the same in every scene)`}
              onChange={(to) => {
                if (!desk.route(c.id, to === "" ? undefined : to))
                  note({ tone: "warn", text: `Could not route ${name} to ${to || "where the game says"}.` });
              }}
            />
          </span>
        </div>
        <ParamRow
          k={chKey(c.id)}
          name="trim"
          label="Source trim"
          scale={TRIM}
          format={dbText}
          parse={parseDb}
          fallback={0}
          mark={0}
          hint={reach}
        />
        {c.sends.map((send) => (
          <ParamRow
            key={send.to}
            k={chSendKey(c.id, send.to)}
            name={`to ${send.to}`}
            label={`Source send to ${send.to}`}
            scale={SEND}
            format={sendText}
            parse={parseSend}
            fallback={send.level}
            mark={1}
            hint="A source's own send, heard from its next play."
          />
        ))}
        {c.kind === "cue" && c.sends.length < 2 && free.length > 0 && (
          <div className={s.row} data-add="">
            <Picker
              label="Add a source send"
              look="button"
              value=""
              face="+ send"
              options={[
                { value: "", label: "Send to…", disabled: true },
                ...free.map((to) => ({ value: to, label: to })),
              ]}
              info={`Add a send of ${name}'s own into a bus (two at most), heard from its next play`}
              onChange={(to) => {
                if (to) desk.set(edit.current, chSendKey(c.id, to), NEW_SEND);
              }}
            />
          </div>
        )}
      </Params>
    </section>
  );
}

function TakeList({
  channel,
  cue,
  picked,
  onPick,
  onChange,
}: {
  channel: DeskChannel;
  cue: string | undefined;
  picked: string | undefined;
  onPick: (key: string) => void;
  onChange: () => void;
}) {
  const { desk, host, files, drafts, pending, stagedWith, note } = useDesk();
  const { snap } = useView();
  const root = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [over, setOver] = useState<string | null>(null);
  const takes = cue !== undefined ? desk.takes(cue) : null;
  const rows: { take?: Take; index: number; key: string }[] = takes
    ? takes.takes.map((take, index) => ({ take, index, key: take.sample }))
    : channel.samples.map((key, index) => ({ index, key }));
  const sampleOf = (key: string) => snap.samples.find((each) => each.key === key);

  const run = async (id: string, what: string, job: () => Promise<unknown>) => {
    setBusy((prev) => new Set(prev).add(id));
    note(null);
    try {
      await job();
      onChange();
    } catch (error) {
      note({ tone: "bad", text: `${what} failed: ${messageOf(error)}. Nothing was changed.` });
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };
  const replace = (key: string, file: File | undefined) => {
    if (!host || !file) return;
    const kind = sampleOf(key)?.entry.kind ?? (channel.kind === "stem" ? "loop" : "shot");
    void run(key, `Replacing ${key}`, async () => {
      // A new recording starts with no edit (the one set for the old does not fit it); a loop starts with the tempo
      // and bars its file says, since one cut at another tempo than the pack's is refused until it says so.
      const draft: SampleDraft = { edit: {} };
      if (kind === "loop") {
        const win = root.current?.ownerDocument.defaultView ?? window;
        const drawn = await peaksOf(win, await file.arrayBuffer(), 1).catch(() => null);
        const packTempo = desk.packs().find((pack) => pack.name === key.slice(0, key.indexOf("/")))?.tempo;
        Object.assign(draft, guessLoop(file.name, drawn?.seconds, packTempo));
      }
      const read =
        draft.bpm === undefined
          ? ""
          : ` (read as ${draft.bpm} bpm${draft.bars === undefined ? "" : `, ${draft.bars} bars`})`;
      try {
        await replaceSample({ desk, host, files }, key, kind, file, draft);
      } catch (error) {
        // Refused as it stands: held in the editor, where its tempo, bars or trim can be set and it is run again.
        pending.set(key, file);
        drafts.set(key, draft);
        onPick(key);
        note({
          tone: "warn",
          text: `${file.name} is not playing yet${read}: ${messageOf(error)}. Set its ${kind === "loop" ? "source tempo, bars or " : ""}start and end below, then Apply.`,
        });
        return;
      }
      pending.delete(key);
      drafts.delete(key);
      stagedWith.set(key, draft);
      onPick(key);
      note({
        tone: "ok",
        text: `${key} now plays ${file.name}${read}: staged, and written into the pack on Save.`,
      });
    });
  };
  const add = (file: File | undefined) => {
    if (!host || !file || cue === undefined) return;
    void run("+", `Adding a take to ${cue}`, async () => {
      const key = await addTake({ desk, host, files }, cue, file);
      onPick(key);
      note({ tone: "ok", text: `${cue} has a new take, ${key}: staged, and written into the pack on Save.` });
    });
  };
  const dropOn = (id: string, act: (file: File | undefined) => void) =>
    host
      ? {
          "data-over": over === id || undefined,
          onDragOver: (e: DragEvent) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            if (over !== id) setOver(id);
          },
          onDragLeave: () => setOver((now) => (now === id ? null : now)),
          onDrop: (e: DragEvent) => {
            setOver(null);
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            e.stopPropagation();
            act(e.dataTransfer.files[0]);
          },
        }
      : {};

  return (
    <section ref={root} className={s.takes} aria-label={takes ? "Takes" : "Sample"}>
      <header className={s.takesHead}>
        <h3 className={s.blockTitle}>{takes ? "Takes" : "Loop"}</h3>
        {channel.role !== undefined && <span className={s.hintText}>The cue's: every role plays them.</span>}
        {takes?.replaced && cue !== undefined && host && (
          <button
            type="button"
            className={s.button}
            {...tip("Back to the takes the code declares")}
            onClick={() => desk.setTakes(cue, undefined)}
          >
            Declared takes
          </button>
        )}
        {!host && <span className={s.hintText}>No sample host: shown, not changed.</span>}
      </header>
      <ul className={s.takeRows}>
        {rows.map(({ take, index, key }) => {
          const sample = sampleOf(key);
          const fresh = snap.staged.find((each) => each.key === key)?.fresh === true;
          const working = busy.has(key);
          return (
            <li
              key={`${index}:${key}`}
              className={s.take}
              data-picked={picked === key || undefined}
              data-staged={sample?.staged || undefined}
              data-busy={working || undefined}
              {...dropOn(key, (file) => replace(key, file))}
            >
              <button
                type="button"
                className={s.takeName}
                aria-pressed={picked === key}
                {...tip(
                  `${key}${sample ? "" : " (not in a loaded pack)"}: show its edit${host ? ". Drop a recording on this row to replace it" : ""}`,
                )}
                onClick={() => onPick(key)}
              >
                {key}
              </button>
              {take && cue !== undefined && (
                <>
                  <span className={s.takeField} {...tip("This take's level on top of the cue's, in dB")}>
                    <span className={s.mini}>level</span>
                    <ValueField
                      value={take.level ?? 0}
                      format={fmtDb}
                      parse={parseDb}
                      onCommit={(v) => setTake(desk, cue, index, { level: v })}
                      onReset={() => setTake(desk, cue, index, { level: 0 })}
                      scale={TAKE_LEVEL}
                      bar
                      lazy
                      readOnly={!host}
                      label={`${key} take level`}
                    />
                  </span>
                  <span
                    className={s.takeField}
                    {...tip("How often a random pick chooses this take against the others (1 is even)")}
                  >
                    <span className={s.mini}>weight</span>
                    <ValueField
                      value={take.weight ?? 1}
                      format={plain("", 1)}
                      parse={parsePlain}
                      onCommit={(v) => setTake(desk, cue, index, { weight: v })}
                      onReset={() => setTake(desk, cue, index, { weight: 1 })}
                      scale={WEIGHT}
                      bar
                      lazy
                      readOnly={!host}
                      label={`${key} take weight`}
                    />
                  </span>
                </>
              )}
              <span className={s.takeState}>
                {working && <span className={s.stagedTag}>processing</span>}
                {!working && sample?.staged && (
                  <>
                    <span
                      className={s.stagedTag}
                      {...tip("Staged: it plays in the game now and is written into the pack on Save")}
                    >
                      {fresh ? "new, staged" : "staged"}
                    </span>
                    {!fresh && (
                      <Segmented
                        label={`${key}: which plays`}
                        value={sample.side}
                        options={[
                          { value: "a", label: "A", hint: "Play what the pack has" },
                          { value: "b", label: "B", hint: "Play the new recording" },
                        ]}
                        onChange={(side) => desk.ab(key, side as "a" | "b")}
                      />
                    )}
                    <button
                      type="button"
                      className={s.button}
                      {...tip(
                        fresh
                          ? "Drop this recording and the take that plays it"
                          : "Drop the new recording: the pack's own plays again",
                      )}
                      onClick={() => {
                        discard({ desk, files }, key);
                        drafts.delete(key);
                        pending.delete(key);
                        stagedWith.delete(key);
                        onChange();
                      }}
                    >
                      Discard
                    </button>
                  </>
                )}
              </span>
              {host && (
                <FileButton
                  label={`Replace ${key} with a file`}
                  text="Replace"
                  onFile={(file) => replace(key, file)}
                />
              )}
              {take && cue !== undefined && host && (
                <IconButton
                  label={`Remove take ${key}`}
                  disabled={rows.length < 2}
                  info={rows.length < 2 ? "A cue keeps at least one take" : `Take ${key} off this cue`}
                  onPress={() => {
                    removeTake({ desk, files }, cue, index);
                    onChange();
                  }}
                >
                  <CloseIcon />
                </IconButton>
              )}
            </li>
          );
        })}
        {takes && cue !== undefined && host && (
          <li className={s.take} data-add="" data-busy={busy.has("+") || undefined} {...dropOn("+", add)}>
            <span className={s.hintText}>
              {busy.has("+") ? "Processing the new take" : "Drop a recording here for a new take, or"}
            </span>
            <FileButton label="Add a take from a file" text="Choose a file" onFile={add} />
          </li>
        )}
      </ul>
    </section>
  );
}

/** A button that opens the platform's file chooser. */
function FileButton({
  label,
  text,
  onFile,
}: {
  label: string;
  text: string;
  onFile: (file: File | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className={s.button}
        aria-label={label}
        {...tip(label)}
        onClick={() => input.current?.click()}
      >
        {text}
      </button>
      <input
        ref={input}
        className={s.fileInput}
        type="file"
        accept="audio/*,.wav,.flac,.aif,.aiff,.mp3,.ogg,.opus,.m4a"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}

const draftOf = (source: SampleSource): SampleDraft => ({
  edit: { ...source.edit },
  ...(source.bpm !== undefined ? { bpm: source.bpm } : {}),
  ...(source.bars !== undefined ? { bars: source.bars } : {}),
});
const sameDraft = (a: SampleDraft, b: SampleDraft, seconds: number) =>
  JSON.stringify({ ...a, edit: tidyEdit(a.edit, seconds) }) ===
  JSON.stringify({ ...b, edit: tidyEdit(b.edit, seconds) });

/** One sample's edit: its source drawn, the part that is kept, fades, pitch, reverse, and a loop's tempo and bars. */
function SampleEditor({
  sampleKey,
  sample,
  rev,
}: {
  sampleKey: string;
  sample: DeskSample | undefined;
  /** Counts what the takes did (a drop, a discard): the source is read again. */
  rev: number;
}) {
  const { desk, host, files, drafts, pending, stagedWith, note } = useDesk();
  const box = useRef<HTMLElement>(null);
  /** Counts a held file being let go: the source is read again. */
  const [forgot, setForgot] = useState(0);
  /** A file dropped on this sample that the pipeline refused as it stood: drawn here, not playing yet. */
  const held = pending.get(sampleKey);
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  const [source, setSource] = useState<SampleSource>({});
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const [draft, setDraftState] = useState<SampleDraft>(() => drafts.get(sampleKey) ?? { edit: {} });
  const [applied, setApplied] = useState<SampleDraft>({ edit: {} });
  const [busy, setBusy] = useState(false);
  const pack = sampleKey.slice(0, sampleKey.indexOf("/"));
  const name = sampleKey.slice(sampleKey.indexOf("/") + 1);
  const entry = sample?.entry;
  const url = sample?.url;
  const inPack = url !== undefined;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` and `forgot` say the file in hand or the staging changed
  useEffect(() => {
    let live = true;
    const win = box.current?.ownerDocument.defaultView ?? window;
    setState("loading");
    (async () => {
      const waiting = pending.get(sampleKey);
      const file = waiting ?? files.get(sampleKey);
      let audio: ArrayBuffer | undefined;
      let said: SampleSource = {};
      if (file) audio = await file.arrayBuffer();
      else if (host && inPack) {
        const { audio: kept, ...rest } = await host.describe(pack, name);
        audio = kept;
        said = rest;
      } else if (url !== undefined) {
        // With no host there is no kept source to ask for: the pack's own file is drawn, to look at.
        audio = await (await win.fetch(url)).arrayBuffer();
      }
      const drawn = audio ? await peaksOf(win, audio) : null;
      if (!live) return;
      // What "no change" is: what the staged recording was run with; for a held file, nothing yet; else the source's.
      const first: SampleDraft = waiting
        ? { edit: {} }
        : (stagedWith.get(sampleKey) ?? (file ? { edit: {} } : draftOf(said)));
      setSource(said);
      setApplied(first);
      setDraftState(drafts.get(sampleKey) ?? first);
      setPeaks(drawn);
      setState(drawn ? "ready" : "none");
    })().catch(() => {
      if (!live) return;
      setPeaks(null);
      setState("none");
    });
    return () => {
      live = false;
    };
  }, [sampleKey, host, files, drafts, pending, stagedWith, inPack, url, pack, name, rev, forgot]);

  const seconds = peaks?.seconds ?? entry?.seconds ?? 0;
  const time = useMemo(() => linScale(0, Math.max(0.001, seconds), 0.001), [seconds]);
  const fade = useMemo(() => linScale(0, Math.max(0.001, Math.min(seconds, 5)), 0.001), [seconds]);
  const edit = draft.edit;
  const start = edit.start ?? 0;
  const end = Math.min(seconds, edit.end ?? seconds);
  const change = (patch: Partial<SampleDraft["edit"]>, rest: Partial<SampleDraft> = {}) => {
    const next: SampleDraft = { ...draft, ...rest, edit: { ...draft.edit, ...patch } };
    drafts.set(sampleKey, next);
    setDraftState(next);
  };
  const dirty = !sameDraft(draft, applied, seconds);
  const isLoop = entry?.kind === "loop";
  /** The pack's tempo: what a loop with no tempo of its own is taken to be cut at. */
  const packTempo = desk.packs().find((each) => each.name === pack)?.tempo;
  const canEdit = host !== undefined && state !== "loading" && (peaks !== null || inPack);
  const apply = async () => {
    if (!host || busy) return;
    setBusy(true);
    note(null);
    try {
      const next: SampleDraft = { ...draft, edit: tidyEdit(draft.edit, seconds) };
      await restage({ desk, host, files }, sampleKey, entry?.kind ?? "shot", next, source, held);
      // A held file that went through is the file in hand from here.
      if (held) {
        files.set(sampleKey, held);
        pending.delete(sampleKey);
      }
      stagedWith.set(sampleKey, draft);
      setApplied(draft);
      note({
        tone: "ok",
        text: `${sampleKey} is staged with its edit: it plays in the game now. Save writes it.`,
      });
    } catch (error) {
      note({ tone: "bad", text: `Editing ${sampleKey} failed: ${messageOf(error)}. Nothing was changed.` });
    } finally {
      setBusy(false);
    }
  };
  const field = (
    label: string,
    value: number,
    scale: typeof time,
    format: (v: number) => string,
    parse: (text: string) => number | null,
    set: (v: number) => void,
    reset: number,
    hint: string,
  ) => (
    <span className={s.editField} {...tip(hint)}>
      <span className={s.mini}>{label}</span>
      <ValueField
        value={value}
        format={format}
        parse={parse}
        onCommit={set}
        onReset={() => set(reset)}
        scale={scale}
        bar
        readOnly={!canEdit}
        label={`${sampleKey} ${label}`}
      />
    </span>
  );

  return (
    <section ref={box} className={s.editor} aria-label={`Sample ${sampleKey}`}>
      <header className={s.takesHead}>
        <h3 className={s.blockTitle}>{sampleKey}</h3>
        {entry && (
          <span className={s.stats}>
            <span>{entry.kind}</span>
            <span>{fmtSeconds(entry.seconds)}</span>
            <span>{fmtDb(entry.lufs)} LUFS</span>
            <span>peak {fmtDb(20 * Math.log10(Math.max(1e-6, entry.peak)))}</span>
            {entry.bars !== undefined && <span>{entry.bars} bars</span>}
            {entry.rootHz !== undefined && <span>root {Math.round(entry.rootHz)} Hz</span>}
            {sample?.staged && (
              <span className={s.stagedTag}>{sample.side === "b" ? "the new one" : "the pack's"}</span>
            )}
          </span>
        )}
      </header>
      {held && (
        <p className={s.hintText} role="status">
          {held.name} is not playing yet: the pipeline refused it as it stood.
          {isLoop
            ? " Set its source tempo and its bars, or trim it to whole bars, then Apply. "
            : " Set where it starts and ends, then Apply. "}
          <button
            type="button"
            className={s.button}
            {...tip("Let this file go: the sample is as it was")}
            onClick={() => {
              pending.delete(sampleKey);
              drafts.delete(sampleKey);
              setForgot((n) => n + 1);
            }}
          >
            Forget this file
          </button>
        </p>
      )}
      <div className={s.waveBox}>
        <Waveform
          peaks={peaks}
          seconds={seconds}
          start={start}
          end={end}
          fadeIn={edit.fadeIn ?? 0}
          fadeOut={edit.fadeOut ?? 0}
          onChange={canEdit ? (patch) => change(patch) : undefined}
        />
        {state !== "ready" && (
          <span className={s.waveNote}>
            {state === "loading"
              ? "Reading the source"
              : host
                ? "The source could not be drawn here; the values still apply."
                : "The sample could not be drawn here."}
          </span>
        )}
      </div>
      <div className={s.editFields}>
        {field(
          "start",
          start,
          time,
          fmtSeconds,
          parseSeconds,
          (v) => change({ start: Math.min(v, end) }),
          0,
          "Where the kept part starts in the source",
        )}
        {field(
          "end",
          end,
          time,
          fmtSeconds,
          parseSeconds,
          (v) => change({ end: Math.max(v, start) }),
          seconds,
          "Where the kept part ends in the source",
        )}
        {field(
          "fade in",
          edit.fadeIn ?? 0,
          fade,
          fmtSeconds,
          parseSeconds,
          (v) => change({ fadeIn: v }),
          0,
          "A fade from silence at the start of the kept part",
        )}
        {field(
          "fade out",
          edit.fadeOut ?? 0,
          fade,
          fmtSeconds,
          parseSeconds,
          (v) => change({ fadeOut: v }),
          0,
          "A fade to silence at the end of the kept part",
        )}
        {field(
          "pitch",
          edit.semitones ?? 0,
          PITCH,
          plain("st", 1),
          parsePlain,
          (v) => change({ semitones: v }),
          0,
          "Pitch in semitones; a loop keeps its length",
        )}
        <label className={s.editField} {...tip("Play the kept part backwards")}>
          <span className={s.mini}>reverse</span>
          <input
            className={s.check}
            type="checkbox"
            aria-label={`${sampleKey} reverse`}
            checked={edit.reverse === true}
            disabled={!canEdit}
            onChange={(e) => change({ reverse: e.target.checked })}
          />
        </label>
        {isLoop &&
          field(
            "source tempo",
            draft.bpm ?? source.bpm ?? packTempo ?? 120,
            BPM,
            plain("bpm", 2),
            parsePlain,
            (v) => change({}, { bpm: v }),
            source.bpm ?? packTempo ?? 120,
            "The loop's tempo in its source: it is stretched from there to the pack's",
          )}
        {isLoop &&
          field(
            "bars",
            draft.bars ?? entry?.bars ?? 4,
            BARS,
            plain("bars", 0),
            parsePlain,
            (v) => change({}, { bars: Math.round(v) }),
            entry?.bars ?? 4,
            "The loop's length in bars",
          )}
        {host && (
          <button
            type="button"
            className={s.button}
            data-primary={dirty || held !== undefined || undefined}
            disabled={!canEdit || busy || (!dirty && held === undefined)}
            {...tip(
              "Run the source through the pipeline with this edit and stage the result: it plays in the game at once",
            )}
            onClick={() => void apply()}
          >
            {busy ? "Processing" : "Apply"}
          </button>
        )}
      </div>
    </section>
  );
}
