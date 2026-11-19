// Page 4's panel: three faders and three mutes over the buses the table declares, while a round of cues plays. A
// level moves the mix's own fader; a mute turns the player's volume for a bus all the way down.
import { useEffect, useId, useState } from "react";
import type * as Example from "../../../../../docs/examples/sound-levels";
import { useExample } from "../../kit";
import { Control, Line, Shown, ShownRow, said, useEngine } from "./live";

type Levels = typeof Example;
type Group = Example.Group;

/** What the round plays, one a step: three buses' worth, so every fader has something under it. */
const ROUND: readonly Example.CueKey[] = ["tap", "pop", "tap", "pop", "tap", "pop", "swell", "tap", "pop"];

function Mute({ group, heard, onChange }: { group: Group; heard: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="control" data-kind="switch" data-changed={heard ? undefined : ""}>
      <span className="control__label" id={id}>
        {group}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={heard}
        aria-labelledby={id}
        className="control__switch"
        onClick={() => onChange(!heard)}
      >
        <span className="control__switch-on">heard</span>
        <span className="control__switch-off">muted</span>
      </button>
    </div>
  );
}

export function Levels() {
  const { sound, GROUPS, LEVELS } = useExample<Levels>();
  const { live, start } = useEngine(() => sound);
  const [levels, setLevels] = useState<Record<Group, number>>(() => ({ ...LEVELS }));
  const [heard, setHeard] = useState<Record<Group, boolean>>({ sfx: true, ui: true, ambience: true });
  const [going, setGoing] = useState(false);

  // One cue a step, while the reader moves a fader over them.
  useEffect(() => {
    if (!going) return;
    let at = 0;
    const id = setInterval(() => {
      const key = ROUND[at % ROUND.length] ?? "tap";
      at += 1;
      sound.play(key);
    }, 400);
    return () => clearInterval(id);
  }, [going, sound]);

  const move = (group: Group, db: number) => {
    setLevels((now) => ({ ...now, [group]: db }));
    sound.mixer.bus(group).level(db, 60);
  };

  const mute = (group: Group, on: boolean) => {
    setHeard((now) => ({ ...now, [group]: on }));
    sound.mixer.setBusVolume(group, on ? 1 : 0);
  };

  return (
    <>
      <div className="actions">
        <button
          type="button"
          className="button"
          onClick={() => {
            if (going) {
              setGoing(false);
              return;
            }
            void start().then(() => {
              sound.play("tap", { mine: true });
              setGoing(true);
            });
          }}
        >
          {going ? "Stop the round" : "Play a round"}
        </button>
      </div>
      <section className="controls" aria-label="The faders">
        <h2 className="controls__title">The faders, dB</h2>
        {GROUPS.map((group) => (
          <Control
            key={group}
            label={group}
            shown={`${levels[group].toFixed(0)} dB`}
            min={-48}
            max={6}
            step={1}
            value={levels[group]}
            onChange={(db) => move(group, db)}
          />
        ))}
      </section>
      <section className="controls" aria-label="The mutes">
        <h2 className="controls__title">The player's volume</h2>
        {GROUPS.map((group) => (
          <Mute key={group} group={group} heard={heard[group]} onChange={(on) => mute(group, on)} />
        ))}
      </section>
      <ShownRow>
        <Shown label="The engine" value={said(live)} />
        <Shown label="The round" value={going ? "playing" : "stopped"} />
      </ShownRow>
      <Line>
        A fader is the mix's own level, <code>mixer.bus(name).level(db)</code>. A mute is the player's volume,{" "}
        <code>mixer.setBusVolume(name, 0)</code>: the desk keeps the two apart, so a settings slider never
        rewrites the mix.
      </Line>
    </>
  );
}
