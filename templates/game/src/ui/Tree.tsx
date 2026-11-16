// @feature tree
import { cx, TreeGraph, usePageLayout, VisuallyHidden } from "watchpot/ui";
import { type ReactNode, useRef } from "react";
import s from "./Tree.module.css";

/** One node as the tree draws it: placed by tier and row, its ranks, its next price and the chosen node's detail. */
export interface TreeNodeView {
  id: string;
  name: string;
  /** What it does, in the game's voice: in the detail once chosen. */
  line: ReactNode;
  /** Its tier from 0 (its column) and its place in the tier from 0 (its row). */
  col: number;
  row: number;
  rank: number;
  maxRank: number;
  /** "open" can be bought; "locked" waits on what it requires; "maxed" is done. */
  state: "open" | "locked" | "maxed";
  requires?: readonly string[];
  /** The next rank's price, formatted, on the tile. */
  price?: string;
  /** The price can be paid now. */
  affordable?: boolean;
  /** What the next rank does, formatted: in the detail. */
  effect?: ReactNode;
  /** The chosen node's action (its buy button), in the detail. */
  action?: ReactNode;
}

/** Everything the tree says, in the game's words. */
export interface TreeWords {
  /** The tile's button name ("About Better soil, rank 2 of 5"). */
  node: (node: TreeNodeView) => string;
  /** Drawn on a maxed tile in place of its ranks ("Max"). */
  maxed: string;
  /** Said after a price the player can pay, and after one they cannot (", affordable", ", not enough yet"). */
  affordable: string;
  unaffordable: string;
  /** A heading over each tier's column, if any. */
  tier?: (col: number) => ReactNode;
}

/** Props of `Tree`: its name, its nodes and its words. */
export interface TreeProps {
  /** The tree's accessible name. */
  label: string;
  nodes: readonly TreeNodeView[];
  words: TreeWords;
  className?: string;
}

/**
 * An upgrade tree on `TreeGraph`: tiers across as columns, each node a tile with its ranks and next price, elbows to
 * what it requires lit from a built node, one tab stop with arrows between nodes. The chosen node's words and its
 * buy stand in a rail beside the graph on a wide page, in a drawer under it on a phone (brought into view when a
 * press chooses a node below the fold).
 */
export function Tree({ label, nodes, words, className }: TreeProps) {
  const { wide } = usePageLayout();
  const detail = useRef<HTMLDivElement>(null);
  const graphNodes = nodes.map((n) => ({ ...n, lit: n.rank > 0 }));

  const reveal = () => {
    if (wide) return;
    requestAnimationFrame(() => {
      const box = detail.current?.getBoundingClientRect();
      if (box && (box.top > window.innerHeight || box.bottom < 0))
        detail.current?.scrollIntoView({ block: "nearest" });
    });
  };

  return (
    <TreeGraph
      aria-label={label}
      className={cx(s.tree, className)}
      data-wide={wide ? "" : undefined}
      nodes={graphNodes}
      firstChoice={(n) => n.state === "open"}
      onChoose={reveal}
      tierLabel={words.tier}
      nodeLabel={words.node}
      renderNode={(n) => (
        <>
          <span className={s.name}>{n.name}</span>
          <span className={s.rank}>{n.state === "maxed" ? words.maxed : `${n.rank} / ${n.maxRank}`}</span>
        </>
      )}
      renderAside={(n) =>
        n.state !== "maxed" && n.price !== undefined ? (
          <span className={s.price} data-affordable={n.affordable ? "" : undefined}>
            {n.price}
            <VisuallyHidden>{n.affordable ? words.affordable : words.unaffordable}</VisuallyHidden>
          </span>
        ) : null
      }
      renderDetail={(n) => (
        <>
          <p className={s.detailName}>{n.name}</p>
          <p>{n.line}</p>
          {n.effect !== undefined && <p className={s.effect}>{n.effect}</p>}
          {n.action !== undefined && <div className={s.action}>{n.action}</div>}
        </>
      )}
      detailProps={{ ref: detail, className: s.detail }}
    />
  );
}
