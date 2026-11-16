import { useEffect, useMemo, useState } from "react";
import { dueMilestones, ZERO } from "watchpot/core";
import { DevPanel } from "watchpot/devtools";
import { useGameRuntime } from "watchpot/react";
import type { SheetRegistry } from "watchpot/ui";
import { NETS, SHOWER } from "../content/shower";
import { NAME } from "../content/words";
import { GraftReveal } from "../screens/GraftReveal";
import { Shell } from "../ui";
import { AboutSheet } from "./AboutSheet";
import s from "./app.module.css";
import { Header } from "./Header";
import { useGameState, useGameStore } from "./hooks";
import { OpenSheetContext, type Sheet } from "./sheets";
import { sound } from "./sound";
import { TAB_WORDS, TABS, type Tab } from "./tabs";

const SHEETS: SheetRegistry<Sheet> = {
  about: (_sheet, close) => <AboutSheet onClose={close} />,
  reveal: (sheet, close) => <GraftReveal n={sheet.n} onClose={close} />,
};

/** What waits on the shower's tab: whole nets to cast while it falls, and milestones to claim. */
function useShowerCount() {
  return useGameState((st) => {
    const rt = st.events.runtime;
    const nets = st.events.live ? Math.floor((rt.currencies[NETS] ?? ZERO).toNumber()) : 0;
    return nets + dueMilestones(SHOWER, rt).length;
  });
}

/** The page's hash, for the dev panel's route (`#dev`). */
function useRoute() {
  const [route, setRoute] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setRoute(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

/** The game page: the game's shell over its tabs, the header, the sheets, and the dev panel on `#dev`. */
export function App() {
  const store = useGameStore();
  const [tab, setTab] = useState<Tab>("make");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const route = useRoute();
  const motion = useGameState((st) => st.settings.motion);
  const soundOn = useGameState((st) => st.settings.sound);
  const { taken } = useGameRuntime(store, {
    motion,
    scheme: "system",
    sound: { engine: sound, on: soundOn },
  });
  const showerCount = useShowerCount();
  const tabs = useMemo(
    () => TABS.map((t) => (t.id === "event" ? { ...t, count: showerCount } : t)),
    [showerCount],
  );
  return (
    <OpenSheetContext.Provider value={setSheet}>
      <Shell<Tab, Sheet>
        label={NAME}
        tabs={tabs}
        tab={tab}
        onSelectTab={setTab}
        tabWords={TAB_WORDS}
        sheets={SHEETS}
        sheet={sheet}
        onCloseSheet={() => setSheet(null)}
        header={() => <Header onAbout={() => setSheet({ kind: "about" })} />}
      >
        {taken && (
          <div role="alert" className={s.taken}>
            {NAME} is open in another tab. Play there, or close it and reload this one.
          </div>
        )}
        {process.env.NODE_ENV !== "production" && route === "#dev" && (
          <DevPanel onClose={() => (location.hash = "")} />
        )}
      </Shell>
    </OpenSheetContext.Provider>
  );
}
