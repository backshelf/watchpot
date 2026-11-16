import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { AchievementGrid, type AchievementRow, type AchievementTile } from "watchpot/ui";

const ROWS: AchievementRow[] = [
  {
    tiles: [
      { id: "kick", name: "Kick", line: "Play a kick.", earned: true },
      { id: "hat", name: "Hat", line: "Play a hat.", earned: false },
    ],
  },
];
const WORDS = { hiddenName: "???", hiddenLine: "Keep playing.", earned: ", earned", locked: ", locked" };

describe("AchievementGrid onTilePress", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function setup(onActivate?: (tile: AchievementTile) => void) {
    const press = mock((_tile: AchievementTile, _event: unknown) => {});
    render(
      <StrictMode>
        <AchievementGrid
          aria-label="Tiles"
          rows={ROWS}
          words={WORDS}
          renderIcon={(t) => <i>{t.id}</i>}
          onTilePress={press}
          onActivate={onActivate}
        />
      </StrictMode>,
    );
    const grid = screen.getByRole("grid", { name: "Tiles" });
    const cells = within(grid).getAllByRole("gridcell");
    return { press, cells };
  }

  test("a click and an Enter both call it with the tile, earned or not; focus stays", () => {
    const { press, cells } = setup();
    const [kick, hat] = cells as [HTMLElement, HTMLElement];
    act(() => kick.focus());
    fireEvent.click(hat);
    expect(press).toHaveBeenCalledTimes(1);
    expect(press.mock.calls[0]?.[0]).toMatchObject({ id: "hat" });
    expect(document.activeElement).toBe(kick);

    fireEvent.keyDown(kick, { key: "Enter" });
    expect(press).toHaveBeenCalledTimes(2);
    expect(press.mock.calls[1]?.[0]).toMatchObject({ id: "kick" });
    expect(document.activeElement).toBe(kick);
  });

  test("Space presses; a held key's repeats and other keys do not", () => {
    const { press, cells } = setup();
    const kick = cells[0] as HTMLElement;
    act(() => kick.focus());
    fireEvent.keyDown(kick, { key: " " });
    fireEvent.keyDown(kick, { key: " ", repeat: true });
    fireEvent.keyDown(kick, { key: "ArrowRight" });
    expect(press).toHaveBeenCalledTimes(1);
  });

  test("onActivate still fires beside it, and the detail still opens on focus", () => {
    const activate = mock((_tile: AchievementTile) => {});
    const { press, cells } = setup(activate);
    const kick = cells[0] as HTMLElement;
    act(() => kick.focus());
    expect(screen.getByRole("tooltip", { hidden: true })).not.toHaveAttribute("hidden");
    fireEvent.keyDown(kick, { key: "Enter" });
    fireEvent.click(kick);
    expect(press).toHaveBeenCalledTimes(2);
    expect(activate).toHaveBeenCalledTimes(2);
  });
});
