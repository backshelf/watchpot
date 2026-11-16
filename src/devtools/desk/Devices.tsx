/**
 * The selected track's devices: a panel for the track itself (where it goes, its level, trim and sends at full
 * width), then its effects in chain order, each with its switch, its settings fit for their units, its place in the
 * chain (dragged, or moved by its arrows) and its removal; a compressor shows its reduction and what it listens to, a
 * convolver its response. A "+" adds an effect of any kind.
 */
import { type DragEvent, useState } from "react";
import type { DeskBus, DeskFx } from "../../sound/desk";
import { DESK_FX } from "../../sound/desk-fx";
import type { FxDef } from "../../sound/types";
import s from "../SoundDesk.module.css";
import { useDesk, useView } from "./context";
import { CloseIcon, IconButton, LeftIcon, Picker, PowerIcon, RightIcon, tip } from "./controls";
import {
  dbText,
  FxParamRow,
  KeyPip,
  LEVEL,
  ParamRow,
  Params,
  parseDb,
  parseSend,
  SEND,
  sendText,
  TRIM,
  useKey,
} from "./layered";
import { fxKey, levelKey, MASTER, sendKey, trimKey } from "./model";
import { Reduction } from "./Tracks";

const KINDS = Object.keys(DESK_FX) as FxDef["kind"][];
const DRAG_TYPE = "application/x-watchpot-desk-fx";
const cap = (text: string) => (text === "eq" ? "EQ" : text.charAt(0).toUpperCase() + text.slice(1));

/** An effect's name on its bus: its kind, numbered when the bus has more than one of the kind. */
export function fxName(bus: DeskBus, fx: DeskFx): string {
  const same = bus.fx.filter((each) => each.kind === fx.kind);
  return same.length > 1 ? `${cap(fx.kind)} ${same.indexOf(fx) + 1}` : cap(fx.kind);
}

export function Devices({ bus, sends }: { bus: DeskBus; sends: readonly string[] }) {
  const { desk, note } = useDesk();
  const { snap } = useView();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const full = bus.fx.length >= snap.limits.fx;
  const drop = (e: DragEvent, to: number) => {
    const id = e.dataTransfer.getData(DRAG_TYPE);
    setDragging(null);
    setOver(null);
    if (!id) return;
    e.preventDefault();
    desk.fxMove(bus.name, id, to);
  };
  return (
    <div className={s.devices}>
      <TrackDevice bus={bus} sends={sends} />
      {bus.fx.map((fx, i) => (
        <Device
          key={fx.id}
          bus={bus}
          fx={fx}
          index={i}
          dragging={dragging === fx.id}
          over={over === fx.id && dragging !== fx.id}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, fx.id);
            e.dataTransfer.effectAllowed = "move";
            setDragging(fx.id);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (over !== fx.id) setOver(fx.id);
          }}
          onDrop={(e) => drop(e, i)}
        />
      ))}
      <div className={s.deviceAdd}>
        <Picker
          label={`Add a device to ${bus.name}`}
          look="button"
          value=""
          face="+ device"
          disabled={full}
          options={[
            { value: "", label: "Add…", disabled: true },
            ...KINDS.map((kind) => ({ value: kind, label: cap(kind) })),
            // A declared device that was removed comes back with what the scenes and the game say of it.
            ...bus.dropped.map((fx) => ({
              value: `restore:${fx.id}`,
              label: `Restore ${fx.id} (${fx.kind})`,
            })),
          ]}
          info={
            full
              ? `${bus.name} holds ${snap.limits.fx} devices: it is full`
              : `Add a device at the end of ${bus.name}'s chain (the same in every scene)`
          }
          onChange={(kind) => {
            if (kind.startsWith("restore:")) {
              if (!desk.fxRestore(bus.name, kind.slice(8)))
                note({ tone: "warn", text: `Could not restore ${kind.slice(8)} on ${bus.name}.` });
            } else if (kind && desk.fxAdd(bus.name, kind as FxDef["kind"]) === null)
              note({ tone: "warn", text: `Could not add a ${kind} to ${bus.name}.` });
          }}
        />
        {bus.fx.length === 0 && (
          <p className={s.hintText}>No devices on {bus.name} yet. Add one, and it is heard at once.</p>
        )}
      </div>
    </div>
  );
}

