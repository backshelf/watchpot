import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Popover, place, Tooltip } from "watchpot/ui";

const VIEW = { width: 400, height: 300 };
const BOX = { width: 100, height: 40 };

describe("place", () => {
  test("sits on the side asked, centred, offset from the anchor", () => {
    const p = place({ x: 150, y: 150, width: 100, height: 20 }, BOX, VIEW, { side: "top", offset: 8 });
    expect(p).toEqual({ x: 150, y: 102, side: "top", align: "center" });
  });

  test("flips to the far side when the asked side spills and the far side spills less", () => {
    const p = place({ x: 150, y: 10, width: 100, height: 20 }, BOX, VIEW, { side: "top" });
    expect(p.side).toBe("bottom");
    expect(p.y).toBe(38);
    const kept = place({ x: 150, y: 10, width: 100, height: 20 }, BOX, VIEW, { side: "top", flip: false });
    expect(kept.side).toBe("top");
  });

  test("shifts along the edge to stay inside the viewport, whatever the anchor", () => {
    for (const x of [-50, 0, 3, 200, 390, 500]) {
      const p = place({ x, y: 150, width: 10, height: 10 }, BOX, VIEW, { side: "bottom", padding: 8 });
      expect(p.x).toBeGreaterThanOrEqual(8);
      expect(p.x + BOX.width).toBeLessThanOrEqual(VIEW.width - 8);
    }
    const right = place({ x: 380, y: 100, width: 10, height: 10 }, BOX, VIEW, { side: "right" });
    expect(right.side).toBe("left");
  });
});

/** A trigger and its words, with short delays. */
function Tip() {
  return (
    <Tooltip.Root delay={500} closeDelay={100}>
      <Tooltip.Trigger>Gold</Tooltip.Trigger>
      <Tooltip.Content>Spent on upgrades.</Tooltip.Content>
    </Tooltip.Root>
  );
}

/** A popover of two controls, and a control outside it. */
function Pop() {
  return (
    <>
      <Popover.Root>
        <Popover.Trigger>Filters</Popover.Trigger>
        <Popover.Content aria-label="Filters">
          <button type="button">Rare only</button>
          <Popover.Close>Done</Popover.Close>
        </Popover.Content>
      </Popover.Root>
      <button type="button">Outside</button>
    </>
  );
}

describe("Tooltip", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("describes its trigger even while closed, opens on focus at once and closes on blur", () => {
    render(<Tip />);
    const trigger = screen.getByRole("button", { name: "Gold" });
    expect(trigger).toHaveAccessibleDescription("Spent on upgrades.");
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => trigger.focus());
    expect(screen.getByRole("tooltip")).toHaveAttribute("data-state", "open");
    act(() => trigger.blur());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("hover waits for the delay; leaving waits for the close delay; crossing into it keeps it", () => {
    render(<Tip />);
    const trigger = screen.getByRole("button", { name: "Gold" });
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    act(() => jest.advanceTimersByTime(499));
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => jest.advanceTimersByTime(1));
    const tip = screen.getByRole("tooltip");
    fireEvent.pointerLeave(trigger, { pointerType: "mouse" });
    fireEvent.pointerEnter(tip, { pointerType: "mouse" });
    act(() => jest.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerLeave(tip, { pointerType: "mouse" });
    act(() => jest.advanceTimersByTime(100));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("Escape closes it", () => {
    render(<Tip />);
    const trigger = screen.getByRole("button", { name: "Gold" });
    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("a touch opens it by holding, not by a quick tap", () => {
    render(<Tip />);
    const trigger = screen.getByRole("button", { name: "Gold" });
    fireEvent.pointerDown(trigger, { pointerType: "touch" });
    fireEvent.pointerUp(trigger, { pointerType: "touch" });
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.pointerDown(trigger, { pointerType: "touch" });
    act(() => jest.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  test("touch='tap' toggles with a tap", () => {
    render(
      <Tooltip.Root touch="tap">
        <Tooltip.Trigger>Gems</Tooltip.Trigger>
        <Tooltip.Content>Rare.</Tooltip.Content>
      </Tooltip.Root>,
    );
    const trigger = screen.getByRole("button", { name: "Gems" });
    fireEvent.pointerDown(trigger, { pointerType: "touch" });
    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerDown(trigger, { pointerType: "touch" });
    fireEvent.click(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("Popover", () => {
  test("the trigger opens a dialog that takes focus; Escape closes it back to the trigger", () => {
    render(<Pop />);
    const trigger = screen.getByRole("button", { name: "Filters" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Rare only" }));
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("Close returns focus to the trigger; a press outside closes it where the player went", () => {
    render(<Pop />);
    const trigger = screen.getByRole("button", { name: "Filters" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
