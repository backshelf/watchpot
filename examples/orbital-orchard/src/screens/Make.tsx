import { fmt } from "watchpot/core";
import { cx, VisuallyHidden } from "watchpot/ui";
import { useGameState } from "../app/hooks";
import { glyphOf } from "../app/icons";
import { playPlant } from "../app/sound";
import { GENERATORS } from "../content/generators";
import { CURRENCY, MAIN, STAT, TAB_NAMES } from "../content/words";
import { generatorCost } from "../game/generators";
import { Button, Counter, Panel } from "../ui";
import s from "./screens.module.css";

/**
 * The orchard: the sunlight coming in, and the rows of trees, one row per kind with how many stand in it. The next
 * kind shows (unplanted) once the last has one tree; the one after that stays dark.
 */
export function MakeScreen() {
  const balance = useGameState((st) => st.wallet[MAIN]);
  const perSecond = useGameState((st) => st.generators.perSecond);
  const output = useGameState((st) => st.generators.output);
  const offline = useGameState((st) => st.generators.offline);
  const owned = useGameState((st) => st.generators.owned);
  const buy = useGameState((st) => st.generators.buy);
  const words = CURRENCY[MAIN];
  const shown = fmt(balance);
  const visible = GENERATORS.filter((_, i) => i === 0 || (owned[GENERATORS[i - 1]?.id ?? ""] ?? 0) > 0);
  const dark = GENERATORS[visible.length];
  // The one primary: the newest kind the sunlight can pay for. The rest stay on the grey block.
  const best = visible.findLast((g) => balance.gte(generatorCost(g, owned[g.id] ?? 0)))?.id;
  return (
    <div className={s.screen}>
      <h1 className={s.title}>{TAB_NAMES.make}</h1>
      <div className={s.hero}>
        <Counter
          glyph={glyphOf(words.glyph, 28)}
          label={words.plural}
          mantissa={shown.mantissa}
          suffix={shown.suffix}
          rate={`+${fmt(perSecond, { decimals: 1 }).text} per second`}
        />
        <p className={cx("small", s.muted)}>
          {STAT.output} <span className="num">×{output.toFixed(2)}</span> · {STAT.offline}{" "}
          <span className="num">{Math.round(offline * 100)}%</span> while you're away
        </p>
      </div>
      <Panel heading="The rows">
        <ul className={s.rows}>
          {visible.map((g) => {
            const n = owned[g.id] ?? 0;
            const cost = generatorCost(g, n);
            const affordable = balance.gte(cost);
            return (
              <li key={g.id} className={s.tree} data-planted={n > 0 || undefined}>
                <span className={cx("num", s.count)}>
                  {n}
                  <VisuallyHidden> planted</VisuallyHidden>
                </span>
                <div className={s.treeText}>
                  <p className={s.treeName}>{g.name}</p>
                  <p className={cx("small", s.muted)}>{g.line}</p>
                  <p className={cx("small", s.muted)}>
                    <span className="num">+{fmt(g.rate * output, { decimals: 1 }).text}</span> a second each
                  </p>
                </div>
                <Button
                  variant={g.id === best ? "primary" : "paper"}
                  disabled={!affordable}
                  cost={fmt(cost).text}
                  glyph={glyphOf(words.glyph)}
                  currencyWord={words.plural}
                  onClick={(event) => buy(g.id) && playPlant(event.currentTarget)}
                >
                  Plant
                </Button>
              </li>
            );
          })}
          {dark && (
            <li className={cx(s.tree, s.dark)}>
              <span className={cx("num", s.count)}>–</span>
              <p className={cx("small", s.muted, s.treeText)}>
                Another row is ready. It wants a {visible.at(-1)?.name.toLowerCase()} first.
              </p>
            </li>
          )}
        </ul>
      </Panel>
    </div>
  );
}
