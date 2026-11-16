// The upgrade-tree behaviour: nodes placed by column and row, the edges' geometry for the game to draw, one tab stop
// with arrows between nodes, and a chosen node whose detail stands in a region its button controls.
import {
  type ComponentPropsWithRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
} from "react";
import { focusWithoutScroll } from "./focus";
import { useControllable } from "./hooks";
import { mergeProps, useComposedRefs } from "./slot";

/** What `TreeGraph` needs of a node: an id, its column (tier) and row, what it requires and whether it is lit. */
export interface TreeGraphNode {
  id: string;
  /** Its tier, from 0. */
  col: number;
  /** Its place within the tier, from 0. */
  row: number;
  /** Ids it requires: an edge runs from each. */
  requires?: readonly string[];
  /** Written as `data-state` ("open", "locked", "maxed", or the game's own). */
  state?: string;
  /** Built (a rank or more): `data-lit` on the node and on the edges leaving it. */
  lit?: boolean;
}

/** One straight piece of an edge, in cell units (a node's centre is its `col + 0.5`, `row + 0.5`). */
export interface TreeSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** An edge from a required node to the node requiring it: an elbow of segments, and the same as an SVG path. */
export interface TreeEdge {
  from: string;
  to: string;
  /** The required node is lit. */
  lit: boolean;
  segments: TreeSegment[];
  /** The elbow as path data in the same units. */
  d: string;
}

/**
 * The edges of a tree: for each requirement, an elbow from the required node's centre across to the gap after its
 * column, down or up to the row, and on to the node (straight down within one column). Unknown ids are skipped. Pure.
 */
export function treeEdges(nodes: readonly TreeGraphNode[]): TreeEdge[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  return nodes.flatMap((n) =>
    (n.requires ?? []).flatMap((req) => {
      const from = byId.get(req);
      if (!from) return [];
      const x1 = from.col + 0.5;
      const y1 = from.row + 0.5;
      const x2 = n.col + 0.5;
      const y2 = n.row + 0.5;
      const mid = from.col === n.col ? x1 : Math.min(from.col, n.col) + 1;
      const segments = [
        { x1, y1, x2: mid, y2: y1 },
        { x1: mid, y1, x2: mid, y2 },
        { x1: mid, y1: y2, x2, y2 },
      ].filter((s) => s.x1 !== s.x2 || s.y1 !== s.y2);
      return [
        {
          from: req,
          to: n.id,
          lit: Boolean(from.lit),
          segments,
          d: `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`,
        },
      ];
    }),
  );
}

/** The nodes in reading order: by column, then row. */
const ordered = <N extends TreeGraphNode>(nodes: readonly N[]) =>
  [...nodes].sort((a, b) => a.col - b.col || a.row - b.row);

/**
 * Where a key moves the choice from a node: up and down its tier; across to the nearest row of the next tier with
 * nodes; Home and End to the first and last. Stays put at an edge; `null` for any other key. Pure.
 */
export function treeNeighbour<N extends TreeGraphNode>(nodes: readonly N[], from: N, key: string): N | null {
  const list = ordered(nodes);
  switch (key) {
    case "ArrowUp":
    case "ArrowDown": {
      const tier = list.filter((n) => n.col === from.col);
      return tier[tier.findIndex((n) => n.id === from.id) + (key === "ArrowDown" ? 1 : -1)] ?? from;
    }
    case "ArrowLeft":
    case "ArrowRight": {
      const tiers = [...new Set(list.map((n) => n.col))];
      const col = tiers[tiers.indexOf(from.col) + (key === "ArrowRight" ? 1 : -1)];
      if (col === undefined) return from;
      const near = (n: N) => Math.abs(n.row - from.row);
      return list.filter((n) => n.col === col).reduce((a, b) => (near(b) < near(a) ? b : a));
    }
    case "Home":
      return list[0] ?? from;
    case "End":
      return list[list.length - 1] ?? from;
    default:
      return null;
  }
}

/** The state `TreeGraph` hands a node's renderers. */
export interface TreeNodeState {
  chosen: boolean;
}

/** Props of `TreeGraph`: the nodes, how to draw each and its detail, the choice, and a section's. */
export interface TreeGraphProps<N extends TreeGraphNode>
  extends Omit<ComponentPropsWithRef<"section">, "children"> {
  nodes: readonly N[];
  /** The node's button content (its name, rank, price). */
  renderNode: (node: N, state: TreeNodeState) => ReactNode;
  /** The node's button's accessible name, when its content does not say it ("About Speed, rank 2 of 5"). */
  nodeLabel?: (node: N) => string;
  /** Drawn inside the node after its button (a price outside the press). */
  renderAside?: (node: N, state: TreeNodeState) => ReactNode;
  /** The chosen node's detail (its words, its buy action), in the region the buttons control. */
  renderDetail?: (node: N) => ReactNode;
  /** A heading drawn over each tier's column (`[data-tier-head]`, `--col`). */
  tierLabel?: (col: number) => ReactNode;
  /** The chosen node's id, controlled. */
  chosen?: string | null;
  defaultChosen?: string | null;
  onChoose?: (id: string | null) => void;
  /** Which node is chosen before the player picks: the first node it accepts in reading order. Default the first. */
  firstChoice?: (node: N) => boolean;
  /** Draw the edges: the default `<svg>` of `<line>`s (`[data-edges]`, each `data-lit`), your own, or none. */
  renderEdges?: false | ((edges: TreeEdge[], size: { cols: number; rows: number }) => ReactNode);
  /** Props for the detail region (a class). */
  detailProps?: ComponentPropsWithRef<"div">;
}

