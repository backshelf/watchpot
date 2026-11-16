/**
 * The sources: every channel that has sounded, under the bus it sounds on, with a filter. Each row has its light,
 * its name (pressed, it opens in the detail), where its audio goes, its trim, mute, solo and, for a cue, an
 * audition. A cue played on more than one bus opens into its roles: a write on the cue's row reaches every role, a
 * write on a role's row reaches that role alone.
 */
import { type MouseEvent, type RefObject, useEffect, useRef, useState } from "react";
import type { DeskChannel } from "../../sound/desk";
import s from "../SoundDesk.module.css";
import { useDesk, useView } from "./context";
import { Disclosure, OutIcon, Picker, PlayIcon, Toggle, tip, ValueField } from "./controls";
import { dbText, KeyPip, parseDb, TRIM, useKey } from "./layered";
import { chKey, cueKeyOf, MASTER, pressSolo, type SourceNode, sourceLabel, sourcesOf } from "./model";
import { fmtDb } from "./scale";

/** What a screen reader and the info line call a source: a role is "<cue> as <role>". */
export const sourceName = (c: DeskChannel): string =>
  c.role !== undefined ? `${cueKeyOf(c)} as ${c.role}` : c.name;

const KIND: Record<DeskChannel["kind"], string> = {
  cue: "cue",
  stem: "music stem",
  gen: "generator",
  grain: "grain cloud",
  voice: "babble voice",
};

