/**
 * The tracks: one column per bus in summing order, the returns to their right, the master pinned last. Each column
 * is a strip: its name, where its audio goes, its sends as knobs, its fader beside its meter and gain reduction, its
 * trim, mute and solo. A "+" makes a bus.
 */
import { type MouseEvent, type RefObject, useEffect, useRef, useState } from "react";
import type { DeskBus } from "../../../sound/desk";
import s from "../SoundDesk.module.css";
import { useDesk, useView } from "./context";
import { CloseIcon, Fader, IconButton, OutIcon, Picker, PlusIcon, Toggle, tip, ValueField } from "./controls";
import { dbText, KeyPip, LEVEL, parseDb, SendKnob, TRIM, useKey } from "./layered";
import { busId, levelKey, MASTER, pressSolo, sendKey, type Tracks as TrackList, trimKey } from "./model";
import { fmtDb } from "./scale";

const LEVEL_TICKS: readonly (readonly [number, string])[] = [
  [6, "+6"],
  [0, "0"],
  [-6, "6"],
  [-12, "12"],
  [-24, "24"],
  [-40, "40"],
];

export function Meter({
  bus,
  orient,
  readout,
}: {
  bus: string;
  orient: "v" | "h";
  readout?: RefObject<HTMLElement | null>;
}) {
  const { loop } = useDesk();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const part = (name: string) => el.querySelector<HTMLElement>(`[data-part="${name}"]`) as HTMLElement;
    const els = {
      bus,
      orient,
      peak: part("peak"),
      rms: part("rms"),
      hold: part("hold"),
      readout: readout?.current ?? undefined,
    };
    loop.meters.add(els);
    return () => {
      loop.meters.delete(els);
    };
  }, [loop, bus, orient, readout]);
  return (
    <span ref={ref} className={s.meter} data-orient={orient} aria-hidden="true">
      <span className={s.meterPeak} data-part="peak" />
      <span className={s.meterRms} data-part="rms" />
      <span className={s.meterHold} data-part="hold" />
    </span>
  );
}

/** A bus's gain reduction: a bar that grows from its start, with its figure when there is room for one. */
export function Reduction({
  bus,
  orient,
  figure,
}: {
  bus: string;
  orient: "down" | "across";
  figure?: boolean;
}) {
  const { loop } = useDesk();
  const bar = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!bar.current) return;
    const els = { bus, orient, bar: bar.current, text: text.current ?? undefined };
    loop.reductions.add(els);
    return () => {
      loop.reductions.delete(els);
    };
  }, [loop, bus, orient]);
  return (
    <span
      className={s.gr}
      data-orient={orient}
      {...tip("Gain reduction: how far this bus's compressors pull it down")}
    >
      <span className={s.grTrack} aria-hidden="true">
        <span ref={bar} className={s.grBar} />
      </span>
      {figure && (
        <span ref={text} className={s.grText} aria-hidden="true">
          0.0
        </span>
      )}
    </span>
  );
}

export function TracksPane({
  tracks,
  selected,
  audible,
}: {
  tracks: TrackList;
  selected: string | undefined;
  audible: ReadonlySet<string> | null;
}) {
  const { snap } = useView();
  const rows = Math.max(0, ...[...tracks.sends.values()].map((list) => list.length));
  const strip = (bus: DeskBus, group: "plain" | "return" | "master") => (
    <Strip
      key={bus.name}
      bus={bus}
      sends={tracks.sends.get(bus.name) ?? []}
      group={group}
      selected={bus.name === selected}
      dim={audible !== null && !audible.has(bus.name)}
    />
  );
  return (
    <section className={s.tracks} aria-label="Tracks" style={{ "--dp-send-rows": rows }}>
      {snap.buses.length === 0 && (
        <p className={s.empty}>No sound yet. The tracks appear when the game's sound is made.</p>
      )}
      <div className={s.trackScroll}>
        {tracks.plain.map((b) => strip(b, "plain"))}
        {snap.buses.length > 0 && <AddBus />}
        {tracks.returns.length > 0 && (
          <div className={s.returns}>
            <span className={s.returnsLabel} aria-hidden="true">
              returns
            </span>
            {tracks.returns.map((b) => strip(b, "return"))}
          </div>
        )}
      </div>
      {tracks.master && <div className={s.masterSlot}>{strip(tracks.master, "master")}</div>}
    </section>
  );
}

