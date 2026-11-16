// The specimen: one small control panel for the pot, built from `watchpot/ui` primitives and acting on the page's
// real store. `dressed` is the only thing the flip changes: with it, each part takes this page's class names; without
// it, no element on the panel carries a class at all and the browser draws what the engine hands it.
import { useEffect, useRef, useState } from "react";
import { type Decimal, formatter } from "watchpot/core";
import {
  ConfirmPress,
  Countdown,
  createToasts,
  Dialog,
  HoldButton,
  Portal,
  Progress,
  Slider,
  Tabs,
  Toaster,
  Toggle,
} from "watchpot/ui";
import { store, useGameView } from "../../app/store";
import { HEAT, heat, pressureBonus, type ToyState, ventNow } from "../../game/toy";

const f = formatter();

/** The panel's notices: one store, pushed from the timer and the valve. */
const notices = createToasts({ max: 2, duration: 7000 });

/** The cheapest heat source the pot cannot pay for yet: what the steam is saving towards. */
function savingFor(s: ToyState) {
  for (const g of HEAT) {
    const price = heat.rules.price(s, g.id, 1);
    if (s.wallet.steam.lt(price)) return { name: g.name, price };
  }
  const last = HEAT[HEAT.length - 1] ?? HEAT[0];
  return { name: last.name, price: heat.rules.price(s, last.id, 1) };
}

const share = (part: Decimal, whole: Decimal) => (whole.lte(0) ? 1 : Math.min(1, part.div(whole).toNumber()));

interface PanelProps {
  dressed: boolean;
  /** The dialog's layer, for the read-out to watch while it is open. */
  layerRef: (node: HTMLDivElement | null) => void;
}

