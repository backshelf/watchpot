// The printed figures: `watchpot/ui`'s small read-outs in `currentColor`, each fed by the pot. The store is read
// once a second; the plates redraw only while they are on screen.
import { useEffect, useRef, useState } from "react";
import { formatter } from "watchpot/core";
import { Barcode, Ruler, Sparkline, SplitFlap } from "watchpot/ui";
import { store } from "../../app/store";
import { ventNow } from "../../game/toy";

const f = formatter();
const SECONDS = 60;

interface Reading {
  steam: number[];
  code: string;
  rate: string;
  valve: number;
  vent: string;
  needs: string;
}

function readPot(history: number[]): Reading {
  const s = store.getState();
  const gain = ventNow(s);
  const needs = s.valve.lifetime.max(3);
  return {
    steam: history,
    code: `STEAM ${f.num(s.wallet.steam)}`,
    rate: f.rate(s.heat.perSecond.steam ?? 0),
    valve: needs.lte(0) ? 1 : Math.min(1, gain.div(needs).toNumber()),
    vent: f.num(gain),
    needs: f.num(needs),
  };
}

export function Figures() {
  const row = useRef<HTMLDivElement>(null);
  const history = useRef<number[]>([]);
  const shown = useRef(false);
  const [r, setR] = useState<Reading>(() => readPot([]));

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      shown.current = entry?.isIntersecting ?? false;
    });
    io.observe(el);
    // Sampling is a read of the state once a second; the drawing waits until someone can see it.
    const sample = () => {
      const steam = store.getState().wallet.steam.toNumber();
      history.current = [...history.current, Number.isFinite(steam) ? steam : 0].slice(-SECONDS);
      if (shown.current) setR(readPot(history.current));
    };
    sample();
    const id = setInterval(sample, 1000);
    return () => {
      clearInterval(id);
      io.disconnect();
    };
  }, []);

  return (
    <div className="uifig" ref={row}>
      {/* Tone is hatching: the sparkline's area is filled with this, not a tint. */}
      <svg className="uifig__defs" aria-hidden="true" width="0" height="0">
        <pattern
          id="uifig-hatch"
          patternUnits="userSpaceOnUse"
          width="5"
          height="5"
          patternTransform="rotate(-45)"
        >
          <path d="M0 0V5" />
        </pattern>
      </svg>
      <figure className="plate uifig__plate">
        <div className="plate__head">
          <h3>Barcode</h3>
        </div>
        <div className="plate__body">
          <Barcode className="uifig__barcode" value={r.code} label={`A Code 128 barcode of “${r.code}”`} />
          <p className="num uifig__human">{r.code}</p>
          <figcaption className="caption">
            The steam figure as Code 128, re-read each second. It scans.
          </figcaption>
        </div>
      </figure>

      <figure className="plate uifig__plate">
        <div className="plate__head">
          <h3>Split flap</h3>
        </div>
        <div className="plate__body">
          <SplitFlap className="uifig__flaps num" text={r.rate} />
          <figcaption className="caption">
            Steam per second. Only a cell whose character changes is a new element, so only it turns.
          </figcaption>
        </div>
      </figure>

      <figure className="plate uifig__plate">
        <div className="plate__head">
          <h3>Sparkline</h3>
        </div>
        <div className="plate__body">
          <Sparkline
            className="uifig__spark"
            values={r.steam.length > 1 ? r.steam : [0, 0]}
            label={`Steam over the last ${r.steam.length} seconds`}
            width={240}
            height={64}
            min={0}
            max={Math.max(1, ...r.steam)}
            area
          />
          <figcaption className="caption">
            Steam over the last minute, a point a second. Each drop is a purchase or a vent.
          </figcaption>
        </div>
      </figure>

      <figure className="plate uifig__plate">
        <div className="plate__head">
          <h3>Ruler</h3>
        </div>
        <div className="plate__body">
          <Ruler className="uifig__ruler" ticks={40} major={10} at={r.valve} />
          <p className="num uifig__human">
            {r.vent} of {r.needs} pressure
          </p>
          <figcaption className="caption">
            The valve. The caret reaches the end when a vent would pay as much as all venting so far, and at
            least 3.
          </figcaption>
        </div>
      </figure>
    </div>
  );
}
