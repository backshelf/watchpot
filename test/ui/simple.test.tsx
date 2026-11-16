import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { ConfirmPress, Disclosure, rovingIndex, Slot, Switch, Toggle, VisuallyHidden } from "watchpot/ui";

/** A buy that asks twice, its words changing once armed. */
const Buy = (props: {
  onConfirm: () => void;
  onArmedChange?: (armed: boolean) => void;
  timeout?: number;
}) => <ConfirmPress {...props}>{(armed) => (armed ? "Press again to buy" : "Buy")}</ConfirmPress>;

describe("ConfirmPress", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("arms on the first press and fires on the second", () => {
    const buy = mock(() => {});
    const armedChanges = mock((_: boolean) => {});
    render(<Buy onConfirm={buy} onArmedChange={armedChanges} />);
    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    const armed = screen.getByRole("button", { name: "Press again to buy" });
    expect(armed).toHaveAttribute("data-armed");
    expect(buy).not.toHaveBeenCalled();
    fireEvent.click(armed);
    expect(buy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Buy" })).not.toHaveAttribute("data-armed");
    expect(armedChanges.mock.calls).toEqual([[true], [false]]);
  });

  test("disarms on blur, on Escape and after the timeout", () => {
    const buy = mock(() => {});
    render(<Buy onConfirm={buy} timeout={1000} />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    fireEvent.blur(button);
    expect(button).not.toHaveAttribute("data-armed");
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Escape" });
    expect(button).not.toHaveAttribute("data-armed");
    fireEvent.click(button);
    act(() => jest.advanceTimersByTime(999));
    expect(button).toHaveAttribute("data-armed");
    act(() => jest.advanceTimersByTime(1));
    expect(button).not.toHaveAttribute("data-armed");
    expect(buy).not.toHaveBeenCalled();
  });

  test("a held Enter's repeats are refused", () => {
    render(<Buy onConfirm={() => {}} />);
    const button = screen.getByRole("button");
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(true);
  });
});

describe("Disclosure", () => {
  test("the button shows and hides the region it controls", () => {
    render(
      <Disclosure.Root>
        <Disclosure.Trigger>Details</Disclosure.Trigger>
        <Disclosure.Panel>Inside</Disclosure.Panel>
      </Disclosure.Root>,
    );
    const button = screen.getByRole("button", { name: "Details" });
    const panel = screen.getByText("Inside");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", panel.id);
    expect(panel).not.toBeVisible();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel).toBeVisible();
    expect(panel).toHaveAttribute("data-state", "open");
  });
});

describe("Toggle and Switch", () => {
  test("Toggle is a pressed button with its state as data", () => {
    const changes = mock((_: boolean) => {});
    render(<Toggle onPressedChange={changes}>Auto-buy</Toggle>);
    const toggle = screen.getByRole("button", { name: "Auto-buy" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveAttribute("data-state", "on");
    expect(changes).toHaveBeenCalledWith(true);
  });

  test("Switch is a switch, and a controlled one follows its prop", () => {
    const changes = mock((_: boolean) => {});
    render(
      <Switch checked={false} onCheckedChange={changes}>
        Sound
      </Switch>,
    );
    const sw = screen.getByRole("switch", { name: "Sound" });
    fireEvent.click(sw);
    expect(changes).toHaveBeenCalledWith(true);
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw).toHaveAttribute("data-state", "unchecked");
  });
});

describe("Slot and VisuallyHidden", () => {
  test("Slot chains handlers (the child's first, which can cancel), joins classes and sets both refs", () => {
    const ours = mock(() => {});
    const ref = createRef<HTMLElement>();
    const childRef = createRef<HTMLElement>();
    render(
      <Slot className="a" onClick={ours} ref={ref}>
        <button type="button" className="b" ref={childRef as never} onClick={(e) => e.preventDefault()}>
          Own
        </button>
      </Slot>,
    );
    const link = screen.getByRole("button", { name: "Own" });
    expect(link).toHaveClass("a", "b");
    expect(ref.current).toBe(link);
    expect(childRef.current).toBe(link);
    fireEvent.click(link);
    expect(ours).not.toHaveBeenCalled();
  });

  test("VisuallyHidden words reach the accessible name", () => {
    render(
      <button type="button">
        3<VisuallyHidden> new cards</VisuallyHidden>
      </button>,
    );
    expect(screen.getByRole("button", { name: "3 new cards" })).toBeInTheDocument();
  });
});

describe("rovingIndex", () => {
  test("arrows step along the axis and wrap; Home and End go to the ends; other keys are not taken", () => {
    expect(rovingIndex("ArrowRight", 2, 3)).toBe(0);
    expect(rovingIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(rovingIndex("ArrowLeft", 0, 3, "horizontal", false)).toBe(0);
    expect(rovingIndex("ArrowDown", 0, 3, "horizontal")).toBeNull();
    expect(rovingIndex("ArrowDown", 0, 3, "vertical")).toBe(1);
    expect(rovingIndex("ArrowRight", 0, 3, "vertical")).toBeNull();
    expect(rovingIndex("End", 0, 3)).toBe(2);
    expect(rovingIndex("Home", 2, 3)).toBe(0);
    expect(rovingIndex("ArrowRight", 1, 3, "horizontal", true, true)).toBe(0);
    expect(rovingIndex("a", 1, 3)).toBeNull();
  });
});