function AddBus() {
  const { desk, note, selectTrack } = useDesk();
  const { snap } = useView();
  const [name, setName] = useState<string | null>(null);
  const full = snap.buses.length - 1 >= snap.limits.buses;
  const make = () => {
    const given = (name ?? "").trim();
    setName(null);
    if (!given) return;
    if (desk.addBus(given)) {
      selectTrack(given);
      note({ tone: "ok", text: `Made the bus ${given}. It sums into the master.` });
    } else
      note({ tone: "warn", text: `Could not make a bus named "${given}": the name is taken or not a name.` });
  };
  return (
    <div className={s.addBus}>
      {name === null ? (
        <IconButton
          label="Add a bus"
          disabled={full}
          info={full ? `The mixer holds ${snap.limits.buses} buses and the master: it is full` : "Make a bus"}
          onPress={() => setName("")}
        >
          <PlusIcon />
        </IconButton>
      ) : (
        <input
          className={s.addBusName}
          type="text"
          aria-label="New bus name"
          placeholder="name"
          spellCheck={false}
          autoComplete="off"
          // biome-ignore lint/a11y/noAutofocus: the field appears because its button was pressed
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={make}
          onKeyDown={(e) => {
            if (e.key === "Enter") make();
            else if (e.key === "Escape") {
              e.stopPropagation();
              setName(null);
            }
          }}
        />
      )}
    </div>
  );
}

