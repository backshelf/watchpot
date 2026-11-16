import type { Decimal } from "watchpot/core";
import { DevPanel, useGameRuntime } from "watchpot/react";
import type { SheetRegistry } from "watchpot/ui";
import { useEffect, useState } from "react";
import { LATE_RATE } from "../content/economy";
import { NAME } from "../content/words";
import { incomeOf } from "../game/income";
import { BACKDROP } from "../shaders/backdrop";
import { Backdrop } from "../ui/Backdrop";
import { Shell } from "../ui/Shell";
import { AboutSheet } from "./AboutSheet";
import s from "./app.module.css";
import { Header } from "./Header";
import { useGameState, useGameStore } from "./hooks";
import { sound } from "./sound";
import { TABS, type Tab } from "./tabs";
// @if achievements
import { EarnedToasts } from "./Earned";
// @end
// @if visitor
import { VisitorLayer } from "./Visitor";
// @end

/** The global sheets, by kind. A new sheet adds its kind here and its line to the registry. */
export type Sheet = { kind: "about" };

const SHEETS: SheetRegistry<Sheet> = {
  about: (_sheet, close) => <AboutSheet onClose={close} />,
};

/** How well the run is going, 0..1: the income on a log scale up to `LATE_RATE`, in steps of a hundredth. */
const heatOf = (income: Decimal) =>
  Math.round(Math.min(1, income.add(1).log10().toNumber() / Math.log10(LATE_RATE)) * 100) / 100;

/** The page's hash, kept current as it changes: `#dev` opens the developer's panel. */
function useHash() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const read = () => setHash(location.hash);
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);
  return hash;
}

/**
 * The game page: the shell over the game's tabs, the header, the backdrop and the sheets. In a development build
 * `#dev` opens the engine's dev panel (time warp, each feature's state, the save); `DevPanel` draws nothing in a
 * production one.
 */
export function App() {
  const store = useGameStore();
  const hash = useHash();
  const [tab, setTab] = useState<Tab>("make");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const motion = useGameState((st) => st.settings.motion);
  const soundOn = useGameState((st) => st.settings.sound);
  const heat = useGameState((st) => heatOf(incomeOf(st)));
  const { taken } = useGameRuntime(store, {
    motion,
    scheme: "system",
    sound: { engine: sound, on: soundOn },
  });
  return (
    <Shell<Tab, Sheet>
      label={NAME}
      tabs={TABS}
      tab={tab}
      onSelectTab={setTab}
      sheets={SHEETS}
      sheet={sheet}
      onCloseSheet={() => setSheet(null)}
      header={() => <Header onAbout={() => setSheet({ kind: "about" })} />}
      backdrop={
        BACKDROP && (
          <Backdrop
            fragment={BACKDROP.fragment}
            still={BACKDROP.still}
            reducedTime={BACKDROP.reducedTime}
            heat={heat}
          />
        )
      }
    >
      {/* @if visitor */}
      <VisitorLayer />
      {/* @end */}
      {/* @if achievements */}
      <EarnedToasts />
      {/* @end */}
      {hash === "#dev" && (
        <DevPanel
          onClose={() => {
            location.hash = "";
          }}
        />
      )}
      {taken && (
        <div role="alert" className={s.taken}>
          {NAME} is open in another tab. Play there, or close it and reload this one.
        </div>
      )}
    </Shell>
  );
}
