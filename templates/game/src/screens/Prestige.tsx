// @feature prestige
import { fmt } from "watchpot/core";
import { useGameState } from "../app/hooks";
import { sound } from "../app/sound";
import { BONUS_PER_UNIT, PRESTIGE_CURRENCY, PRESTIGE_NAME, PRESTIGE_VERB } from "../content/prestige";
import { CURRENCY, MAIN, STAT, TAB_NAMES } from "../content/words";
import { prestigeGain } from "../game/prestige";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { Title } from "../ui/Title";
import s from "./screens.module.css";

/** The prestige layer: what is held, what a reset would pay, and the reset. */
export function PrestigeScreen() {
  const held = useGameState((st) => st.prestige.currency);
  const runs = useGameState((st) => st.prestige.runs);
  const gain = useGameState((st) => prestigeGain(st).toNumber());
  const earned = useGameState((st) => st.wallet.earned);
  const ascend = useGameState((st) => st.prestige.ascend);
  const unit = PRESTIGE_CURRENCY.plural.toLowerCase();
  return (
    <div className={s.screen}>
      <Title>{TAB_NAMES.prestige}</Title>
      <Panel heading={PRESTIGE_NAME}>
        <p className="body">
          {fmt(held).text} {unit} held: {STAT.output} ×{(1 + BONUS_PER_UNIT * held.toNumber()).toFixed(2)}.
        </p>
        <p className={`small ${s.muted}`}>
          {fmt(earned).text} {CURRENCY[MAIN].plural.toLowerCase()} this run · {runs} so far
        </p>
        <div className={s.row}>
          <span className="body-strong">
            +{fmt(gain).text} {unit}
          </span>
          <Button variant="primary" disabled={gain < 1} onClick={() => ascend() && sound.play("ascend")}>
            {PRESTIGE_VERB}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