/** The track itself as the first panel: everything its strip holds, at full width with whole names. */
function TrackDevice({ bus, sends }: { bus: DeskBus; sends: readonly string[] }) {
  const { desk, edit, note } = useDesk();
  const { snap } = useView();
  const isMaster = bus.name === MASTER;
  const outs = [MASTER, ...snap.buses.map((b) => b.name).filter((n) => n !== MASTER && n !== bus.name)];
  const free = bus.sends.filter((to) => !sends.includes(to));
  return (
    <section className={s.device} data-kind="track" aria-label={`${bus.name} track`}>
      <header className={s.deviceHead}>
        <h3 className={s.deviceName}>{bus.name}</h3>
        {!isMaster && (
          <Picker
            label="Track audio to"
            value={bus.out ?? MASTER}
            options={outs.map((name) => ({ value: name, label: name }))}
            face={`to ${bus.out ?? MASTER}`}
            info={`Where ${bus.name}'s audio goes (the same in every scene)`}
            onChange={(to) => {
              if (!desk.setOut(bus.name, to))
                note({ tone: "warn", text: `${bus.name} cannot go into ${to}: it would close a loop.` });
            }}
          />
        )}
      </header>
      <Params>
        <ParamRow
          k={levelKey(bus.name)}
          name="level"
          label="Track level"
          scale={LEVEL}
          format={dbText}
          parse={parseDb}
          fallback={0}
          mark={0}
        />
        <ParamRow
          k={trimKey(bus.name)}
          name="trim"
          label="Track trim"
          scale={TRIM}
          format={dbText}
          parse={parseDb}
          fallback={0}
          mark={0}
        />
        {sends.map((to) => (
          <ParamRow
            key={to}
            k={sendKey(bus.name, to)}
            name={`to ${to}`}
            label={`Track send to ${to}`}
            scale={SEND}
            format={sendText}
            parse={parseSend}
            fallback={0}
            mark={1}
          />
        ))}
        {!isMaster && (
          <div className={s.row} data-add="">
            <Picker
              label="Player volume"
              look="button"
              value={bus.volume ?? ""}
              face={bus.volume ? `volume: with ${bus.volume}` : "volume: its own"}
              options={[
                { value: "", label: "Its own only" },
                ...outs
                  .filter((name) => name !== MASTER)
                  .map((name) => ({ value: name, label: `With ${name}` })),
              ]}
              info={`Whose volume slider in the game also turns ${bus.name} down, on top of its own (the same in every scene). A bus that already sums into that one needs none.`}
              onChange={(of) => {
                if (!desk.setVolume(bus.name, of === "" ? null : of))
                  note({ tone: "warn", text: `${bus.name} cannot take ${of}'s volume.` });
              }}
            />
          </div>
        )}
        {!isMaster && free.length > 0 && (
          <div className={s.row} data-add="">
            <Picker
              label="Add a track send"
              look="button"
              value=""
              face="+ send"
              options={[
                { value: "", label: "Send to…", disabled: true },
                ...free.map((to) => ({ value: to, label: to })),
              ]}
              info={`Add a send from ${bus.name} to another bus: it starts at off`}
              onChange={(to) => {
                if (to) desk.set(edit.current, sendKey(bus.name, to), 0);
              }}
            />
          </div>
        )}
      </Params>
    </section>
  );
}

