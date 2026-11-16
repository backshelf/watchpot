// @feature clicker
import { comboShown, fmt } from "watchpot/core";
import { useClockNow } from "watchpot/react";
import { useGameState, useGameStore } from "../app/hooks";
import { sound } from "../app/sound";
import { CLICKER } from "../content/clicker";
import { press } from "../game/clicker";
import { ClickTarget } from "../ui/ClickTarget";
import { Panel } from "../ui/Panel";
import s from "./screens.module.css";

/** The thing pressed: a press pays and floats its figure up from where it landed; the combo and the count under it. */
export function PressPanel() {
  const store = useGameStore();
  const clicker = useGameState((st) => st.clicker);
  const now = useClockNow(250);
  const combo = comboShown(clicker, now, press.combo);
  return (
    <Panel heading={CLICKER.name} level={2}>
      <div className={s.press}>
        <ClickTarget
          label={`${CLICKER.verb} ${CLICKER.name}`}
          onPress={() => {
            const paid = store.getState().clicker.click();
            if (!paid) return null;
            sound.play(paid.crit ? "crit" : "press");
            return `+${fmt(paid.amount).text}${paid.crit ? "!" : ""}`;
          }}
        >
          <span className="body-strong">{CLICKER.verb}</span>
        </ClickTarget>
        <div className={s.pressWords}>
          <p className="small">{CLICKER.line}</p>
          <p className={`small ${s.muted}`}>
            ×{combo.toFixed(1)} · {fmt(clicker.clicks).text} so far
          </p>
        </div>
      </div>
    </Panel>
  );
}