function Strip({
  bus,
  sends,
  group,
  selected,
  dim,
}: {
  bus: DeskBus;
  sends: readonly string[];
  group: "plain" | "return" | "master";
  selected: boolean;
  dim: boolean;
}) {
  const { desk, loop, snap, edit, note, selectTrack } = useDesk();
  const view = useView();
  const readout = useRef<HTMLButtonElement>(null);
  const isMaster = bus.name === MASTER;
  const level = useKey(levelKey(bus.name), 0);
  const trim = useKey(trimKey(bus.name), 0);
  const levelInfo = level.info(`${bus.name} level`, dbText);
  const trimInfo = trim.info(
    `${bus.name} trim`,
    dbText,
    "A trim sits on the bus's gain beside its level: use it to move a bus without touching what a scene says.",
  );
  const squeezes = bus.fx.some((fx) => fx.kind === "compressor");
  const outs = [MASTER, ...view.snap.buses.map((b) => b.name).filter((n) => n !== MASTER && n !== bus.name)];
  const free = bus.sends.filter((to) => !sends.includes(to));
  return (
    <div
      className={s.strip}
      data-group={group}
      data-selected={selected || undefined}
      data-dim={dim || undefined}
      data-made={bus.made || undefined}
    >
      <div className={s.stripHead}>
        <button
          type="button"
          className={s.stripName}
          aria-pressed={selected}
          {...tip(
            `${bus.name}${bus.made ? " (made on the desk)" : ""}${bus.out ? `, into ${bus.out}` : ""}: show its devices`,
          )}
          onClick={() => selectTrack(bus.name)}
        >
          {bus.name}
        </button>
        {bus.made && (
          <IconButton
            label={`Remove ${bus.name}`}
            info={`Remove ${bus.name}: only once nothing is routed, sent or keyed to it`}
            onPress={() => {
              if (!desk.removeBus(bus.name))
                note({
                  tone: "warn",
                  text: `${bus.name} is still in use: take away what is routed, sent or keyed to it, then remove it.`,
                });
            }}
          >
            <CloseIcon />
          </IconButton>
        )}
      </div>
      {isMaster ? (
        <span className={s.stripOut} data-none="">
          out
        </span>
      ) : (
        <span className={s.stripOut}>
          <Picker
            label={`${bus.name} audio to`}
            look="quiet"
            value={bus.out ?? MASTER}
            options={outs.map((name) => ({ value: name, label: name }))}
            face={
              <>
                <OutIcon /> {bus.out ?? MASTER}
              </>
            }
            info={`${bus.name} sums into ${bus.out ?? MASTER}: choose where its audio goes (the same in every scene)`}
            onChange={(to) => {
              if (!desk.setOut(bus.name, to))
                note({ tone: "warn", text: `${bus.name} cannot go into ${to}: it would close a loop.` });
            }}
          />
        </span>
      )}
      <div className={s.sends}>
        {sends.map((to) => (
          <SendKnob key={to} k={sendKey(bus.name, to)} to={to} label={`${bus.name} send to ${to}`} />
        ))}
        {!isMaster && free.length > 0 && (
          <Picker
            label={`Add a send from ${bus.name}`}
            look="button"
            value=""
            face="+ send"
            options={[
              { value: "", label: "Send to…", disabled: true },
              ...free.map((to) => ({ value: to, label: to })),
            ]}
            info={`Add a send from ${bus.name} to another bus: it starts at off, in ${level.editName}`}
            onChange={(to) => {
              if (to) desk.set(edit.current, sendKey(bus.name, to), 0);
            }}
          />
        )}
      </div>
      <div className={s.stripBody}>
        <span className={s.ticks} aria-hidden="true">
          {LEVEL_TICKS.map(([v, text]) => (
            <span key={text} className={s.tick} style={{ "--dp-at": LEVEL.toPos(v) }}>
              {text}
            </span>
          ))}
        </span>
        <Fader
          orientation="vertical"
          value={level.shown}
          scale={LEVEL}
          onChange={level.write}
          onReset={level.reset}
          label={`${bus.name} level`}
          valueText={dbText(level.shown)}
          readOnly={level.locked}
          mark={0}
          info={levelInfo}
          {...level.wear}
        />
        <Meter bus={bus.name} orient="v" readout={readout} />
        {squeezes && <Reduction bus={bus.name} orient="down" />}
      </div>
      <div className={s.stripValue}>
        <ValueField
          value={level.shown}
          format={fmtDb}
          parse={parseDb}
          onCommit={level.write}
          onReset={level.reset}
          scale={LEVEL}
          label={`${bus.name} level, dB`}
          readOnly={level.locked}
          info={levelInfo}
          tone={level.wear.tone}
          says={level.says}
          shadowed={level.shadowed}
        />
        <KeyPip k={level} label={`${bus.name} level`} />
      </div>
      <div className={s.stripValue} data-trim="">
        <span className={s.mini} aria-hidden="true">
          trim
        </span>
        <ValueField
          value={trim.shown}
          format={fmtDb}
          parse={parseDb}
          onCommit={trim.write}
          onReset={trim.reset}
          scale={TRIM}
          bar
          label={`${bus.name} trim`}
          info={trimInfo}
          tone={trim.wear.tone}
          says={trim.says}
          shadowed={trim.shadowed}
        />
        <KeyPip k={trim} label={`${bus.name} trim`} />
      </div>
      <div className={s.ms}>
        <Toggle
          kind="mute"
          on={bus.muted}
          label={`Mute ${bus.name}`}
          onPress={() => desk.mute(busId(bus.name), !bus.muted)}
        />
        {!isMaster && (
          <Toggle
            kind="solo"
            on={bus.soloed}
            label={`Solo ${bus.name}`}
            title={`Solo ${bus.name} alone; Ctrl-click adds it to the solos`}
            onPress={(e: MouseEvent) =>
              pressSolo(desk, snap.current, busId(bus.name), e.ctrlKey || e.metaKey)
            }
          />
        )}
        <button
          ref={readout}
          type="button"
          className={s.readout}
          aria-label={`${bus.name} highest peak: press to clear`}
          {...tip(`${bus.name}'s highest peak since cleared, in dB: press to clear`)}
          onClick={() => loop.resetMax(bus.name)}
        >
          {"−∞"}
        </button>
      </div>
    </div>
  );
}