/** The default edges: one unstyled `<line>` per segment, stretched over the graph in cell units. */
function DefaultEdges({ edges, cols, rows }: { edges: TreeEdge[]; cols: number; rows: number }) {
  return (
    <svg
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      data-edges=""
    >
      {edges.flatMap((e) =>
        e.segments.map((s, i) => (
          <line
            key={`${e.from}>${e.to}:${i}`}
            {...s}
            data-from={e.from}
            data-to={e.to}
            data-lit={e.lit ? "" : undefined}
            // The view box stretches; the stroke keeps its width.
            vectorEffect="non-scaling-stroke"
          />
        )),
      )}
    </svg>
  );
}

/**
 * An upgrade tree as a graph: nodes laid by `--col`/`--row` (the root carries `--cols`/`--rows`), edges as geometry,
 * one tab stop whose arrows move the choice between nodes, and the chosen node's detail in a region its button
 * controls (`aria-expanded`, `aria-controls`). Node state is `data-state`, `data-lit`, `data-chosen`.
 */
export function TreeGraph<N extends TreeGraphNode>({
  nodes,
  renderNode,
  nodeLabel,
  renderAside,
  renderDetail,
  tierLabel,
  chosen,
  defaultChosen = null,
  onChoose,
  firstChoice,
  renderEdges,
  detailProps,
  ref,
  style,
  ...props
}: TreeGraphProps<N>) {
  const root = useRef<HTMLElement>(null);
  const refs = useComposedRefs(root, ref);
  const detailId = useId();
  const [picked, setPicked] = useControllable(chosen, defaultChosen, onChoose);
  const list = ordered(nodes);
  const cols = Math.max(1, ...nodes.map((n) => n.col + 1));
  const rows = Math.max(1, ...nodes.map((n) => n.row + 1));
  const current =
    list.find((n) => n.id === picked) ?? (firstChoice ? list.find(firstChoice) : undefined) ?? list[0];
  const edges = treeEdges(nodes);
  const heads = tierLabel ? [...new Set(list.map((n) => n.col))] : [];

  const onKey = (event: KeyboardEvent, from: N) => {
    const to = treeNeighbour(nodes, from, event.key);
    if (!to) return;
    event.preventDefault();
    setPicked(to.id);
    const node = [...(root.current?.querySelectorAll("[data-node]") ?? [])].find(
      (el) => el.getAttribute("data-node") === to.id,
    );
    focusWithoutScroll(node?.querySelector<HTMLElement>("[data-pick]"));
  };

  const vars: CSSProperties = { "--cols": cols, "--rows": rows, ...style };
  return (
    <section {...props} ref={refs} style={vars} data-cols={cols} data-rows={rows}>
      <div data-graph="">
        {renderEdges === false ? null : renderEdges ? (
          renderEdges(edges, { cols, rows })
        ) : (
          <DefaultEdges edges={edges} cols={cols} rows={rows} />
        )}
        {heads.map((col) => (
          <div key={`head-${col}`} data-tier-head={col} style={{ "--col": col }}>
            {tierLabel?.(col)}
          </div>
        ))}
        {list.map((n) => {
          const state = { chosen: n === current };
          return (
            <div
              key={n.id}
              data-node={n.id}
              data-state={n.state}
              data-lit={n.lit ? "" : undefined}
              data-chosen={state.chosen ? "" : undefined}
              style={{ "--col": n.col, "--row": n.row }}
            >
              <button
                type="button"
                data-pick=""
                aria-label={nodeLabel?.(n)}
                tabIndex={state.chosen ? 0 : -1}
                aria-expanded={state.chosen}
                aria-controls={detailId}
                aria-describedby={state.chosen && renderDetail ? detailId : undefined}
                onClick={() => setPicked(n.id)}
                onKeyDown={(event) => onKey(event, n)}
              >
                {renderNode(n, state)}
              </button>
              {renderAside?.(n, state)}
            </div>
          );
        })}
      </div>
      <div {...mergeProps({ id: detailId, "data-detail": current?.id ?? "" }, detailProps ?? {})}>
        {current && renderDetail ? renderDetail(current) : null}
      </div>
    </section>
  );
}
