// @feature dimensions
import { fmt } from "watchpot/core";
import { type BuyMode, buyCount } from "watchpot/ui";
import { useGameState } from "../app/hooks";
import { glyphOf } from "../app/icons";
import { sound } from "../app/sound";
import { TIERS } from "../content/dimensions";
import { CURRENCY, MAIN } from "../content/words";
import { chain } from "../game/dimensions";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import s from "./screens.module.css";

/**
 * The chain: a panel per open tier with what it holds, what it makes (of the tier below, or the main currency for the
 * lowest), its set bonus and how many more complete the set, and the price of the chosen amount; every number read
 * off the engine's `chain.chain`. "Max all" buys every open tier, highest first.
 */
export function TierList({ mode }: { mode: BuyMode }) {
  const st = useGameState((x) => x);
  const words = CURRENCY[MAIN];
  const rules = chain.select;
  const open = TIERS.filter((t) => rules.open(st, t.id));
  return (
    <>
      <div className={s.row}>
        <Button onClick={() => st.dimensions.maxAll() > 0 && sound.play("buy")}>Max all</Button>
      </div>
      <div className={s.grid}>
        {open.map((t, i) => {
          const affordable = rules.affordable(st, t.id);
          const want = buyCount(mode, { affordable, untilNext: rules.untilSet(st, t.id) });
          const count = Math.max(1, want);
          const ok = want > 0 && affordable >= want;
          const buy = () => (mode === "max" ? st.dimensions.buyMax(t.id) > 0 : st.dimensions.buy(t.id, count));
          const makes = i === 0 ? words.plural : (TIERS[i - 1]?.name ?? "");
          return (
            <Panel
              key={t.id}
              heading={t.name}
              level={3}
              aside={<span className={s.num}>{fmt(st.dimensions.amount[t.id] ?? 0).text}</span>}
            >
              <p className="small">{t.line}</p>
              <p className={`small ${s.muted}`}>
                ×{fmt(rules.setBonus(st, t.id)).text} · {rules.untilSet(st, t.id)} to the next ×2 · +
                {fmt(rules.perSecond(st, t.id), { decimals: 1 }).text} {makes} a second
              </p>
              <div className={s.row}>
                <span className={`small ${s.muted}`}>{st.dimensions.bought[t.id] ?? 0} bought</span>
                <Button
                  variant={ok ? "primary" : "secondary"}
                  disabled={!ok}
                  cost={fmt(rules.price(st, t.id, count)).text}
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
    </>
  );
}
