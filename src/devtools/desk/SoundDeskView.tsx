/**
 * The mix desk itself, drawn into whichever document holds it: `openSoundDesk` mounts it in a window of its own, and
 * a scratch page or a test can draw it inline. Internal to the dev family: a game opens the window.
 *
 * Laid out as a session mixer: a top bar (the layer being edited, the game's switches, undo, the master, Save), the
 * sources in a pane on the left, the tracks as columns, and the detail of what is selected along the bottom. It reads
 * the desk on each change it hears (one `subscribe`) and writes only through the desk's own calls. Meters, loudness
 * and the sources' lights run on the window's animation frame, outside React (`./loop.ts`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Desk, MixFile, SampleHost } from "../../sound/desk";
import type { DeskSwitch } from "../SoundDesk";
import s from "../SoundDesk.module.css";
import { Arrangement } from "./Arrangement";
import { DeskCtx, type DeskCtxValue, type Note, useDesk, ViewCtx } from "./context";
import { CloseIcon, IconButton, Picker, RedoIcon, Splitter, tip, UndoIcon } from "./controls";
import { Devices } from "./Devices";
import { DeskLoop } from "./loop";
import { audibleBuses, editLayers, layerName, MASTER, MIX, snapshot, tracksOf } from "./model";
import { DEFAULT_STORAGE_KEY, readPrefs, writePrefs } from "./prefs";
import { SourceDetail } from "./SourceDetail";
import { SourcesPane, sourceName } from "./Sources";
import { messageOf, type SampleDraft, saveAll } from "./samples";
import { Meter, TracksPane } from "./Tracks";
import { Tunables } from "./Tunables";

export interface SoundDeskViewProps {
  desk: Desk;
  onSave: (file: MixFile) => void | Promise<void>;
  /** Who processes and writes recordings; without one, samples and takes are shown and not changed. */
  samples?: SampleHost;
  /** The game's own switches, in the top bar. */
  switches?: readonly DeskSwitch[];
  title?: string;
  storageKey?: string;
  /** The window it runs in, when its document has none of its own (a test's fake window). */
  win?: Window;
  /** It owns its document: it keeps the document's title, marked while unsaved or soloed. */
  ownsDocument?: boolean;
}

type Tab = "devices" | "source" | "arrangement" | "tunables";
const TABS: readonly Tab[] = ["devices", "source", "arrangement", "tunables"];
const DETAIL = { min: 140, max: 720, start: 250 };
const SOURCES = { min: 220, max: 520, start: 300 };

function useDeskVersion(desk: Desk): number {
  const [version, setVersion] = useState(0);
  useEffect(() => desk.subscribe(() => setVersion((n) => n + 1)), [desk]);
  return version;
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  if (el.tagName === "TEXTAREA" || el.isContentEditable) return true;
  return el.tagName === "INPUT" && (el as HTMLInputElement).type === "text";
};

