// @feature tree
import { type Effect, fmt, rankCost } from "watchpot/core";
import { useGameState } from "../app/hooks";
import { glyphOf } from "../app/icons";
import { sound } from "../app/sound";
import { NODES, TREE_NAME } from "../content/tree";
import { CURRENCY, MAIN, STAT, type StatId, TAB_NAMES } from "../content/words";
import { Button } from "../ui/Button";
import { Title } from "../ui/Title";
import { Tree, type TreeNodeView, type TreeWords } from "../ui/Tree";
import s from "./screens.module.css";

/** What a rank of an effect does, in the stat's own name. */
const effectText = (e: Effect) => {
  const name = STAT[e.stat as StatId];
  return e.mult !== undefined
    ? `${name} ×${e.mult} a rank`
    : `${name} +${Math.round((e.add ?? 0) * 100)}% a rank`;
};

/** What the tree says around its nodes. */
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
            variant={affordable ? "primary" : "secondary"}
            disabled={!affordable}
            cost={fmt(price.amount).text}
            glyph={glyphOf(words.glyph)}
            unit={words.plural}
            onClick={() => buy(n.id).ok && sound.play("buy")}
          >
            Raise
          </Button>
        ) : undefined,
    };
  });
  return (
    <div className={s.screen}>
      <Title>{TAB_NAMES.tree}</Title>
      <Tree label={TREE_NAME} nodes={nodes} words={TREE_WORDS} />
    </div>
  );
}
