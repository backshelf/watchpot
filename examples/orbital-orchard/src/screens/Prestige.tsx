import { useState } from "react";
import { fmt } from "watchpot/core";
import { cx } from "watchpot/ui";
import { useGameState } from "../app/hooks";
import { playOrbit } from "../app/sound";
import { knobs } from "../content/knobs";
import { PRESTIGE_CURRENCY, PRESTIGE_VERB } from "../content/prestige";
import { CURRENCY, MAIN, STAT, TAB_NAMES } from "../content/words";
import { nextOrbitAt, prestigeGain } from "../game/prestige";
import { Button, Panel, ProgressBar } from "../ui";
import s from "./screens.module.css";

/** The yield multiplier a count of orbits held gives. */
const yieldOf = (orbits: number) => (1 + knobs.get("bonusPerUnit") * orbits).toFixed(2);

/**
 * Changing orbit: what a burn now would pay, as the screen's one big figure, the sunlight still to bank for one
 * more, and the burn (two presses: it takes the trees and the modules). The grafts, the seeds and the shower's
 * record come along; the orbits held sit at the foot.
 */
export function PrestigeScreen() {
  const held = useGameState((st) => st.prestige.currency.toNumber());
  const runs = useGameState((st) => st.prestige.runs);
  const gain = useGameState((st) => prestigeGain(st).toNumber());
  const earned = useGameState((st) => st.wallet.earned);
  const target = useGameState((st) => nextOrbitAt(st));
  const ascend = useGameState((st) => st.prestige.ascend);
  const [armed, setArmed] = useState(false);
  const unit = (n: number) => (n === 1 ? PRESTIGE_CURRENCY.name : PRESTIGE_CURRENCY.plural).toLowerCase();
  const ready = gain >= 1;
  const sun = CURRENCY[MAIN].plural;

  const burn = () => {
    if (!armed) return setArmed(true);
    setArmed(false);
    if (ascend()) playOrbit();
  };

  return (
    <div className={s.screen}>
      <h1 className={s.title}>{TAB_NAMES.prestige}</h1>
      <Panel heading="The next burn">
        <div className={s.burn}>
          <p className={s.gainLine} data-ready={ready || undefined}>
            <span className={cx("num", s.gain)}>+{fmt(gain).text}</span>
            <span className="body">{unit(gain)} on a burn now</span>
          </p>
          <ProgressBar
            value={Math.min(earned.toNumber(), target)}
            max={target}
            label={ready ? `${sun} toward one orbit more` : `${sun} toward a burn`}
            valueText={`${fmt(earned).text} of ${fmt(target).text}`}
            completeText="Complete"
          />
          <p className={cx("body", s.muted)}>
            A higher orbit sees more sun. The trees and the modules don't survive the burn; the grafts and the
            seeds do. Every orbit held adds {Math.round(knobs.get("bonusPerUnit") * 100)}% to{" "}
            {STAT.output.toLowerCase()}
            {ready && (
              <>
                {" "}
                (<span className="num">×{yieldOf(held)}</span> now,{" "}
                <span className="num">×{yieldOf(held + gain)}</span> after)
              </>
            )}
            .
          </p>
          <div className={s.burnAction}>
            <Button variant="primary" size="large" disabled={!ready} onClick={burn}>
              {armed ? `Press again to burn for ${fmt(gain).text} ${unit(gain)}` : PRESTIGE_VERB}
            </Button>
          </div>
        </div>
      </Panel>
      <dl className={s.figures}>
        <div>
          <dt className="small">Orbits held</dt>
          <dd className="num number">{fmt(held).text}</dd>
        </div>
        <div>
          <dt className="small">{STAT.output} from them</dt>
          <dd className="num number">×{yieldOf(held)}</dd>
        </div>
        <div>
          <dt className="small">Orbits changed</dt>
          <dd className="num number">{runs}</dd>
        </div>
      </dl>
    </div>
  );
}
