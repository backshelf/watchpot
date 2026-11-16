import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { HoldButton, Pressable, type PressInfo } from "watchpot/ui";

describe("Pressable", () => {
  test("one press per pointer down, one per finger; the browser's click after it is not counted", () => {
    const press = mock((_: PressInfo) => {});
    render(<Pressable onPress={press}>Mine</Pressable>);
    const target = screen.getByRole("button", { name: "Mine" });
    fireEvent.pointerDown(target, { pointerType: "mouse", pointerId: 1, button: 0, clientX: 12, clientY: 7 });
    expect(target).toHaveAttribute("data-pressed");
    fireEvent.pointerUp(target, { pointerId: 1 });
    fireEvent.click(target, { detail: 1 });
    expect(target).not.toHaveAttribute("data-pressed");
    expect(press).toHaveBeenCalledTimes(1);
    expect(press.mock.calls[0]?.[0]).toMatchObject({ x: 12, y: 7, pointerType: "mouse" });
    fireEvent.pointerDown(target, { pointerType: "touch", pointerId: 2 });
    fireEvent.pointerDown(target, { pointerType: "touch", pointerId: 3 });
    expect(press).toHaveBeenCalledTimes(3);
    fireEvent.pointerUp(target, { pointerId: 2 });
    expect(target).toHaveAttribute("data-pressed");
    fireEvent.pointerUp(target, { pointerId: 3 });
    expect(target).not.toHaveAttribute("data-pressed");
  });

  test("Space and Enter press once each; held repeats are ignored unless asked; a secondary button is not a press", () => {
    const press = mock((_: PressInfo) => {});
    const { rerender } = render(<Pressable onPress={press}>Mine</Pressable>);
    const target = screen.getByRole("button", { name: "Mine" });
    fireEvent.keyDown(target, { key: " " });
    fireEvent.keyDown(target, { key: " ", repeat: true });
    fireEvent.keyUp(target, { key: " " });
    fireEvent.keyDown(target, { key: "Enter" });
    expect(press).toHaveBeenCalledTimes(2);
    expect(press.mock.calls[0]?.[0].pointerType).toBe("keyboard");
    fireEvent.pointerDown(target, { pointerType: "mouse", pointerId: 1, button: 2 });
    expect(press).toHaveBeenCalledTimes(2);
    rerender(
      <Pressable onPress={press} keyRepeat>
        Mine
      </Pressable>,
    );
    fireEvent.keyDown(target, { key: "Enter", repeat: true });
    expect(press).toHaveBeenCalledTimes(3);
  });

  test("a click with no pointer behind it (assistive tech) is a press; disabled presses nothing", () => {
    const press = mock((_: PressInfo) => {});
    const { rerender } = render(<Pressable onPress={press}>Mine</Pressable>);
    fireEvent.click(screen.getByRole("button"), { detail: 0 });
    expect(press).toHaveBeenCalledTimes(1);
    expect(press.mock.calls[0]?.[0].pointerType).toBe("virtual");
    rerender(
      <Pressable onPress={press} disabled>
        Mine
      </Pressable>,
    );
    fireEvent.pointerDown(screen.getByRole("button"), { pointerType: "mouse", pointerId: 1, button: 0 });
    expect(press).toHaveBeenCalledTimes(1);
  });
});

describe("HoldButton", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("acts at the press, repeats after the delay, faster as it holds, and stops on release", () => {
    const buy = mock(() => {});
    render(
      <HoldButton action={buy} delay={400} interval={100} minInterval={20} acceleration={0.5}>
        Buy
      </HoldButton>,
    );
    const button = screen.getByRole("button", { name: "Buy" });
    fireEvent.pointerDown(button, { pointerType: "mouse", pointerId: 1, button: 0 });
    expect(buy).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("data-holding");
    act(() => jest.advanceTimersByTime(399));
    expect(buy).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(1)); // the delay: second
    act(() => jest.advanceTimersByTime(100)); // the first interval: third
    act(() => jest.advanceTimersByTime(50)); // halved: fourth
    act(() => jest.advanceTimersByTime(25)); // halved: fifth
    act(() => jest.advanceTimersByTime(20)); // floored at minInterval: sixth
    expect(buy).toHaveBeenCalledTimes(6);
    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(button).not.toHaveAttribute("data-holding");
    act(() => jest.advanceTimersByTime(1000));
    expect(buy).toHaveBeenCalledTimes(6);
  });

  test("stops when the action says there is nothing left, on pointer leave, on blur and on disable", () => {
    let left = 3;
    const buy = mock(() => --left > 0);
    const { rerender } = render(
      <HoldButton action={buy} delay={10} interval={10}>
        Buy
      </HoldButton>,
    );
    const button = screen.getByRole("button", { name: "Buy" });
    fireEvent.pointerDown(button, { pointerType: "touch", pointerId: 5 });
    act(() => jest.advanceTimersByTime(500));
    expect(buy).toHaveBeenCalledTimes(3);
    expect(button).not.toHaveAttribute("data-holding");

    left = 100;
    fireEvent.pointerDown(button, { pointerType: "touch", pointerId: 6 });
    fireEvent.pointerLeave(button, { pointerId: 6 });
    act(() => jest.advanceTimersByTime(500));
    expect(buy).toHaveBeenCalledTimes(4);

    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: "Enter", repeat: true });
    expect(buy).toHaveBeenCalledTimes(5);
    fireEvent.blur(button);
    act(() => jest.advanceTimersByTime(500));
    expect(buy).toHaveBeenCalledTimes(5);

    fireEvent.keyDown(button, { key: " " });
    rerender(
      <HoldButton action={buy} delay={10} interval={10} disabled>
        Buy
      </HoldButton>,
    );
    act(() => jest.advanceTimersByTime(500));
    expect(buy).toHaveBeenCalledTimes(6);
  });
});
