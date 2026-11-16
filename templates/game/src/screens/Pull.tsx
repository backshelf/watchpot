// @feature gacha
import { fmt, freshPity, publishedOdds, pullsUntilPity } from "watchpot/core";
import { type RarityTier, tierOf } from "watchpot/kit";
import { useGameState, useGameStore } from "../app/hooks";
import { glyphOf } from "../app/icons";
import { sound } from "../app/sound";
import { BOX, BOX_NAME, ITEMS, ODDS, PITY, PULL_PRICE, RARITY_NAME } from "../content/gacha";
import { CURRENCY, PREMIUM, type Rarity, TAB_NAMES, WORDS } from "../content/words";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { RarityChip } from "../ui/RarityChip";
import { Title } from "../ui/Title";
import s from "./screens.module.css";

const LADDER = WORDS.rarities;
const TOP = LADDER.ids[LADDER.size - 1] as Rarity;
const ITEM = new Map(ITEMS.map((it) => [it.id, it]));
const NO_PITY = freshPity(PITY);
const tier = (r: Rarity): RarityTier => ({ ...tierOf(LADDER.ids, r), label: RARITY_NAME[r] });

/** The pulls: the box with its odds and guarantee, the last pull, and what has been found. */
export function PullScreen() {
  const store = useGameStore();
  const premium = useGameState((st) => st.wallet[PREMIUM]);
  const pity = useGameState((st) => st.summon.pity[BOX]) ?? NO_PITY;
  const owned = useGameState((st) => st.collection.owned);
  const last = useGameState((st) => st.collection.last);
  const pull = useGameState((st) => st.collection.pull);
  const words = CURRENCY[PREMIUM];
  const until = pullsUntilPity(LADDER, pity, PITY, ODDS);
  const open = (count: number) => {
    if (!pull(count)) return;
    // A top-rung find rings the rare cue in place of the plain one.
    const found = store.getState().collection.last;
    sound.play(found.some((id) => ITEM.get(id)?.rarity === TOP) ? "rare" : "pull");
  };
  return (
    <div className={s.screen}>
      <Title>{TAB_NAMES.gacha}</Title>
      <Panel heading={BOX_NAME}>
        <ul className={s.list} aria-label="Odds">
          {publishedOdds(LADDER, ODDS).map((row) => (
            <li key={row.rarity} className={s.item}>
              <RarityChip tier={tier(row.rarity)} />
              <span className={s.num}>{row.percent}%</span>
            </li>
          ))}
        </ul>
        {until[TOP] !== undefined && (
          <p className={`small ${s.muted}`}>
            {RARITY_NAME[TOP]} guaranteed within {until[TOP]} pulls
          </p>
        )}
        <div className={s.row}>
          {[1, 10].map((count) => (
            <Button
              key={count}
              variant={premium.gte(PULL_PRICE * count) ? "primary" : "secondary"}
              disabled={premium.lt(PULL_PRICE * count)}
              cost={fmt(PULL_PRICE * count).text}
              glyph={glyphOf(words.glyph)}
              unit={words.plural}
              onClick={() => open(count)}
            >
              Pull {count}
            </Button>
          ))}
        </div>
      </Panel>
      {last.length > 0 && (
        <Panel heading="Last pull" level={3}>
          <ul className={s.list}>
            {last.map((id, i) => {
              const item = ITEM.get(id);
              return item ? (
                <li key={`${id}-${i}`} className={s.item}>
                  <span className="body-strong">{item.name}</span>
                  <RarityChip tier={tier(item.rarity)} />
                </li>
              ) : null;
            })}
          </ul>
        </Panel>
      )}
      <Panel heading="Found" level={3}>
        <ul className={s.list}>
          {ITEMS.map((item) => (
            <li key={item.id} className={s.item}>
              <span className={owned[item.id] ? "body" : `body ${s.muted}`}>
                {owned[item.id] ? item.name : "Not found yet"}
              </span>
              <span className={s.num}>×{owned[item.id] ?? 0}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
