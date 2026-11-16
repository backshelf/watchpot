import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { TreeGraph, type TreeGraphNode, treeEdges, treeNeighbour } from "watchpot/ui";

interface Node extends TreeGraphNode {
  name: string;
}

const NODES: Node[] = [
  { id: "speed", name: "Speed", col: 0, row: 0, lit: true, state: "maxed" },
  { id: "luck", name: "Luck", col: 0, row: 1, state: "open" },
  { id: "rush", name: "Rush", col: 1, row: 0, requires: ["speed"], state: "open" },
  { id: "fate", name: "Fate", col: 2, row: 1, requires: ["rush", "luck", "missing"], state: "locked" },
];

const key = (k: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key: k });

/** The four-node tree with names on the buttons and a line in the detail. */
function Tree({ onChoose }: { onChoose?: (id: string | null) => void }) {
  return (
    <TreeGraph
      aria-label="Upgrades"
      nodes={NODES}
      renderNode={(n) => n.name}
      renderDetail={(n) => `About ${n.name}`}
      firstChoice={(n) => n.state === "open"}
      onChoose={onChoose}
    />
  );
}

describe("treeEdges", () => {
  test("an elbow from each known requirement, lit from a lit node, ending at the node's centre", () => {
    const edges = treeEdges(NODES);
    expect(edges.map((e) => `${e.from}>${e.to}`)).toEqual(["speed>rush", "rush>fate", "luck>fate"]);
    expect(edges[0]?.lit).toBe(true);
    expect(edges[1]?.lit).toBe(false);
    for (const e of edges) {
      const last = e.segments[e.segments.length - 1];
      const to = NODES.find((n) => n.id === e.to) as Node;
      expect(last?.x2).toBe(to.col + 0.5);
      expect(last?.y2).toBe(to.row + 0.5);
      // Every piece is straight: horizontal or vertical.
      for (const s of e.segments) expect(s.x1 === s.x2 || s.y1 === s.y2).toBe(true);
    }
  });
});

describe("treeNeighbour", () => {
  const at = (id: string) => NODES.find((n) => n.id === id) as Node;
  test("up and down the tier, across to the nearest row of the next tier, Home and End", () => {
    expect(treeNeighbour(NODES, at("speed"), "ArrowDown")?.id).toBe("luck");
    expect(treeNeighbour(NODES, at("luck"), "ArrowDown")?.id).toBe("luck");
    expect(treeNeighbour(NODES, at("luck"), "ArrowRight")?.id).toBe("rush");
    expect(treeNeighbour(NODES, at("rush"), "ArrowRight")?.id).toBe("fate");
    expect(treeNeighbour(NODES, at("fate"), "ArrowRight")?.id).toBe("fate");
    expect(treeNeighbour(NODES, at("fate"), "Home")?.id).toBe("speed");
    expect(treeNeighbour(NODES, at("speed"), "End")?.id).toBe("fate");
    expect(treeNeighbour(NODES, at("speed"), "x")).toBeNull();
  });
});

describe("TreeGraph", () => {
  test("one tab stop on the first open node, which controls and is described by the detail", () => {
    render(<Tree />);
    expect(screen.getByRole("region", { name: "Upgrades" })).toBeInTheDocument();
    const luck = screen.getByRole("button", { name: "Luck" });
    const speed = screen.getByRole("button", { name: "Speed" });
    expect(luck).toHaveAttribute("tabindex", "0");
    expect(speed).toHaveAttribute("tabindex", "-1");
    expect(luck).toHaveAttribute("aria-expanded", "true");
    expect(luck).toHaveAccessibleDescription("About Luck");
    expect(speed.closest("[data-node]")).toHaveAttribute("data-lit");
    expect(speed.closest("[data-node]")).toHaveAttribute("data-state", "maxed");
  });

  test("arrows move the choice and focus; a press chooses", () => {
    const choose = mock((_: string | null) => {});
    render(<Tree onChoose={choose} />);
    screen.getByRole("button", { name: "Luck" }).focus();
    key("ArrowRight");
    const rush = screen.getByRole("button", { name: "Rush" });
    expect(document.activeElement).toBe(rush);
    expect(rush).toHaveAttribute("aria-expanded", "true");
    expect(rush.closest("[data-node]")).toHaveAttribute("data-chosen");
    expect(choose).toHaveBeenLastCalledWith("rush");
    fireEvent.click(screen.getByRole("button", { name: "Fate" }));
    expect(screen.getByRole("button", { name: "Fate" })).toHaveAccessibleDescription("About Fate");
  });

  test("draws one line per straight piece of every edge, hidden from assistive tech", () => {
    const { container } = render(<Tree />);
    const svg = container.querySelector("svg[data-edges]");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    const pieces = treeEdges(NODES).reduce((n, e) => n + e.segments.length, 0);
    expect(container.querySelectorAll("line")).toHaveLength(pieces);
  });
});
