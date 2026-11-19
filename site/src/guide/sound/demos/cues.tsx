// Page 1's panel: three cues out of one table, played by the example's own named functions. The first press boots
// the engine and plays the cue that was pressed; every press after it is just a play.
import { useState } from "react";
import type * as Example from "../../../../../docs/examples/sound-cue";
import { useExample } from "../../kit";
import { Line, Shown, ShownRow, said, useEngine } from "./live";

type Cues = typeof Example;
type Key = Example.CueKey;

const PADS: readonly { key: Key; label: string }[] = [
  { key: "bubble", label: "bubble" },
  { key: "stir", label: "stir" },
  { key: "overflow", label: "overflow" },
];

export function Cues() {
  const { sound, playBubble, playStir, playOverflow, info } = useExample<Cues>();
  const { live, start } = useEngine(() => sound);
  const [last, setLast] = useState<Key | null>(null);
  const [step, setStep] = useState(0);

  const press = async (key: Key, at?: Element) => {
    await start();
    if (key === "bubble") playBubble(at);
    else if (key === "stir") {
      playStir(step);
      setStep((n) => (n + 1) % 5);
    } else playOverflow();
    setLast(key);
  };

  return (
    <>
      <div className="actions">
        {PADS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className="button"
            onClick={(event) => void press(key, event.currentTarget)}
          >
            {label}
            {key === "stir" ? <span className="num"> step {step}</span> : null}
          </button>
        ))}
      </div>
      <ShownRow>
        <Shown label="The engine" value={said(live)} />
        <Shown label="Last press" value={last ?? "nothing yet"} />
        <Shown label="The next step" value={step} />
      </ShownRow>
      <Line>
        <code>soundInfo("bubble")</code> says <code>{info("bubble").source}</code>,{" "}
        {info("bubble").seconds.toFixed(2)} s: these three have no recording behind them.
      </Line>
    </>
  );
}
