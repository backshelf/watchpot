import { useGameClock } from "watchpot/react";
import { Foot } from "../sections/Foot";
import { Hero } from "../sections/Hero";
import { HowMade } from "../sections/HowMade";
import { Live } from "../sections/Live";
import { MadeWith } from "../sections/MadeWith";
import { ShaderLab } from "../sections/ShaderLab";
import { SimLab } from "../sections/SimLab";
import { Sound } from "../sections/Sound";
import { Systems } from "../sections/Systems";
import { Ui } from "../sections/Ui";
import { Mast } from "./Mast";
import { store } from "./store";

export function App() {
  // The clock alone: live ticks, the catch-up for time away, and the watch on other tabs of this page.
  const { taken } = useGameClock(store);

  return (
    <>
      <Mast />
      <main id="content">
        <Hero />
        <Live />
        <Systems />
        <SimLab />
        <Ui />
        <ShaderLab />
        <Sound />
        <MadeWith />
        <HowMade />
        {taken ? (
          <p className="taken" role="status">
            This page is open in another tab, which has the save. The figures here have stopped; reload to
            take it back.
          </p>
        ) : null}
      </main>
      <Foot />
    </>
  );
}
