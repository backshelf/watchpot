import { type ReactNode, useRef } from "react";
import { cx, TreeGraph, usePageLayout, VisuallyHidden } from "watchpot/ui";
import s from "./Tree.module.css";

/** One node as the tree draws it: placed by tier and row, its ranks, its next price and the chosen node's detail. */
export interface TreeNodeView {
  id: string;
  name: string;
  /** What it does, in the game's voice: in the rail once chosen. */
  line: ReactNode;
  /** Its tier from 0 (its column) and its place in the tier from 0 (its row). */
  col: number;
  row: number;
  rank: number;
  maxRank: number;
  /** "open" can be bought; "locked" waits on what it requires; "maxed" is done. */
  state: "open" | "locked" | "maxed";
  requires?: readonly string[];
  /** The next rank's price, formatted, at the tile's foot. */
  price?: string;
  /** The price can be paid now: it stands on the signal block. */
  affordable?: boolean;
  /** What the next rank does, formatted: the rail's one bold line. */
  effect?: ReactNode;
  /** The chosen node's action (its buy button), at the rail's foot. */
  action?: ReactNode;
}

/** Everything the tree says, in the game's words. */
export interface TreeWords {
  /** The tile's button name ("About Hydroponics bay, rank 2 of 5"). */
  node: (node: TreeNodeView) => string;
  /** Drawn on a maxed tile in place of its ranks ("Max"). */
  maxed: string;
  /** Said after a price the player can pay, and after one they cannot (", affordable", ", not enough yet"). */
  affordable: string;
  unaffordable: string;
  /** A heading over each tier's column. */
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

/** The padlock on a locked tile's ranks, and the tick on a maxed one's. */
const LOCK = (
  <svg className={s.mark} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5M2.5 5.5h7v5h-7Z" />
  </svg>
);
const TICK = (
  <svg className={s.mark} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <path d="m2.5 6.5 2.5 2.5 4.5-6" />
  </svg>
);

/**
 * An upgrade tree on `TreeGraph`: tiers across as columns under their headings, each node a flat tile (grey unbuilt,
 * raised on an ink base line once built, its price on the signal block when it can be paid), elbows to what it
 * requires lit in ink from a built node, one tab stop with arrows between nodes. The chosen node's words and its buy
 * stand in the grey rail: beside the graph once the tree's own box holds every column and the rail, under it
 * otherwise (brought into view on a phone when a press chooses a node below the fold).
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
    <div className={cx(s.tree, className)}>
      <TreeGraph
        aria-label={label}
        className={s.layout}
        nodes={graphNodes}
        firstChoice={(n) => n.state === "open"}
        onChoose={reveal}
        tierLabel={words.tier}
        nodeLabel={words.node}
        renderNode={(n) => (
          <>
            <span className={s.name}>{n.name}</span>
            <span className={s.rank}>
              {n.state === "locked" && LOCK}
              {n.state === "maxed" ? (
                <>
                  {TICK} {words.maxed}
                </>
              ) : (
                `${n.rank} / ${n.maxRank}`
              )}
            </span>
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
          // Keyed by the node, so the rail's entrance plays on every choice.
          <div key={n.id} className={s.railInner}>
            <p className={s.railName}>{n.name}</p>
            <div className={s.railBody}>
              <p className={s.railLine}>{n.line}</p>
              {n.effect !== undefined && <p className={s.effect}>{n.effect}</p>}
            </div>
            {n.action !== undefined && <div className={s.foot}>{n.action}</div>}
          </div>
        )}
        detailProps={{ ref: detail, className: s.rail }}
      />
    </div>
  );
}
