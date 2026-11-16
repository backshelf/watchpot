// @feature achievements
import { fmt } from "watchpot/core";
import type { AchievementRow, AchievementWords } from "watchpot/ui";
import { useGameState } from "../app/hooks";
import { tileMark } from "../app/icons";
import { ACHIEVEMENTS, POWER, type When, WALL_NAME } from "../content/achievements";
import { CURRENCY, MAIN, STAT, TAB_NAMES } from "../content/words";
import { wall } from "../game/achievements";
import { AchievementWall } from "../ui/AchievementWall";
import { Title } from "../ui/Title";
import s from "./screens.module.css";
// @if generators
import { GENERATORS } from "../content/generators";
// @end
// @if dimensions
import { TIERS } from "../content/dimensions";
// @end
// @if clicker
import { CLICKER } from "../content/clicker";
// @end
// @if prestige
import { PRESTIGE_VERB } from "../content/prestige";
// @end
// @if tree
import { TREE_NAME } from "../content/tree";
// @end

/** A producer's name by id, for "own" conditions. */
const PRODUCER = new Map<string, string>([
  // @if generators
  ...GENERATORS.map((g): [string, string] => [g.id, g.name]),
  // @end
  // @if dimensions
  ...TIERS.map((t): [string, string] => [t.id, t.name]),
  // @end
]);

/** What a condition asks, in words. */
function ask(w: When): string {
  if ("own" in w) return `Own ${w.count} ${PRODUCER.get(w.own) ?? w.own}.`;
  if ("earned" in w) return `Make ${fmt(w.earned).text} ${CURRENCY[MAIN].plural.toLowerCase()} in one run.`;
  // @if clicker
  if ("clicks" in w) return `${CLICKER.verb} ${CLICKER.name.toLowerCase()} ${fmt(w.clicks).text} times.`;
  // @end
  // @if prestige
  if ("runs" in w) return `${PRESTIGE_VERB} ${w.runs === 1 ? "once" : `${w.runs} times`}.`;
  // @end
  // @if tree
  if ("nodes" in w) return `Raise ${w.nodes} of ${TREE_NAME.toLowerCase()}.`;
  // @end
  // @if gacha
  if ("pulls" in w) return `Pull ${fmt(w.pulls).text} times.`;
  // @end
  return "";
}

const ASK = new Map(ACHIEVEMENTS.map((a) => [a.id, ask(a.when)]));

/** What the wall says around its tiles. */
const WORDS: AchievementWords = { hiddenName: "???", hiddenLine: "A secret.", earned: ", earned", locked: ", not yet" };

/** The wall: every achievement in rows of eight, and what the earned ones give. */
export function AchievementsScreen() {
  const earned = useGameState((st) => st.achievements.earned);
  const rows: AchievementRow[] = wall.board.rows(earned).map((row) => ({
    complete: row.complete,
    tiles: row.tiles.map((tile) => ({
      id: tile.achievement.id,
      name: tile.achievement.name,
      line: (
        <>
          {tile.achievement.line} <em>{ASK.get(tile.achievement.id)}</em>
        </>
      ),
      reward: `${STAT.output} ×${POWER.each}`,
      earned: tile.earned,
      hidden: tile.hidden,
    })),
  }));
  const count = wall.board.count(earned);
  return (
    <div className={s.screen}>
      <Title>{TAB_NAMES.achievements}</Title>
      <p className={`small ${s.muted}`}>
        {count} of {ACHIEVEMENTS.length} · {STAT.output} ×{fmt(wall.board.power(earned, POWER), { decimals: 2 }).text}
      </p>
      <AchievementWall
        label={WALL_NAME}
        rows={rows}
        words={WORDS}
        icon={(tile) => tileMark(tile.earned, tile.hidden ?? false)}
      />
    </div>
  );
}