export function Panel({ dressed, layerRef }: PanelProps) {
  const s = useGameView();
  const k = (name: string) => (dressed ? name : undefined);
  const print = dressed ? "dressed" : "bare";

  const [tab, setTab] = useState("heat");
  const [venting, setVenting] = useState(false);
  const [watchFor, setWatchFor] = useState(20);
  const [watching, setWatching] = useState(false);
  const [left, setLeft] = useState(20);
  const started = useRef<{ at: number; boiled: Decimal; for: number } | null>(null);

  // The page's root goes inert while the sheet is open; the sheet itself is portalled out of it.
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => setRoot(document.getElementById("root")), []);

  // The countdown owns no clock: the panel ticks it, only while the pot is being watched.
  useEffect(() => {
    if (!watching) {
      setLeft(watchFor);
      return;
    }
    const begin = started.current;
    if (!begin) return;
    const tick = () => setLeft(Math.max(0, begin.for - (performance.now() - begin.at) / 1000));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [watching, watchFor]);

  const watch = (on: boolean) => {
    started.current = on
      ? { at: performance.now(), boiled: store.getState().wallet.boiled, for: watchFor }
      : null;
    setWatching(on);
  };

  const watched = () => {
    const begin = started.current;
    const made = begin ? store.getState().wallet.boiled.sub(begin.boiled).max(0) : null;
    notices.push({
      title: `Watched for ${begin?.for ?? watchFor} s.`,
      body: made ? `The pot boiled ${f.num(made)} steam all the same.` : undefined,
    });
    watch(false);
  };

  const saving = savingFor(s);
  const gain = ventNow(s);
  const ready = share(gain, s.valve.lifetime.max(3));

  return (
    <div className={k("pot")}>
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className={k("pot__tabs")} aria-label="The pot's panel">
          <Tabs.Tab className={k("pot__tab")} value="heat">
            Heat
          </Tabs.Tab>
          <Tabs.Tab className={k("pot__tab")} value="valve">
            Valve
          </Tabs.Tab>
          <Tabs.Tab className={k("pot__tab")} value="watch">
            Watch
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel className={k("pot__panel")} value="heat" keepMounted>
          <div className={k("pot__row")}>
            <p className={k("pot__figure")}>
              <span className={k("pot__label")}>Steam</span>{" "}
              <span className={k("pot__value")}>{f.num(s.wallet.steam)}</span>{" "}
              <span className={k("pot__aside")}>{f.rate(s.heat.perSecond.steam ?? 0)}</span>
            </p>
            <HoldButton
              className={k("button button--primary pot__lid")}
              action={() => store.getState().lid.press()}
            >
              Lift the lid
            </HoldButton>
          </div>
          <p className={k("pot__hint")}>Hold it down: the press repeats, faster the longer it is held.</p>
          <Progress
            className={k("pot__steps")}
            aria-label={`Steam towards a ${saving.name}`}
            value={Math.floor(Math.min(s.wallet.steam.toNumber(), saving.price.toNumber()))}
            max={Math.ceil(saving.price.toNumber())}
            steps={12}
            valueText={`${f.num(s.wallet.steam)} of ${f.num(saving.price)} steam`}
          >
            <span className={k("pot__stepsays")}>
              Towards a {saving.name}: {f.num(s.wallet.steam.min(saving.price))} of {f.num(saving.price)}
            </span>
          </Progress>
        </Tabs.Panel>

        <Tabs.Panel className={k("pot__panel")} value="valve" keepMounted>
          <div className={k("pot__row")}>
            <p className={k("pot__figure")}>
              <span className={k("pot__label")}>A vent now pays</span>{" "}
              <span className={k("pot__value")}>{f.num(gain)}</span>{" "}
              <span className={k("pot__aside")}>pressure</span>
            </p>
            <p className={k("pot__figure")}>
              <span className={k("pot__label")}>Venting has paid</span>{" "}
              <span className={k("pot__value")}>{f.num(s.valve.lifetime)}</span>{" "}
              <span className={k("pot__aside")}>
                {f.times(pressureBonus(s.valve.lifetime))} under the pot
              </span>
            </p>
          </div>
          <Dialog.Root open={venting} onOpenChange={setVenting} inertTarget={root}>
            <Dialog.Trigger className={k("button pot__open")}>Vent the pot…</Dialog.Trigger>
            {venting ? (
              <Portal>
                <div className="pot-layer" data-print={print} ref={layerRef}>
                  <Dialog.Scrim className={k("pot__scrim")} />
                  <Dialog.Panel className={k("pot__sheet")} asChild>
                    <dialog open>
                      <Dialog.Title className={k("pot__sheettitle")}>Vent the pot</Dialog.Title>
                      <Dialog.Description className={k("pot__sheetline")}>
                        The run starts over: the steam and every heat source go. The pressure stays, and
                        everything under the pot makes more for it. It is {Math.round(ready * 100)}% of the
                        way to what the auto-player waits for.
                      </Dialog.Description>
                      <div className={k("pot__sheetactions")}>
                        <ConfirmPress
                          className={k("button pot__confirm")}
                          disabled={!gain.gt(0)}
                          onConfirm={() => {
                            store.getState().valve.vent();
                            notices.push({
                              title: `Vented for ${f.num(gain)} pressure.`,
                              body: "The run starts over.",
                            });
                            setVenting(false);
                          }}
                        >
                          {(armed) =>
                            !gain.gt(0)
                              ? "Nothing to vent yet"
                              : armed
                                ? "Press again: the run starts over"
                                : `Vent for ${f.num(gain)} pressure`
                          }
                        </ConfirmPress>
                        <Dialog.Close className={k("button pot__close")}>Not now</Dialog.Close>
                      </div>
                    </dialog>
                  </Dialog.Panel>
                </div>
              </Portal>
            ) : null}
          </Dialog.Root>
        </Tabs.Panel>

        <Tabs.Panel className={k("pot__panel")} value="watch" keepMounted>
          <div className={k("pot__row")}>
            <p className={k("pot__field")}>
              <label className={k("pot__label")} htmlFor="pot-watch-for">
                Watch for
              </label>{" "}
              <Slider
                id="pot-watch-for"
                className={k("pot__slider")}
                min={5}
                max={60}
                step={5}
                value={watchFor}
                onValueChange={setWatchFor}
                disabled={watching}
                valueText={(v) => `${v} seconds`}
              />{" "}
              <span className={k("pot__aside")}>{watchFor} s</span>
            </p>
            <p className={k("pot__figure")}>
              <span className={k("pot__label")}>Left</span>{" "}
              <Countdown
                className={k("pot__count")}
                secondsLeft={Math.ceil(left)}
                warnUnder={watching ? 6 : 0}
                onEnd={watched}
                format={(n) => `00:${String(n).padStart(2, "0")}`}
              />
            </p>
          </div>
          <Toggle className={k("button pot__watch")} pressed={watching} onPressedChange={watch}>
            {watching ? "Stop watching" : "Watch the pot"}
          </Toggle>
        </Tabs.Panel>
      </Tabs.Root>

      <Toaster
        store={notices}
        className={k("pot__toasts")}
        aria-label="The pot's notices"
        renderToast={(t, dismiss) => (
          <>
            <p className={k("pot__toasttext")}>
              <strong className={k("pot__toasttitle")}>{t.title}</strong> {t.body}
            </p>
            <button type="button" className={k("button button--small pot__dismiss")} onClick={dismiss}>
              Dismiss
            </button>
          </>
        )}
      />
    </div>
  );
}
