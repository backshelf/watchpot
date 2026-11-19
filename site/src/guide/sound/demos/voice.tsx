// Page 2's panel: a voice's numbers on three sliders and a wave, heard when the reader lets go. A table is read when
// the sound is made, so a new set of numbers is a new sound: this page keeps the newest and silences the one before.
import { useEffect, useRef, useState } from "react";
import type { Wave } from "watchpot/sound";
import type * as Example from "../../../../../docs/examples/sound-voice";
import { PanelChoice, useExample } from "../../kit";
import { Control, Line, type Live, Shown, ShownRow, said } from "./live";

type Voice = typeof Example;
type Sound = ReturnType<Voice["makeSound"]>;

const WAVES: readonly { value: Wave; label: string }[] = [
  { value: "sine", label: "sine" },
  { value: "triangle", label: "triangle" },
  { value: "square", label: "square" },
  { value: "saw", label: "saw" },
];

const Hz = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)} kHz` : `${n} Hz`);
const seconds = (n: number) => `${Math.round(n * 1000)} ms`;
const written = (n: Example.Numbers) =>
  `{ frequency: ${n.frequency}, sustain: ${n.sustain}, release: ${n.release}, wave: "${n.wave}" }`;

export function Voice() {
  const { VOICE, makeSound } = useExample<Voice>();
  const [numbers, setNumbers] = useState<Example.Numbers>(() => VOICE);
  const latest = useRef(numbers);
  const sound = useRef<Sound | null>(null);
  /** The numbers the sound in hand was made from: a release that changed nothing is a replay, not a rebuild. */
  const built = useRef("");
  const [live, setLive] = useState<Live>("asleep");
  const [made, setMade] = useState(0);

  const set = (patch: Partial<Example.Numbers>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setNumbers(next);
  };

  /** The numbers as they stand, as one sound: the old one is muted and unhooked so it cannot sound under the new. */
  const hear = async () => {
    const asked = latest.current;
    const key = written(asked);
    if (sound.current && built.current === key) {
      sound.current.play("voice", { mine: true });
      return;
    }
    const next = makeSound(asked);
    const before = sound.current;
    sound.current = next;
    built.current = key;
    if (before) {
      before.setMuted(true);
      before.output()?.disconnect();
    }
    setLive("booting");
    await next.unlock();
    setLive(next.mode() === "core" ? "core" : "fallback");
    next.play("voice", { mine: true });
    setMade((n) => n + 1);
  };

  useEffect(
    () => () => {
      sound.current?.setMuted(true);
    },
    [],
  );

  return (
    <>
      <Line>
        <code>{written(numbers)}</code>
      </Line>
      <section className="controls" aria-label="The voice's numbers">
        <Control
          label="Pitch"
          shown={Hz(numbers.frequency)}
          min={110}
          max={1760}
          step={10}
          value={numbers.frequency}
          onChange={(frequency) => set({ frequency })}
          onDone={() => void hear()}
        />
        <Control
          label="Sustain"
          shown={seconds(numbers.sustain)}
          min={0.01}
          max={0.4}
          step={0.01}
          value={numbers.sustain}
          onChange={(sustain) => set({ sustain })}
          onDone={() => void hear()}
        />
        <Control
          label="Release"
          shown={seconds(numbers.release)}
          min={0.02}
          max={0.8}
          step={0.01}
          value={numbers.release}
          onChange={(release) => set({ release })}
          onDone={() => void hear()}
        />
      </section>
      <PanelChoice
        title="Wave"
        options={WAVES.map((wave) => ({ value: wave.value, label: wave.label }))}
        value={numbers.wave}
        onChange={(wave) => {
          set({ wave });
          void hear();
        }}
      />
      <div className="actions">
        <button type="button" className="button" onClick={() => void hear()}>
          Hear it
        </button>
        <span className="shortcut__note">the numbers, then a play: let go of a slider, or press here</span>
      </div>
      <ShownRow>
        <Shown label="The engine" value={said(live)} />
        <Shown label="Sounds made" value={made} />
      </ShownRow>
    </>
  );
}
