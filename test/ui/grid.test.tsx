import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { AchievementGrid, type AchievementRow, gridMove, TileGrid } from "watchpot/ui";

const key = (k: string, extra: object = {}) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: k, ...extra });

describe("gridMove", () => {
  const ragged = [3, 3, 1];
  test("arrows step and stop at the edges; a row change keeps the column where it can", () => {
    expect(gridMove("ArrowRight", { row: 0, col: 2 }, ragged)).toEqual({ row: 0, col: 2 });
    expect(gridMove("ArrowLeft", { row: 0, col: 0 }, ragged)).toEqual({ row: 0, col: 0 });
    expect(gridMove("ArrowDown", { row: 1, col: 2 }, ragged)).toEqual({ row: 2, col: 0 });
    expect(gridMove("ArrowUp", { row: 0, col: 1 }, ragged)).toEqual({ row: 0, col: 1 });
  });

  test("Home and End stay in the row; with Ctrl they go to the grid's ends; pages move rows", () => {
    expect(gridMove("End", { row: 1, col: 0 }, ragged)).toEqual({ row: 1, col: 2 });
    expect(gridMove("Home", { row: 1, col: 2 }, ragged)).toEqual({ row: 1, col: 0 });
    expect(gridMove("End", { row: 0, col: 0 }, ragged, { ctrl: true })).toEqual({ row: 2, col: 0 });
    expect(gridMove("Home", { row: 2, col: 0 }, ragged, { ctrl: true })).toEqual({ row: 0, col: 0 });
    expect(gridMove("PageDown", { row: 0, col: 1 }, ragged, { pageRows: 1 })).toEqual({ row: 1, col: 1 });
    expect(gridMove("PageDown", { row: 0, col: 1 }, ragged)).toEqual({ row: 2, col: 0 });
    expect(gridMove("x", { row: 0, col: 0 }, ragged)).toBeNull();
  });

  test("never leaves the grid", () => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"];
    for (const k of keys)
      for (let row = 0; row < ragged.length; row++)
        for (let col = 0; col < (ragged[row] ?? 0); col++) {
          const to = gridMove(k, { row, col }, ragged);
          expect(to).not.toBeNull();
          if (!to) continue;
          expect(to.row).toBeGreaterThanOrEqual(0);
          expect(to.row).toBeLessThan(ragged.length);
          expect(to.col).toBeGreaterThanOrEqual(0);
          expect(to.col).toBeLessThan(ragged[to.row] ?? 0);
        }
  });
});

describe("TileGrid", () => {
  const ITEMS = ["a", "b", "c", "d", "e", "f", "g"];

  test("rows of gridcells with one tab stop; arrows move focus; Enter activates", () => {
    const activate = mock((_: string) => {});
    render(
      <TileGrid
        aria-label="Tiles"
        items={ITEMS}
        columns={3}
        getKey={(i) => i}
        renderCell={(c) => c.item.toUpperCase()}
        onActivate={(c) => activate(c.item)}
      />,
    );
    const grid = screen.getByRole("grid", { name: "Tiles" });
    expect(within(grid).getAllByRole("row")).toHaveLength(3);
    const cells = within(grid).getAllByRole("gridcell");
    expect(cells.filter((c) => c.tabIndex === 0)).toHaveLength(1);
    act(() => cells[0]?.focus());
    key("ArrowRight");
    expect(document.activeElement).toHaveTextContent("B");
    key("ArrowDown");
    expect(document.activeElement).toHaveTextContent("E");
    expect(document.activeElement).toHaveAttribute("data-active");
    key("ArrowDown");
    expect(document.activeElement).toHaveTextContent("G");
    key("End", { ctrlKey: true });
    key("Home", { ctrlKey: true });
    expect(document.activeElement).toHaveTextContent("A");
    key("Enter");
    expect(activate).toHaveBeenCalledWith("a");
  });
});

const ROWS: AchievementRow[] = [
  {
    complete: true,
    tiles: [
      { id: "first", name: "First gold", line: "Earn 1 gold.", reward: "+1% gold", earned: true },
      { id: "rich", name: "Rich", line: "Earn 1M gold.", earned: true },
    ],
  },
  {
    tiles: [
      { id: "gems", name: "Gem hunter", line: "Find a gem.", earned: false },
      { id: "secret", name: "Secret", line: "Do the thing.", earned: false, hidden: true },
    ],
  },
];
const WORDS = { hiddenName: "???", hiddenLine: "Keep playing.", earned: ", earned", locked: ", locked" };

/** A two-row wall: a complete row, then one tile to find and one secret. */
function Wall() {
  return (
    <AchievementGrid aria-label="Achievements" rows={ROWS} words={WORDS} renderIcon={(t) => <i>{t.id}</i>} />
  );
}

describe("AchievementGrid", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("each tile is named with its state; earned, hidden and complete rows are data", () => {
    render(<Wall />);
    const grid = screen.getByRole("grid", { name: "Achievements" });
    const rows = within(grid).getAllByRole("row");
    expect(rows[0]).toHaveAttribute("data-complete");
    expect(rows[1]).not.toHaveAttribute("data-complete");
    const first = within(grid).getByRole("gridcell", { name: /^First gold\s*, earned$/ });
    expect(first).toHaveAttribute("data-earned");
    const secret = within(grid).getByRole("gridcell", { name: /^\?\?\?\s*, locked$/ });
    expect(secret).toHaveAttribute("data-hidden");
    expect(screen.queryByText("Secret")).toBeNull();
  });

  test("a row's aside heads its row, told its index, its tiles and how many are earned; arrows pass it by", () => {
    const rows = [ROWS[0] as AchievementRow, { tiles: [] }, ROWS[1] as AchievementRow];
    render(
      <AchievementGrid
        aria-label="Achievements"
        rows={rows}
        words={WORDS}
        renderIcon={(t) => <i>{t.id}</i>}
        renderRowAside={({ index, earned, total, row }) =>
          index === 0 ? null : `Row ${index}: ${earned} of ${total}${row.complete ? ", paid" : ""}`
        }
      />,
    );
    const laid = within(screen.getByRole("grid")).getAllByRole("row");
    expect(laid).toHaveLength(2);
    expect(within(laid[0] as HTMLElement).queryByRole("rowheader")).toBeNull();
    expect(within(laid[1] as HTMLElement).getByRole("rowheader")).toHaveTextContent("Row 2: 0 of 2");
    expect(laid[0]).toHaveAttribute("data-complete");
    act(() => screen.getByRole("gridcell", { name: /^Rich/ }).focus());
    key("ArrowDown");
    expect(screen.getByRole("gridcell", { name: /^\?\?\?/ })).toHaveFocus();
  });

  test("focus shows the tile's detail at once and describes it; arrows move it; Escape hides it", () => {
    render(<Wall />);
    const first = screen.getByRole("gridcell", { name: /^First gold/ });
    act(() => first.focus());
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Earn 1 gold.");
    expect(tip).toHaveTextContent("+1% gold");
    expect(first).toHaveAccessibleDescription(/Earn 1 gold\./);
    key("ArrowDown");
    key("ArrowRight");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Keep playing.");
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("Do the thing.");
    key("Escape");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("hover shows the detail after the delay", () => {
    render(<Wall />);
    const rich = screen.getByRole("gridcell", { name: /^Rich/ });
    fireEvent.pointerEnter(rich, { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => jest.advanceTimersByTime(300));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Earn 1M gold.");
  });
});