function Device({
  bus,
  fx,
  index,
  dragging,
  over,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  bus: DeskBus;
  fx: DeskFx;
  index: number;
  dragging: boolean;
  over: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  const { desk } = useDesk();
  const { snap } = useView();
  const name = fxName(bus, fx);
  const on = useKey(fxKey(bus.name, fx.id, "on"), 1);
  const isOn = on.shown >= 0.5;
  const onInfo = on.info(`${name} on ${bus.name}`, (v) => (v >= 0.5 ? "on" : "off"));
  const last = bus.fx.length - 1;
  return (
    <section
      className={s.device}
      data-off={!isOn || undefined}
      data-dragging={dragging || undefined}
      data-over={over || undefined}
      aria-label={`${name} on ${bus.name}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <header
        className={s.deviceHead}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        {...tip(
          `${name} (${fx.id}), ${fx.declared ? "declared in code" : "added on the desk"}: drag to move it in the chain`,
        )}
      >
        <button
          type="button"
          className={s.power}
          aria-pressed={isOn}
          aria-label={`${name} on`}
          data-tone={on.wear.tone}
          data-shadowed={on.shadowed || undefined}
          disabled={on.locked}
          title={onInfo}
          data-info={onInfo}
          onClick={() => on.write(isOn ? 0 : 1)}
        >
          <PowerIcon />
        </button>
        <KeyPip k={on} label={`${name} on`} />
        <h3 className={s.deviceName}>{name}</h3>
        <span className={s.deviceTools}>
          <IconButton
            label={`Move ${name} earlier`}
            disabled={index === 0}
            onPress={() => desk.fxMove(bus.name, fx.id, index - 1)}
          >
            <LeftIcon />
          </IconButton>
          <IconButton
            label={`Move ${name} later`}
            disabled={index === last}
            onPress={() => desk.fxMove(bus.name, fx.id, index + 1)}
          >
            <RightIcon />
          </IconButton>
          <IconButton
            label={`Remove ${name}`}
            info={`Remove ${name} from ${bus.name} (undo brings it back)`}
            onPress={() => desk.fxRemove(bus.name, fx.id)}
          >
            <CloseIcon />
          </IconButton>
        </span>
      </header>
      {fx.kind === "compressor" && (
        <div className={s.deviceExtra}>
          <span className={s.mini}>GR</span>
          <Reduction bus={bus.name} orient="across" figure />
          <Picker
            label={`${name} listens to`}
            value={fx.key ?? ""}
            options={[
              { value: "", label: "Its own bus" },
              ...snap.buses
                .map((b) => b.name)
                .filter((n) => n !== MASTER && n !== bus.name)
                .map((n) => ({ value: n, label: n })),
            ]}
            face={fx.key ? `key ${fx.key}` : "key: own bus"}
            info={`What ${name} listens to: its own bus, or another (a duck). The same in every scene`}
            onChange={(key) => desk.fxKey(bus.name, fx.id, key === "" ? null : key)}
          />
        </div>
      )}
      {fx.kind === "convolver" && <Response bus={bus} fx={fx} name={name} />}
      <Params>
        {fx.params.map((p) => (
          <FxParamRow key={p.param} k={fxKey(bus.name, fx.id, p.param)} param={p} label={name} />
        ))}
      </Params>
    </section>
  );
}

/** A convolver's impulse response: one of the loaded packs' `ir` samples. */
function Response({ bus, fx, name }: { bus: DeskBus; fx: DeskFx; name: string }) {
  const { desk } = useDesk();
  const { snap } = useView();
  const irs = snap.samples.filter((sample) => sample.entry.kind === "ir").map((sample) => sample.key);
  const options = [
    ...(fx.ir === undefined ? [{ value: "", label: "No response", disabled: true }] : []),
    ...(fx.ir !== undefined && !irs.includes(fx.ir) ? [{ value: fx.ir, label: fx.ir }] : []),
    ...irs.map((key) => ({ value: key, label: key })),
  ];
  return (
    <div className={s.deviceExtra}>
      <span className={s.mini}>IR</span>
      <Picker
        label={`${name} response`}
        value={fx.ir ?? ""}
        options={options}
        face={fx.ir ?? "no response: silent"}
        disabled={irs.length === 0}
        info={
          irs.length === 0
            ? "No loaded pack has an impulse response (a sample of kind ir)"
            : `The room ${name} plays through: an impulse response from a loaded pack`
        }
        onChange={(key) => {
          if (key) desk.fxIr(bus.name, fx.id, key);
        }}
      />
    </div>
  );
}
