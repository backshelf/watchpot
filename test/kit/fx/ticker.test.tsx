import { afterEach, describe, expect, jest, test } from "bun:test";
import { act, render, renderHook } from "@testing-library/react";
import { Money, Ticker } from "../../../src/kit/fx/Ticker";
import { throttleDelay, useThrottledValue } from "../../../src/kit/fx/throttle";

// NumberFlow draws every digit as a 0-9 column inside a shadow root, with every digit but the current one
// marked `inert`. Read the text that is not inert and not its <style>.
const visible = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof Element && (node.hasAttribute("inert") || node.nodeName === "STYLE")) return "";
  const inner = node instanceof Element && node.shadowRoot ? node.shadowRoot : node;
  return Array.from(inner.childNodes).map(visible).join("");
};
const text = (el: Element) => visible(el).replace(/[\s​]+/g, "");

describe("throttleDelay", () => {
  test("shows at once when the window has passed, and waits out the rest of it otherwise", () => {
    expect(throttleDelay(0, 300, 250)).toBe(0);
    expect(throttleDelay(Number.NEGATIVE_INFINITY, 5, 250)).toBe(0);
    expect(throttleDelay(1000, 1100, 250)).toBe(150);
  });
});

describe("useThrottledValue", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("a burst of changes shows the first now and the last later, nothing in between", () => {
    jest.useFakeTimers();
    const seen: number[] = [];
    const { rerender } = renderHook(
      ({ v }) => {
        const shown = useThrottledValue(v, 100);
        if (seen.at(-1) !== shown) seen.push(shown);
        return shown;
      },
      { initialProps: { v: 0 } },
    );
    act(() => jest.advanceTimersByTime(100)); // let the mount's window pass
    for (let v = 1; v <= 20; v++) rerender({ v });
    expect(seen.at(-1)).toBe(1); // leading edge
    act(() => jest.advanceTimersByTime(100));
    expect(seen).toEqual([0, 1, 20]); // trailing edge carries the final value
  });
});

describe("Ticker and Money", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("Money shows integer cents as dollars to the cent", () => {
    const { container } = render(<Money cents={1} />);
    expect(text(container.firstElementChild as Element)).toContain("$0.01");
    const big = render(<Money cents={120417} />);
    expect(text(big.container.firstElementChild as Element)).toContain("$1,204.17");
  });

  test("a magnitude change never pairs the old mantissa with the new suffix", () => {
    jest.useFakeTimers();
    const view = render(<Ticker mantissa={99_960} />);
    const shown = () => text(view.container.firstElementChild as Element);
    // Inside the throttle window: both changes wait for the trailing update.
    view.rerender(<Ticker mantissa={99_970} />);
    view.rerender(<Ticker mantissa={100} suffix="K" />);
    expect(shown()).toContain("99,960");
    expect(shown()).not.toContain("K");
    act(() => jest.advanceTimersByTime(1000)); // well past the throttle window
    expect(shown()).toContain("100.00K");
  });
});