export function SourcesPane({
  selected,
  folded,
  onFold,
  filterRef,
  audible,
  order,
}: {
  selected: string | undefined;
  folded: ReadonlySet<string>;
  onFold: (key: string) => void;
  filterRef: RefObject<HTMLInputElement | null>;
  audible: ReadonlySet<string> | null;
  /** The buses in the order the tracks show them. */
  order: readonly string[];
}) {
  const { desk, snap: latest } = useDesk();
  const { snap } = useView();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const needle = filter.trim().toLowerCase();
  const nodes = sourcesOf(snap.channels);
  const hit = (c: DeskChannel) => `${c.id} ${c.bus} ${KIND[c.kind]}`.toLowerCase().includes(needle);
  const shown = needle ? nodes.filter((n) => hit(n.channel) || n.roles.some(hit)) : nodes;
  const groups = new Map<string, SourceNode[]>();
  for (const name of order) groups.set(name, []);
  for (const n of shown) {
    const g = groups.get(n.channel.bus);
    if (g) g.push(n);
    else groups.set(n.channel.bus, [n]);
  }
  const first = [...groups.values()].find((g) => g.length)?.[0];
  const soloedBus = new Set(snap.buses.filter((b) => b.soloed).map((b) => b.name));
  const anyChannelSolo = snap.channels.some((c) => c.soloed);
  const dimOf = (c: DeskChannel, parent?: DeskChannel) => {
    if (audible === null) return false;
    if (anyChannelSolo) return !c.soloed && !parent?.soloed;
    return !soloedBus.has(c.bus) && !audible.has(c.bus);
  };
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <section className={s.sources} aria-label="Sources">
      <div className={s.sourcesHead}>
        <h2 className={s.paneTitle}>Sources</h2>
        <input
          ref={filterRef}
          className={s.filter}
          type="text"
          spellCheck={false}
          autoComplete="off"
          aria-label="Filter sources"
          placeholder="Filter  /"
          {...tip("Filter by name, bus or kind. Enter solos the first match alone; Escape clears the filter")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setFilter("");
            } else if (e.key === "Enter" && first) pressSolo(desk, latest.current, first.channel.id, false);
          }}
        />
      </div>
      <div className={s.sourceList}>
        {snap.channels.length === 0 && (
          <p className={s.empty}>Nothing has sounded yet. A source appears here the first time it plays.</p>
        )}
        {snap.channels.length > 0 && shown.length === 0 && <p className={s.empty}>No source matches.</p>}
        {[...groups].map(([bus, list]) => {
          if (list.length === 0) return null;
          const key = `src:${bus}`;
          const isOpen = !folded.has(key) || needle !== "";
          return (
            <section key={bus} className={s.sourceGroup}>
              <h3 className={s.groupHead}>
                <button
                  type="button"
                  className={s.groupButton}
                  aria-expanded={isOpen}
                  onClick={() => onFold(key)}
                >
                  <Disclosure open={isOpen} />
                  <span className={s.groupName}>{bus === "" ? "not yet sounded" : bus}</span>
                  <span className={s.count}>{list.length}</span>
                </button>
              </h3>
              {isOpen && (
                <ul className={s.sourceRows}>
                  {list.map((n) => {
                    const expanded = n.roles.length > 0 && (open.has(n.channel.id) || needle !== "");
                    return (
                      <li key={n.channel.id} className={s.sourceItem}>
                        <SourceRow
                          channel={n.channel}
                          roles={n.roles.length}
                          expanded={expanded}
                          onToggle={toggle}
                          selected={selected === n.channel.id}
                          dim={dimOf(n.channel)}
                        />
                        {expanded && (
                          <ul className={s.roleRows} aria-label={`${n.channel.name} roles`}>
                            {n.roles.map((r) => (
                              <li key={r.id} className={s.sourceItem}>
                                <SourceRow
                                  channel={r}
                                  roles={0}
                                  expanded={false}
                                  onToggle={toggle}
                                  selected={selected === r.id}
                                  dim={dimOf(r, n.channel)}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function SourceRow({
  channel: c,
  roles,
  expanded,
  onToggle,
  selected,
  dim,
}: {
  channel: DeskChannel;
  /** How many roles open under it (0: none to open). */
  roles: number;
  expanded: boolean;
  onToggle: (id: string) => void;
  selected: boolean;
  dim: boolean;
}) {
  const { desk, loop, snap, note, selectSource } = useDesk();
  const view = useView();
  const light = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = light.current;
    if (!el) return;
    loop.lights.set(c.id, el);
    return () => {
      if (loop.lights.get(c.id) === el) loop.lights.delete(c.id);
    };
  }, [loop, c.id]);
  const name = sourceName(c);
  const trim = useKey(chKey(c.id), 0);
  const reach =
    c.role !== undefined
      ? "A write here reaches this role alone, on top of its cue's."
      : roles > 0
        ? `A write here reaches all ${roles} of its roles.`
        : "";
  const trimInfo = trim.info(`${name} trim`, dbText, reach || undefined);
  const buses = view.snap.buses.map((b) => b.name);
  return (
    <div
      className={s.source}
      data-selected={selected || undefined}
      data-dim={dim || undefined}
      data-role={c.role !== undefined || undefined}
    >
      <span ref={light} className={s.light} data-state="off" aria-hidden="true" />
      {roles > 0 ? (
        <button
          type="button"
          className={s.twist}
          aria-expanded={expanded}
          aria-label={`${c.name}: ${roles} roles`}
          {...tip(`${c.name} plays on ${roles} buses: open to set each role on its own`)}
          onClick={() => onToggle(c.id)}
        >
          <Disclosure open={expanded} />
        </button>
      ) : (
        <span className={s.twist} data-none="" aria-hidden="true" />
      )}
      <button
        type="button"
        className={s.sourceName}
        aria-pressed={selected}
        aria-label={`${name}: show in the detail`}
        {...tip(`${KIND[c.kind]} ${name}, on ${c.bus || "no bus yet"} (${c.id}). ${reach}`.trim())}
        onClick={() => selectSource(c.id)}
      >
        <span className={s.sourceText}>{sourceLabel(c)}</span>
        {roles > 0 && <span className={s.count}>{roles}</span>}
      </button>
      <Picker
        label={`${name} audio to`}
        look="quiet"
        value={c.route ?? ""}
        tone={c.route !== undefined ? "live" : undefined}
        face={c.route !== undefined ? c.route : <OutIcon />}
        options={[
          { value: "", label: "As the game says" },
          ...buses.filter((b) => b !== MASTER).map((b) => ({ value: b, label: b })),
          { value: MASTER, label: MASTER },
        ]}
        info={
          c.route !== undefined
            ? `${name} is routed to ${c.route} whatever its plays ask for. ${reach}`.trim()
            : `${name} plays where the game says (${c.bus || "not yet sounded"}): choose a bus to route it. ${reach}`.trim()
        }
        onChange={(to) => {
          if (!desk.route(c.id, to === "" ? undefined : to))
            note({ tone: "warn", text: `Could not route ${name} to ${to || "where the game says"}.` });
        }}
      />
      <ValueField
        value={trim.shown}
        format={fmtDb}
        parse={parseDb}
        onCommit={trim.write}
        onReset={trim.reset}
        scale={TRIM}
        bar
        label={`${name} trim`}
        info={trimInfo}
        tone={trim.wear.tone}
        says={trim.says}
        shadowed={trim.shadowed}
      />
      <KeyPip k={trim} label={`${name} trim`} />
      <Toggle kind="mute" on={c.muted} label={`Mute ${name}`} onPress={() => desk.mute(c.id, !c.muted)} />
      <Toggle
        kind="solo"
        on={c.soloed}
        label={`Solo ${name}`}
        title={`Solo ${name} alone; Ctrl-click adds it to the solos`}
        onPress={(e: MouseEvent) => pressSolo(desk, snap.current, c.id, e.ctrlKey || e.metaKey)}
      />
      {c.kind === "cue" ? (
        <button
          type="button"
          className={s.play}
          aria-label={`Audition ${name}`}
          {...tip(`Play ${name} once`)}
          onClick={() => desk.audition(c.id)}
        >
          <PlayIcon />
        </button>
      ) : (
        <span className={s.play} data-none="" aria-hidden="true" />
      )}
    </div>
  );
}
