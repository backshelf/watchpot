import { type ComponentPropsWithRef, type ReactNode } from "react";
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
export declare function treeEdges(nodes: readonly TreeGraphNode[]): TreeEdge[];
/**
 * Where a key moves the choice from a node: up and down its tier; across to the nearest row of the next tier with
 * nodes; Home and End to the first and last. Stays put at an edge; `null` for any other key. Pure.
 */
export declare function treeNeighbour<N extends TreeGraphNode>(nodes: readonly N[], from: N, key: string): N | null;
/** The state `TreeGraph` hands a node's renderers. */
export interface TreeNodeState {
    chosen: boolean;
}
/** Props of `TreeGraph`: the nodes, how to draw each and its detail, the choice, and a section's. */
export interface TreeGraphProps<N extends TreeGraphNode> extends Omit<ComponentPropsWithRef<"section">, "children"> {
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
    renderEdges?: false | ((edges: TreeEdge[], size: {
        cols: number;
        rows: number;
    }) => ReactNode);
    /** Props for the detail region (a class). */
    detailProps?: ComponentPropsWithRef<"div">;
}
/**
 * An upgrade tree as a graph: nodes laid by `--col`/`--row` (the root carries `--cols`/`--rows`), edges as geometry,
 * one tab stop whose arrows move the choice between nodes, and the chosen node's detail in a region its button
 * controls (`aria-expanded`, `aria-controls`). Node state is `data-state`, `data-lit`, `data-chosen`.
 */
export declare function TreeGraph<N extends TreeGraphNode>({ nodes, renderNode, nodeLabel, renderAside, renderDetail, tierLabel, chosen, defaultChosen, onChoose, firstChoice, renderEdges, detailProps, ref, style, ...props }: TreeGraphProps<N>): import("react").JSX.Element;