export function SoundDeskView({
  desk,
  onSave,
  samples: host,
  switches,
  title = "Mix desk",
  storageKey = DEFAULT_STORAGE_KEY,
  win: givenWin,
  ownsDocument = false,
}: SoundDeskViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLSpanElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const [prefs] = useState(() => readPrefs(storageKey));
  const [seenStored, setSeenStored] = useState<readonly string[]>(prefs.seen);
  const [folded, setFolded] = useState(() => new Set(prefs.folded));
  const [track, setTrack] = useState(prefs.selected);
  const [source, setSource] = useState(prefs.source);
  const [tab, setTab] = useState<Tab>(TABS.includes(prefs.tab as Tab) ? (prefs.tab as Tab) : "devices");
  // Until a person sizes it, the detail takes a third of the window it opens in.
  const [detailH, setDetailH] = useState(() => {
    const tall = (givenWin ?? globalThis.window)?.innerHeight;
    return (
      prefs.detail ?? (tall ? Math.round(Math.min(420, Math.max(DETAIL.start, tall * 0.34))) : DETAIL.start)
    );
  });
  const [sourcesW, setSourcesW] = useState(prefs.sources ?? SOURCES.start);
  const [editAsked, setEdit] = useState(MIX);
  const version = useDeskVersion(desk);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` is the desk's change signal
  const snap = useMemo(() => snapshot(desk, seenStored), [desk, version, seenStored]);
  const loop = useMemo(() => new DeskLoop(desk), [desk]);
  const [note, setNote] = useState<Note>(null);
  const [saving, setSaving] = useState(false);
  const [files] = useState(() => new Map<string, File>());
  const [drafts] = useState(() => new Map<string, SampleDraft>());
  const [pending] = useState(() => new Map<string, File>());
  const [stagedWith] = useState(() => new Map<string, SampleDraft>());

  // A layer that is no longer a scene that may be named falls back to the mix.
  const edit = layerName(editAsked, snap) !== null ? editAsked : MIX;
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const editRef = useRef(edit);
  editRef.current = edit;

  const winOf = useCallback(
    () => givenWin ?? rootRef.current?.ownerDocument.defaultView ?? window,
    [givenWin],
  );

  // A scene in force is heard: from now on it may be named, here and in later sessions.
  useEffect(() => {
    if (snap.seen.length === seenStored.length) return;
    setSeenStored(snap.seen);
    writePrefs(storageKey, { seen: [...snap.seen] });
  }, [snap.seen, seenStored.length, storageKey]);

  useEffect(() => {
    const w = winOf();
    loop.start(w);
    return () => loop.stop();
  }, [loop, winOf]);

  const unsaved = snap.dirty || snap.staged.length > 0;
  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setNote(null);
    try {
      const done = await saveAll(desk, host, onSave, files);
      const wrote = done.samples
        ? ` ${done.samples} ${done.samples === 1 ? "sample" : "samples"} written.`
        : "";
      setNote(
        done.moved
          ? { tone: "warn", text: `Saved, but something moved while it saved: save again.${wrote}` }
          : { tone: "ok", text: `Saved.${wrote}` },
      );
    } catch (error) {
      setNote({
        tone: "bad",
        text: `Save failed: ${messageOf(error)}. Nothing is marked saved; the changes are still on the desk.`,
      });
    } finally {
      setSaving(false);
    }
  }, [desk, host, onSave, files, saving]);
  const saveRef = useRef(save);
  saveRef.current = save;

  // Keys anywhere in the desk's document: Escape clears every mute and solo, Ctrl+S saves, Ctrl+Z and Ctrl+Shift+Z
  // (or Ctrl+Y) undo and redo, "/" finds a source. A file dropped beside a target must not navigate the window away.
  useEffect(() => {
    const doc = rootRef.current?.ownerDocument;
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (e.key === "Escape" && !isTyping(e.target) && !mod && !e.altKey) desk.clearListening();
      else if (mod && key === "s") {
        e.preventDefault();
        void saveRef.current();
      } else if (mod && !e.altKey && (key === "z" || key === "y") && !isTyping(e.target)) {
        e.preventDefault();
        if (key === "y" || e.shiftKey) desk.redo();
        else desk.undo();
      } else if (e.key === "/" && !isTyping(e.target) && !mod) {
        e.preventDefault();
        filterRef.current?.focus();
      }
    };
    const stay = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    doc.addEventListener("keydown", onKey);
    doc.addEventListener("dragover", stay);
    doc.addEventListener("drop", stay);
    return () => {
      doc.removeEventListener("keydown", onKey);
      doc.removeEventListener("dragover", stay);
      doc.removeEventListener("drop", stay);
    };
  }, [desk]);

  // Closing the window with unsaved changes asks first.
  useEffect(() => {
    const w = winOf();
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!desk.dirty() && desk.staged().length === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    w.addEventListener("beforeunload", onLeave);
    return () => w.removeEventListener("beforeunload", onLeave);
  }, [desk, winOf]);

  const listening = snap.solos + snap.mutes > 0;
  useEffect(() => {
    if (!ownsDocument) return;
    const doc = rootRef.current?.ownerDocument;
    if (!doc) return;
    const marks = [snap.solos ? "SOLO" : "", snap.mutes ? "MUTE" : "", unsaved ? "unsaved" : ""].filter(
      Boolean,
    );
    doc.title = marks.length ? `${marks.join(" · ")} | ${title}` : title;
  }, [ownsDocument, snap.solos, snap.mutes, unsaved, title]);

  const toggleFold = useCallback(
    (key: string) =>
      setFolded((prev) => {
        const next = new Set(prev);
        if (!next.delete(key)) next.add(key);
        writePrefs(storageKey, { folded: [...next] });
        return next;
      }),
    [storageKey],
  );
  const openTab = useCallback(
    (next: Tab) => {
      setTab(next);
      writePrefs(storageKey, { tab: next });
    },
    [storageKey],
  );
  const selectTrack = useCallback(
    (bus: string) => {
      setTrack(bus);
      setTab("devices");
      writePrefs(storageKey, { selected: bus, tab: "devices" });
    },
    [storageKey],
  );
  const selectSource = useCallback(
    (id: string) => {
      setSource(id);
      setTab("source");
      writePrefs(storageKey, { source: id, tab: "source" });
    },
    [storageKey],
  );
  const ctx = useMemo<DeskCtxValue>(
    () => ({
      desk,
      loop,
      host,
      snap: snapRef,
      edit: editRef,
      note: setNote,
      selectTrack,
      selectSource,
      files,
      drafts,
      pending,
      stagedWith,
    }),
    [desk, loop, host, selectTrack, selectSource, files, drafts, pending, stagedWith],
  );
  const view = useMemo(() => ({ snap, edit }), [snap, edit]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the snapshot stands for every desk read
  const tracks = useMemo(() => tracksOf(desk, snap), [snap]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the snapshot stands for every desk read
  const audible = useMemo(() => audibleBuses(desk, snap), [snap]);
  const order = useMemo(
    () => [...tracks.plain, ...tracks.returns].map((b) => b.name).concat(tracks.master ? [MASTER] : []),
    [tracks],
  );
  const bus =
    snap.buses.find((b) => b.name === track) ?? snap.buses.find((b) => b.name !== MASTER) ?? snap.buses[0];
  const channel = snap.channels.find((c) => c.id === source) ?? snap.channels[0];

  const layers = editLayers(snap);
  const nameOf = (layer: string) => layerName(layer, snap) ?? "";
  const inForce = (layer: string) => snap.stack.includes(layer);
  const editName = nameOf(edit);
  const heard = inForce(edit);

  // The info line: what the pointer or the focus is on, said in full.
  const told = useRef<Element | null>(null);
  const retell = () => {
    const el = infoRef.current;
    if (!el) return;
    const text = told.current?.isConnected ? (told.current.getAttribute("data-info") ?? "") : "";
    if (el.textContent !== text) el.textContent = text;
  };
  const say = (target: EventTarget | null) => {
    told.current = (target as Element | null)?.closest?.("[data-info]") ?? null;
    retell();
  };
  // What it says of a control moves with the control: said again after every change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `snap` and `edit` are the change; `retell` reads refs
  useEffect(retell, [snap, edit]);

  return (
    <DeskCtx.Provider value={ctx}>
      <ViewCtx.Provider value={view}>
        <div
          className={s.desk}
          ref={rootRef}
          data-listening={listening || undefined}
          data-edit={edit === MIX ? "mix" : "scene"}
          style={{ "--dp-detail": `${detailH}px`, "--dp-sources": `${sourcesW}px` }}
          onPointerOver={(e) => say(e.target)}
          onFocus={(e) => say(e.target)}
          onPointerLeave={() => say(null)}
        >
          <header className={s.top}>
            <h1 className={s.title}>{title}</h1>

            <div className={s.layerBox} data-heard={heard || undefined}>
              <span className={s.mini}>Editing</span>
              <Picker
                label="Layer to edit"
                value={edit}
                tone={edit === MIX ? "mix" : "scene"}
                options={layers.map((layer) => ({
                  value: layer,
                  label:
                    layer === MIX
                      ? "All scenes"
                      : `${nameOf(layer)}${inForce(layer) ? (snap.stack[snap.stack.length - 1] === layer && snap.pushed.length ? " (in force, on top)" : " (in force)") : ""}`,
                }))}
                face={editName}
                info={
                  edit === MIX
                    ? "Every move is written for all scenes: the mix under them. Pick a scene to write for it alone"
                    : `Every move is written for ${editName} alone${heard ? "" : ": it is not in force now, so a move is not heard until it is"}`
                }
                onChange={setEdit}
              />
              <span className={s.stack}>
                {snap.stack.length > 1 && <span className={s.mini}>in force</span>}
                {snap.stack.slice(1).map((layer) => (
                  <button
                    key={layer}
                    type="button"
                    className={s.stackChip}
                    aria-pressed={layer === edit}
                    {...tip(`${nameOf(layer)} is in force now: press to edit it`)}
                    onClick={() => setEdit(layer)}
                  >
                    {nameOf(layer)}
                  </button>
                ))}
              </span>
              {!heard && (
                <span
                  className={s.unheard}
                  {...tip(`${editName} is not in force: what you move here is not heard until it is`)}
                >
                  not in force
                </span>
              )}
              <Picker
                label={`Copy ${editName} to another layer`}
                look="button"
                value=""
                face="Copy to"
                disabled={layers.length < 2}
                options={[
                  { value: "", label: `Copy ${editName} to…`, disabled: true },
                  ...layers
                    .filter((layer) => layer !== edit)
                    .map((layer) => ({ value: layer, label: nameOf(layer) })),
                ]}
                info={`Write everything ${editName} says into another layer (undo takes it back)`}
                onChange={(to) => {
                  if (!to) return;
                  desk.copyLayer(edit, to);
                  setNote({ tone: "ok", text: `Copied ${editName} to ${nameOf(to)}. Undo takes it back.` });
                }}
              />
            </div>

            {switches && switches.length > 0 && (
              <div className={s.switches}>
                {switches.map((sw) => (
                  <span key={sw.id} className={s.switch}>
                    <span className={s.mini}>{sw.label}</span>
                    <Picker
                      label={sw.label}
                      value={sw.value()}
                      options={sw.options()}
                      info={`${sw.label}: the game's own switch, set from here`}
                      onChange={(v) => sw.set(v)}
                    />
                  </span>
                ))}
              </div>
            )}

            <span className={s.grow} />

            <div className={s.group}>
              <IconButton
                label="Undo"
                info="Undo (Ctrl+Z)"
                disabled={!snap.canUndo}
                onPress={() => desk.undo()}
              >
                <UndoIcon />
              </IconButton>
              <IconButton
                label="Redo"
                info="Redo (Ctrl+Shift+Z or Ctrl+Y)"
                disabled={!snap.canRedo}
                onPress={() => desk.redo()}
              >
                <RedoIcon />
              </IconButton>
            </div>

            <div className={s.listen} aria-live="polite">
              {snap.solos > 0 && (
                <span className={s.flag} data-kind="solo">
                  Solo {snap.solos}
                </span>
              )}
              {snap.mutes > 0 && (
                <span className={s.flag} data-kind="mute">
                  Mute {snap.mutes}
                </span>
              )}
              {listening && (
                <button
                  type="button"
                  className={s.button}
                  aria-label="Clear solo and mute"
                  {...tip("Take every solo and mute off (Esc)")}
                  onClick={() => desk.clearListening()}
                >
                  Clear
                </button>
              )}
            </div>

            <MasterMeter />

            <div className={s.saveBox}>
              {/* A save that failed says so here too, beside the button, until the next message replaces it. */}
              {note?.tone === "bad" && note.text.startsWith("Save failed") ? (
                <span className={s.dirty} data-failed="">
                  Not saved
                </span>
              ) : (
                <span className={s.dirty} data-dirty={unsaved || undefined}>
                  {snap.staged.length > 0 ? `${snap.staged.length} staged` : snap.dirty ? "Unsaved" : "Saved"}
                </span>
              )}
              <button
                type="button"
                className={s.button}
                data-primary={unsaved || undefined}
                disabled={saving}
                {...tip(
                  snap.staged.length > 0
                    ? "Write the staged samples into their packs, then save the mix (Ctrl+S)"
                    : "Save the mix (Ctrl+S)",
                )}
                onClick={() => void save()}
              >
                {saving ? "Saving" : "Save"}
              </button>
            </div>
          </header>

          <div className={s.main}>
            <SourcesPane
              selected={tab === "source" ? channel?.id : undefined}
              folded={folded}
              onFold={toggleFold}
              filterRef={filterRef}
              audible={audible}
              order={order}
            />
            <Splitter
              label="Sources width"
              orientation="vertical"
              value={sourcesW}
              min={SOURCES.min}
              max={SOURCES.max}
              grow={1}
              onChange={(v) => {
                setSourcesW(v);
                writePrefs(storageKey, { sources: v });
              }}
            />
            <TracksPane
              tracks={tracks}
              selected={tab === "devices" ? bus?.name : undefined}
              audible={audible}
            />
          </div>

          <Splitter
            label="Detail height"
            orientation="horizontal"
            value={detailH}
            min={DETAIL.min}
            max={DETAIL.max}
            grow={-1}
            onChange={(v) => {
              setDetailH(v);
              writePrefs(storageKey, { detail: v });
            }}
          />

          <section className={s.detail} aria-label="Detail">
            <div className={s.tabs} role="tablist" aria-label="Detail">
              {TABS.map((each) => {
                const label =
                  each === "devices"
                    ? `Devices${bus ? `: ${bus.name}` : ""}`
                    : each === "source"
                      ? `Source${channel ? `: ${sourceName(channel)}` : ""}`
                      : each === "arrangement"
                        ? "Arrangement"
                        : "Tunables";
                return (
                  <button
                    key={each}
                    type="button"
                    role="tab"
                    id={`dp-tab-${each}`}
                    className={s.tab}
                    aria-selected={tab === each}
                    aria-controls="dp-tabpanel"
                    onClick={() => openTab(each)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className={s.tabPanel} role="tabpanel" id="dp-tabpanel" aria-labelledby={`dp-tab-${tab}`}>
              {tab === "devices" &&
                (bus ? (
                  <Devices bus={bus} sends={tracks.sends.get(bus.name) ?? []} />
                ) : (
                  <p className={s.empty}>No track to show yet.</p>
                ))}
              {tab === "source" &&
                (channel ? (
                  <SourceDetail key={channel.id} channel={channel} />
                ) : (
                  <p className={s.empty}>
                    Nothing has sounded yet. Press a source's name in the list and it opens here.
                  </p>
                ))}
              {tab === "arrangement" && <Arrangement />}
              {tab === "tunables" && <Tunables />}
            </div>
          </section>

          <footer className={s.foot}>
            {note && (
              <span className={s.note} data-tone={note.tone}>
                <span role={note.tone === "bad" ? "alert" : "status"}>{note.text}</span>
                <IconButton label="Dismiss the message" onPress={() => setNote(null)}>
                  <CloseIcon />
                </IconButton>
              </span>
            )}
            <span ref={infoRef} className={s.info} />
            <span className={s.legend} aria-hidden="true">
              <span className={s.key} data-tone="default">
                code
              </span>
              <span className={s.key} data-tone="mix">
                all scenes
              </span>
              <span className={s.key} data-tone="scene">
                a scene
              </span>
              <span className={s.key} data-tone="route">
                mod route
              </span>
              <span className={s.key} data-tone="written">
                set here
              </span>
            </span>
          </footer>
        </div>
      </ViewCtx.Provider>
    </DeskCtx.Provider>
  );
}

function MasterMeter() {
  const { loop } = useDesk();
  const lufs = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = lufs.current;
    if (!el) return;
    loop.lufs.add(el);
    return () => {
      loop.lufs.delete(el);
    };
  }, [loop]);
  return (
    <div className={s.masterMeter} {...tip("The master after the limiter, and its loudness")}>
      <Meter bus={MASTER} orient="h" />
      <span className={s.lufs}>
        <span ref={lufs} className={s.num}>
          {"−∞"}
        </span>{" "}
        LUFS
      </span>
    </div>
  );
}
