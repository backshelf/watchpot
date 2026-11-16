// Sheet five: the headless UI. One small panel for the pot, built from `watchpot/ui` primitives, in two prints: as
// the engine ships it (no class name on any element, the browser's own drawing) and as this page dresses it. The
// components stay mounted across the flip; only the class names change. Beside it, what the engine is writing on
// the part in hand, read off the DOM; under it, the printed figures fed by the pot.
import { useCallback, useEffect, useRef, useState } from "react";
import { Figures } from "./ui/Figures";
import { Panel } from "./ui/Panel";
import { Readout } from "./ui/Readout";
import { createWatch, type Watch } from "./ui/watch";

const PRINTS = [
  { dressed: false, label: "As shipped" },
  { dressed: true, label: "As this page dresses it" },
] as const;

export function Ui() {
  const [dressed, setDressed] = useState(true);
  const [watch, setWatch] = useState<Watch | null>(null);
  const specimen = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const w = createWatch();
    const el = specimen.current;
    if (el) {
      w.observe(el);
      w.counting(el);
      w.hold(el.querySelector('[role="tab"][aria-selected="true"]'));
    }
    setWatch(w);
    const onFocus = (e: FocusEvent) => w.hold(e.target);
    const onPoint = (e: PointerEvent) => w.hold(e.target);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("pointerover", onPoint);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("pointerover", onPoint);
      w.stop();
    };
  }, []);

  // The dialog's layer is portalled out of the page; the read-out watches it while it is there.
  const layerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !watch) return;
      const forget = watch.observe(node);
      return forget;
    },
    [watch],
  );

  return (
    <section className="sheet section" id="ui" aria-labelledby="ui-title">
      <header className="section__head">
        <h2 id="ui-title">Behaviour, with no look.</h2>
        <p className="section__lede">
          <code>watchpot/ui</code> is headless primitives: the behaviour, keyboard, focus, ARIA and state of a
          control come from the engine, and every pixel and every word from the game. No stylesheet, no class
          name, no font, no colour: each part says its state in <code>data-*</code> attributes, so a game
          styles it from CSS alone. Flip the panel to the print the engine ships.
        </p>
      </header>

      <div className="ui">
        <div className="ui__left">
          <div className="plate ui__board">
            <div className="plate__head ui__boardhead">
              <h3>The pot's panel</h3>
              <fieldset className="seg ui__flip">
                <legend className="visually-hidden">Which print</legend>
                {PRINTS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={dressed === p.dressed}
                    onClick={() => setDressed(p.dressed)}
                  >
                    {p.label}
                  </button>
                ))}
              </fieldset>
            </div>
            <div className="plate__body">
              <div className="ui__specimen" data-print={dressed ? "dressed" : "bare"} ref={specimen}>
                <Panel dressed={dressed} layerRef={layerRef} />
              </div>
            </div>
          </div>
          <p className="caption ui__caption">
            The same components stay mounted across the flip, with their state; only the class names change.
            Lifting the lid and venting are the store's own actions, so the game above feels them. The sheet
            is the browser's own <code>&lt;dialog&gt;</code> element, handed the engine's focus trap, Escape
            and inert page through <code>asChild</code>.
          </p>
        </div>
        {watch ? <Readout watch={watch} /> : <div className="plate uiread" />}
      </div>

      <Figures />

      <dl className="tb">
        <div>
          <dt className="lettering">Entry</dt>
          <dd className="num">watchpot/ui</dd>
        </div>
        <div>
          <dt className="lettering">Peers</dt>
          <dd className="num">react, react-dom</dd>
        </div>
        <div>
          <dt className="lettering">On the panel</dt>
          <dd>Tabs, HoldButton, Progress, Dialog, ConfirmPress, Slider, Toggle, Countdown, Toaster</dd>
        </div>
        <div>
          <dt className="lettering">Recipe</dt>
          <dd>
            <a href="./docs/ui.html">Headless UI</a>
          </dd>
        </div>
      </dl>
    </section>
  );
}
