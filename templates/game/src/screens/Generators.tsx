// @feature generators
import { fmt } from "watchpot/core";
import { type BuyMode, buyCount } from "watchpot/ui";
import { useGameState } from "../app/hooks";
import { glyphOf } from "../app/icons";
import { sound } from "../app/sound";
import { GENERATORS } from "../content/generators";
import { CURRENCY, MAIN } from "../content/words";
import { producers } from "../game/generators";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import s from "./screens.module.css";

/**
 * The generators: a panel each (the next shows once the one before it is owned) with what it makes and the price of
 * the chosen amount, every number read off the engine's `producers.select`.
 */
export function GeneratorList({ mode }: { mode: BuyMode }) {
  const st = useGameState((x) => x);
  const words = CURRENCY[MAIN];
  const rules = producers.select;
  const visible = GENERATORS.filter((_, i) => i === 0 || rules.owned(st, GENERATORS[i - 1]?.id ?? "") > 0);
  return (
    <div className={s.grid}>
      {visible.map((g) => {
        const affordable = rules.affordable(st, g.id);
        const want = buyCount(mode, { affordable, untilNext: rules.untilMilestone(st, g.id) ?? 0 });
        const count = Math.max(1, want);
        const ok = want > 0 && affordable >= want;
        const buy = () => (mode === "max" ? st.generators.buyMax(g.id) > 0 : st.generators.buy(g.id, count));
        return (
          <Panel
            key={g.id}
            heading={g.name}
            level={3}
            aside={<span className={s.num}>{rules.owned(st, g.id)}</span>}
          >
            <p className="small">{g.line}</p>
            <div className={s.row}>
              <span className={`small ${s.muted}`}>+{fmt(rules.rate(st, g.id), { decimals: 1 }).text} a second</span>
              <Button
                variant={ok ? "primary" : "secondary"}
                disabled={!ok}
                cost={fmt(rules.price(st, g.id, count)).text}
                glyph={glyphOf(words.glyph)}
                unit={words.plural}
                onClick={() => buy() && sound.play("buy")}
              >
                {count > 1 ? `Get ${count}` : "Get"}
              </Button>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
