// @feature tree
import { cx, TreeGraph, usePageLayout, VisuallyHidden } from "watchpot/ui";
import { type ReactNode, useRef } from "react";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was. `TreeGraph` renders the
// graph, its tiles and its edges, so the root carries the descendant variants that style them. The graph is a grid of
// equal cells with no gap, so the edges' SVG, stretched over the node rows, lands each elbow on a cell's centre; the
// space between tiles is the cells' own padding.
const s = {
  tree:
    "grid gap-4 data-[wide]:grid-cols-[minmax(0,1fr)_280px] data-[wide]:items-start [&>[data-graph]]:grid [&>[data-graph]]:grid-cols-[repeat(var(--cols),minmax(150px,1fr))] [&>[data-graph]]:grid-rows-[auto_repeat(var(--rows),76px)] [&>[data-graph]]:overflow-x-auto [&_[data-tier-head]]:[grid-row:1] [&_[data-tier-head]]:[grid-column:calc(var(--col)_+_1)] [&_[data-tier-head]]:px-2 [&_[data-tier-head]]:pb-2 [&_[data-tier-head]]:text-ui-ink-muted [&_[data-tier-head]]:text-[12px] [&_[data-tier-head]]:font-semibold [&_[data-edges]]:[grid-row:2/-1] [&_[data-edges]]:[grid-column:1/-1] [&_[data-edges]]:w-full [&_[data-edges]]:h-full [&_[data-edges]_line]:stroke-ui-line [&_[data-edges]_line]:[stroke-width:2px] [&_[data-edges]_line[data-lit]]:stroke-ui-accent [&_[data-node]]:relative [&_[data-node]]:z-[1] [&_[data-node]]:[grid-row:calc(var(--row)_+_2)] [&_[data-node]]:[grid-column:calc(var(--col)_+_1)] [&_[data-node]]:grid [&_[data-node]]:py-1.5 [&_[data-node]]:px-2 [&_[data-pick]]:grid [&_[data-pick]]:content-center [&_[data-pick]]:gap-0.5 [&_[data-pick]]:py-2 [&_[data-pick]]:px-2.5 [&_[data-pick]]:border [&_[data-pick]]:border-ui-line [&_[data-pick]]:rounded-ui [&_[data-pick]]:bg-ui-surface [&_[data-pick]]:text-start [&_[data-pick]]:cursor-pointer [&_[data-node][data-lit]_[data-pick]]:border-ui-accent [&_[data-node][data-chosen]_[data-pick]]:[box-shadow:inset_0_0_0_1px_var(--ui-ink)] [&_[data-node][data-state=locked]_[data-pick]]:border-dashed [&_[data-node][data-state=locked]_[data-pick]]:text-ui-ink-muted",
  name: "overflow-hidden text-[13px] font-semibold text-ellipsis whitespace-nowrap",
  rank: "text-ui-ink-muted font-ui-num text-[11px] tabular-nums",
  // The next price on the tile's corner: the accent when it can be paid now.
  price:
    "absolute right-3.5 bottom-2.5 text-ui-ink-muted font-ui-num text-[11px] tabular-nums data-[affordable]:text-ui-accent data-[affordable]:font-semibold",
  // The chosen node's detail: a rail beside the graph on a wide page, a drawer under it on a phone.
  detail: "grid gap-2 p-4 border border-ui-line rounded-ui bg-ui-surface",
  detailName: "font-ui-display text-[18px] font-bold",
  effect: "font-semibold",
  action: "pt-1",
};

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
