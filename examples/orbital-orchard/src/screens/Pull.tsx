import { fmt, freshPity, publishedOdds, pullsUntilPity } from "watchpot/core";
import { type RarityTier, tierOf } from "watchpot/kit";
import { cx } from "watchpot/ui";
import { effectText } from "../app/effects";
import { useGameState, useGameStore } from "../app/hooks";
import { glyphOf } from "../app/icons";
import { useOpenSheet } from "../app/sheets";
import { BOX, BOX_NAME, GACHA_NAME, ITEMS, ODDS, PITY, PULL_PRICE, RARITY_NAME } from "../content/gacha";
import { CURRENCY, PREMIUM, type Rarity, TAB_NAMES, WORDS } from "../content/words";
import { Button, Chest, Panel, RarityChip } from "../ui";
import s from "./screens.module.css";

const LADDER = WORDS.rarities;
const TOP = LADDER.ids[LADDER.size - 1] as Rarity;
const NO_PITY = freshPity(PITY);
const tier = (r: Rarity): RarityTier => ({ ...tierOf(LADDER.ids, r), label: RARITY_NAME[r] });
const ODDS_ROWS = publishedOdds(LADDER, ODDS).map((row) => ({
  tier: tier(row.rarity),
  percent: `${row.percent}%`,
}));

/**
 * The graft bench: the kit with its odds and its guarantee, a graft or ten (free kits first), and the register of
 * every graft taken. A pull opens the reveal sheet.
 */
export function PullScreen() {
  const store = useGameStore();
  const openSheet = useOpenSheet();
  const premium = useGameState((st) => st.wallet[PREMIUM]);
  const pity = useGameState((st) => st.summon.pity[BOX]) ?? NO_PITY;
  const tokens = useGameState((st) => st.summon.tokens[BOX] ?? 0);
  const opened = useGameState((st) => st.summon.opened[BOX] ?? 0);
  const owned = useGameState((st) => st.collection.owned);
  const words = CURRENCY[PREMIUM];
  const until = pullsUntilPity(LADDER, pity, PITY, ODDS);
  const found = ITEMS.filter((it) => (owned[it.id] ?? 0) > 0).length;

  const open = (count: number) => {
    if (!store.getState().collection.pull(count)) return;
    openSheet({ kind: "reveal", n: opened + 1 });
  };

  return (
    <div className={s.screen}>
      <h1 className={s.title}>{TAB_NAMES.gacha}</h1>
      <Panel
        heading={GACHA_NAME}
        aside={tokens > 0 ? <span className="small">{tokens} free</span> : undefined}
      >
        <div className={s.bench}>
          <Chest name={BOX_NAME} odds={ODDS_ROWS} oddsLabel={`${BOX_NAME} odds`} glow={tier(TOP)} />
          <div className={s.benchText}>
            <p className="body">
              A cutting from somewhere else, taken onto one of ours. Every graft that takes raises something
              for good.
            </p>
            {until[TOP] !== undefined && (
              <p className={cx("small", s.muted)}>
                <span className={s.top}>{RARITY_NAME[TOP]}</span> guaranteed within{" "}
                <span className="num">{until[TOP]}</span> {until[TOP] === 1 ? "graft" : "grafts"}
              </p>
            )}
            <div className={s.actions}>
              {[1, 10].map((count) => {
                const free = Math.min(tokens, count);
                const price = PULL_PRICE * (count - free);
                const can = premium.gte(price);
                return (
                  <Button
                    key={count}
                    variant={count === 1 && can ? "primary" : "paper"}
                    disabled={!can}
                    cost={price > 0 ? fmt(price).text : undefined}
                    glyph={price > 0 ? glyphOf(words.glyph) : undefined}
                    currencyWord={words.plural}
                    onClick={() => open(count)}
                  >
                    {count === 1 ? (free ? "Graft one, free" : "Graft one") : "Graft ten"}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </Panel>
      <Panel
        heading="The register"
        level={3}
        aside={
          <span className="small num">
            {found}/{ITEMS.length}
          </span>
        }
      >
        <ul className={s.register}>
          {ITEMS.map((item) => {
            const n = owned[item.id] ?? 0;
            return (
              <li key={item.id} data-found={n > 0 || undefined}>
                <RarityChip tier={tier(item.rarity)} />
                <span className={s.entry}>
                  <span className={n ? "body" : cx("body", s.muted)}>{n ? item.name : "Not taken yet"}</span>
                  {n > 0 && <span className={cx("small", s.muted)}>{effectText(item.effect)} each</span>}
                </span>
                <span className={cx("num number-small", !n && s.muted)}>×{n}</span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
