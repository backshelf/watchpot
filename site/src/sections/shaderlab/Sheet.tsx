// The specimen sheet: twelve ShaderTiles in one ShaderPool, so one WebGL context draws them all. The pool runs on a
// scheduler this page makes (the pool takes one), wrapped only to watch it: which tiles drew lately and which are
// on screen, so each tile can say whether it is animating, holding a frame or asleep.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  browserSchedulerDeps,
  createShaderScheduler,
  ShaderPool,
  type ShaderScheduler,
  ShaderTile,
} from "watchpot/shader";
import { fragmentOf, SPECIMENS, type Specimen } from "../../shaders/specimens";
import { Still } from "./Still";

/** How many tiles animate at once here: half the sheet, comfortable on a laptop beside the bench's canvas. */
export const MAX_LIVE = 6;

export type Inks = Record<"--paper" | "--ink" | "--live", string>;

interface Watch {
  scheduler: ShaderScheduler;
  /** Draws per tile canvas since the last read. */
  draws: Map<Element, number>;
  /** Whether each tile canvas is on screen (or within the pool's wake margin). */
  seen: Map<Element, boolean>;
}

function watchedScheduler(reduced: () => boolean): Watch {
  const draws = new Map<Element, number>();
  const seen = new Map<Element, boolean>();
  const deps = browserSchedulerDeps(reduced);
  const base = createShaderScheduler(
    {
      ...deps,
      observe: (el, onChange) =>
        deps.observe(el, (visible) => {
          seen.set(el, visible);
          onChange(visible);
        }),
    },
    { maxLive: MAX_LIVE },
  );
  return {
    draws,
    seen,
    scheduler: {
      ...base,
      register: (el, draw) =>
        base.register(el, (now) => {
          draws.set(el, (draws.get(el) ?? 0) + 1);
          draw(now);
        }),
    },
  };
}

const WORDS = { live: "animating", held: "holding", asleep: "asleep" } as const;

function Tile({ specimen, inks }: { specimen: Specimen; inks: Inks | null }) {
  const fragment = useMemo(() => fragmentOf(specimen, specimen.source), [specimen]);
  if (!inks) return <Still kind={specimen.still} />;
  return (
    <ShaderTile
      className="slab__tilecanvas"
      fragment={fragment}
      uniforms={{
        u_paper: inks["--paper"],
        u_ink: inks["--ink"],
        u_live: inks["--live"],
        u_scale: 1,
        u_amount: specimen.amount.value,
        u_weight: 1,
        u_press: [0.5, 0.5],
        u_pulse: 0,
      }}
      time={specimen.animated ? undefined : 0}
      reducedTime={specimen.reducedTime}
      still={<Still kind={specimen.still} />}
      onError={(log) => console.warn(`watchpot site: the ${specimen.name} specimen did not build.\n${log}`)}
    />
  );
}

export function Sheet({
  inks,
  reduced,
  selected,
  onSelect,
}: {
  inks: Inks | null;
  reduced: boolean;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const [watch] = useState(() => watchedScheduler(() => reducedRef.current));
  const plate = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLFieldSetElement>(null);
  const counts = useRef<HTMLSpanElement>(null);
  const rate = useRef<HTMLSpanElement>(null);

  // A read of the pool four times a second, only while the sheet is on screen: each tile's state, and the draws.
  useEffect(() => {
    const el = plate.current;
    if (!el) return;
    let timer = 0;
    let last = { at: performance.now(), draws: watch.scheduler.stats().draws };
    const read = () => {
      const tiles = group.current?.querySelectorAll<HTMLElement>("[data-tile]") ?? [];
      const tally = { live: 0, held: 0, asleep: 0 };
      for (const tile of tiles) {
        const canvas = tile.querySelector("canvas");
        const drew = canvas ? (watch.draws.get(canvas) ?? 0) : 0;
        if (canvas) watch.draws.set(canvas, 0);
        const state: keyof typeof WORDS =
          !canvas || !watch.seen.get(canvas) ? "asleep" : drew >= 3 ? "live" : "held";
        tally[state]++;
        const run = tile.querySelector<HTMLElement>("[data-run]");
        if (run && run.dataset.run !== state) {
          run.dataset.run = state;
          const word = run.querySelector("span:last-child");
          if (word) word.textContent = WORDS[state];
        }
      }
      const now = performance.now();
      const draws = watch.scheduler.stats().draws;
      const perSecond = ((draws - last.draws) * 1000) / Math.max(1, now - last.at);
      last = { at: now, draws };
      if (counts.current)
        counts.current.textContent = `${tally.live} animating · ${tally.held} holding · ${tally.asleep} asleep`;
      if (rate.current)
        rate.current.textContent = `${Math.round(perSecond).toLocaleString("en")} draws a second`;
    };
    const start = () => {
      if (timer) return;
      read();
      timer = window.setInterval(read, 250);
    };
    const stop = () => {
      window.clearInterval(timer);
      timer = 0;
    };
    const io = new IntersectionObserver(([entry]) => (entry?.isIntersecting ? start() : stop()));
    io.observe(el);
    return () => {
      io.disconnect();
      stop();
    };
  }, [watch]);

  return (
    <div className="plate slab__sheet" ref={plate}>
      <div className="plate__head">
        <h3 id="slab-sheet-title">Specimens</h3>
        <p className="slab__stats num">
          <span>{SPECIMENS.length} tiles · 1 WebGL context</span>
          <span ref={counts} />
          <span ref={rate} />
        </p>
      </div>
      <ShaderPool maxLive={MAX_LIVE} reduced={reduced} scheduler={watch.scheduler}>
        <fieldset className="plate__body slab__tiles" ref={group}>
          <legend className="visually-hidden">Open a specimen on the bench</legend>
          {SPECIMENS.map((specimen, i) => (
            <label key={specimen.id} className="slab__tile" data-tile="">
              <input
                type="radio"
                name="slab-specimen"
                className="visually-hidden"
                checked={i === selected}
                onChange={() => onSelect(i)}
              />
              <span className="slab__plate">
                <Tile specimen={specimen} inks={inks} />
                <span className="slab__run lettering" data-run="held" aria-hidden="true">
                  <span className="slab__lamp" />
                  <span>{WORDS.held}</span>
                </span>
              </span>
              <span className="slab__label">
                <span className="slab__no num" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="slab__name lettering">
                  {specimen.name.split("_").map((part, j) => (
                    <span key={part}>
                      {j > 0 ? "_" : null}
                      {j > 0 ? <wbr /> : null}
                      {part}
                    </span>
                  ))}
                </span>
                <span className="slab__call num">{specimen.call}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </ShaderPool>
      <p className="slab__note">
        Every tile is a <code>ShaderTile</code> in one <code>ShaderPool</code>: one WebGL context draws them
        all and copies each into its own canvas (browsers keep about sixteen contexts). <code>maxLive</code>{" "}
        is {MAX_LIVE} here (the default is 12), so the newest {MAX_LIVE} on screen animate and the rest hold a
        true frame; a tile off screen sleeps.{" "}
        {reduced
          ? "Reduced motion is on: every tile holds one frame."
          : "The OKLAB plate is given its time, so it draws only on a change."}{" "}
        The counts are read from the pool in this browser.
      </p>
    </div>
  );
}
