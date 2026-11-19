// Page 3's panel: the example's own `Album` — one pool, one tile per surface — with the count and the budget as the
// panel's own steppers. The figures are the page's arithmetic, not the pool's: one context however many tiles.
import { useState } from "react";
import { useMediaQuery } from "watchpot/ui";
import type * as Example from "../../../../../docs/examples/shader-pool";
import { useExample } from "../../kit";
import { Stepper } from "./panel-bits";

export function ManySurfaces() {
  const { Album, MAX_LIVE } = useExample<typeof Example>();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [count, setCount] = useState(6);
  const [budget, setBudget] = useState(MAX_LIVE);
  return (
    <>
      <Album count={count} maxLive={budget} reduced={reduced} />
      <div className="readouts">
        <div className="readout">
          <span className="readout__label">Surfaces</span>
          <span className="readout__value num">{count}</span>
        </div>
        <div className="readout">
          <span className="readout__label">Animate at once</span>
          <span className="readout__value num">{budget}</span>
        </div>
        <div className="readout">
          <span className="readout__label">Contexts</span>
          <span className="readout__value num">1</span>
        </div>
      </div>
      <Stepper label="Surfaces" value={count} min={1} max={16} onChange={setCount} />
      <Stepper label="Animate at once" value={budget} min={1} max={12} onChange={setBudget} />
      <p className="shortcut__note">
        The newest tiles animate; the oldest past the budget hold the frame they had.
      </p>
    </>
  );
}
