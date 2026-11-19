// Page 6's panel: the core's own meters, drawn as a still until the first press and moving after it. Nothing here
// re-renders the page: the five bars are written straight to the document a frame at a time, as the site's sound
// sheet writes its tap to a shader.
import { useEffect, useRef } from "react";
import type * as Example from "../../../../../docs/examples/sound-core";
import { useExample } from "../../kit";
import { Line, Shown, ShownRow, said, useEngine } from "./live";

type Core = typeof Example;

const FLOOR = 1.5;

export function Meter() {
  const { sound, FIGURES, playThump, playBell } = useExample<Core>();
  const { live, start } = useEngine(() => sound);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (live !== "core") return;
    let frame = 0;
    const draw = () => {
      const now = sound.tap.read();
      FIGURES.forEach((key, i) => {
        const bar = bars.current[i];
        if (!bar) return;
        const value = Math.max(0, Math.min(1, now[key]));
        bar.style.height = `${Math.max(FLOOR, value * 100)}%`;
        bar.dataset.state = value > 0.02 ? "next" : "ahead";
        bar.title = `${key}: ${Math.round(value * 100)}%`;
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [live, sound, FIGURES]);

  const press = async (which: "thump" | "bell") => {
    await start();
    if (which === "thump") playThump();
    else playBell();
  };

  return (
    <>
      <div className="actions">
        <button type="button" className="button" onClick={() => void press("thump")}>
          Thump
        </button>
        <button type="button" className="button" onClick={() => void press("bell")}>
          Bell
        </button>
      </div>
      <figure className="curve">
        <figcaption className="panel__label">The master, as the core measures it</figcaption>
        <div
          className="curve__bars"
          role="img"
          aria-label="The master's level, three bands of it, and its flux"
        >
          {FIGURES.map((key, i) => (
            <span
              key={key}
              className="curve__bar"
              data-state="ahead"
              style={{ height: `${FLOOR}%` }}
              ref={(el) => {
                bars.current[i] = el;
              }}
            />
          ))}
        </div>
      </figure>
      <ShownRow>
        <Shown label="The engine" value={said(live)} />
        <Shown label="Frames a second" value={sound.context()?.sampleRate?.toLocaleString("en") ?? "–"} />
      </ShownRow>
      <Line>
        Level, bass, mid, high and flux, left to right: the same five figures the sound sheet's tap draws
        from.{" "}
        {live === "fallback"
          ? "This browser could not run the core, so there are no meters and these voices play through plain Web Audio."
          : "The bars hold still until the first press, because there is no audio before it."}
      </Line>
    </>
  );
}
