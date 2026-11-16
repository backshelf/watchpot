import { type Effect, fmt, rankCost } from "watchpot/core";
import { useGameState } from "../app/hooks";
import { glyphOf } from "../app/icons";
import { playRaise } from "../app/sound";
import { NODES, TREE_NAME } from "../content/tree";
import { CURRENCY, MAIN, STAT, type StatId, TAB_NAMES } from "../content/words";
import { Button, Tree, type TreeNodeView, type TreeWords } from "../ui";
import s from "./screens.module.css";

/** What a rank of an effect does, in the stat's own name. */
const effectText = (e: Effect) => {
  const name = STAT[e.stat as StatId];
  return e.mul !== undefined
    ? `${name} ×${e.mul} a rank`
    : `${name} +${Math.round(Number(e.add ?? 0) * 100)}% a rank`;
};

/** What the tree says around its tiles. */
const TREE_WORDS: TreeWords = {
  node: (n) => `About ${n.name}, ${n.state === "maxed" ? "max rank" : `rank ${n.rank} of ${n.maxRank}`}`,
  maxed: "Max",
  affordable: ", affordable",
  unaffordable: ", not enough yet",
  tier: (col) => `Tier ${col + 1}`,
};

/** The upgrade tree: every node on its tier, the chosen one's buy in the rail. */
export function UpgradesScreen() {
  const ranks = useGameState((st) => st.upgrades.ranks);
  const balance = useGameState((st) => st.wallet[MAIN]);
  const buy = useGameState((st) => st.upgrades.buy);
  const words = CURRENCY[MAIN];
  const nodes: TreeNodeView[] = NODES.map((n) => {
    const rank = ranks[n.id] ?? 0;
    const locked = n.requires.some((r) => !(ranks[r] ?? 0));
    const price = rank < n.maxLevel ? rankCost(n, rank)[0] : undefined;
    const affordable = price ? balance.gte(price.amount) : false;
    return {
      id: n.id,
      name: n.name,
      line: n.line,
      col: n.col,
      row: n.row,
      rank,
      maxRank: n.maxLevel,
      state: rank >= n.maxLevel ? "maxed" : locked ? "locked" : "open",
      price: price ? fmt(price.amount).text : undefined,
      affordable,
      requires: n.requires,
      effect: n.effects.map(effectText).join(", "),
      action:
        price && !locked ? (
          <Button
            variant={affordable ? "primary" : "paper"}
            disabled={!affordable}
            cost={fmt(price.amount).text}
            glyph={glyphOf(words.glyph)}
            currencyWord={words.plural}
            onClick={(event) => buy(n.id).ok && playRaise(event.currentTarget)}
          >
            Raise
          </Button>
        ) : undefined,
    };
  });
  return (
    <div className={s.screen}>
      <h1 className={s.title}>{TAB_NAMES.tree}</h1>
      <Tree label={TREE_NAME} nodes={nodes} words={TREE_WORDS} />
    </div>
  );
}
