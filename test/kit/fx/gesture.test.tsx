import { afterEach, describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { createGestures, type GestureTracker, pressPoint, useGestures } from "../../../src/kit/fx/gesture";

let tracker: GestureTracker | null = null;
afterEach(() => {
  tracker?.stop();
  tracker = null;
  document.body.replaceChildren();
});

function button(): HTMLButtonElement {
  const b = document.createElement("button");
  document.body.append(b);
  return b;
}

const press = (el: Element, x = 10, y = 20) =>
  el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
const key = (el: Element, repeat = false) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", repeat }));

describe("createGestures", () => {
  test("is active only while a person's gesture is dispatched, and remembers where it landed", () => {
    tracker = createGestures({ trusted: () => true });
    const b = button();
    let during = false;
    b.addEventListener("pointerdown", () => {
      during = tracker?.active() ?? false;
    });
    expect(tracker.active()).toBe(false);
    press(b, 12, 34);
    expect(during).toBe(true);
    expect(tracker.active()).toBe(false);
    expect(tracker.point()).toEqual({ x: 12, y: 34 });
    expect(tracker.target()).toBe(b);
  });

  test("a script's event is the machine's by default", () => {
    tracker = createGestures();
    const b = button();
    let during = true;
    b.addEventListener("pointerdown", () => {
      during = tracker?.active() ?? true;
    });
    press(b);
    expect(during).toBe(false);
    expect(tracker.target()).toBeNull();
  });

  test("recent() holds for a while after a gesture began, by the given clock", () => {
    let t = 1000;
    tracker = createGestures({ trusted: () => true, now: () => t, recentMs: 700 });
    expect(tracker.recent()).toBe(false);
    press(button());
    t = 1699;
    expect(tracker.recent()).toBe(true);
    t = 1700;
    expect(tracker.recent()).toBe(false);
    expect(tracker.recent(1000)).toBe(true);
  });

  test("an answer lasts the gesture: a new press clears it, a held key's repeat does not", () => {
    tracker = createGestures({ trusted: () => true });
    const b = button();
    press(b);
    tracker.answer();
    expect(tracker.answered()).toBe(true);
    key(b, true);
    expect(tracker.answered()).toBe(true);
    key(b);
    expect(tracker.answered()).toBe(false);
  });

  test("an answered event is remembered by identity, React's through its nativeEvent", () => {
    tracker = createGestures({ trusted: () => true });
    const a = new MouseEvent("click");
    const b = new MouseEvent("click");
    tracker.answer({ nativeEvent: a });
    expect(tracker.answered(a)).toBe(true);
    expect(tracker.answered(b)).toBe(false);
  });

  test("stop() stops listening", () => {
    tracker = createGestures({ trusted: () => true });
    tracker.stop();
    press(button(), 5, 5);
    expect(tracker.point()).toEqual({ x: 0, y: 0 });
  });
});

describe("pressPoint", () => {
  test("is the pointer for a click, the control's middle for one a key made", () => {
    const b = button();
    b.getBoundingClientRect = () => ({ left: 100, top: 50, width: 40, height: 20 }) as DOMRect;
    expect(pressPoint({ clientX: 3, clientY: 4, detail: 1, currentTarget: b })).toEqual({ x: 3, y: 4 });
    expect(pressPoint({ clientX: 0, clientY: 0, detail: 0, currentTarget: b })).toEqual({ x: 120, y: 60 });
  });
});

let hooked: GestureTracker | null = null;
function Hooked() {
  hooked = useGestures({ trusted: () => true });
  return null;
}

describe("useGestures", () => {
  test("tracks while mounted under StrictMode and stops on unmount", () => {
    const { unmount } = render(
      <StrictMode>
        <Hooked />
      </StrictMode>,
    );
    const live = hooked;
    expect(live).not.toBeNull();
    press(button(), 7, 8);
    expect(live?.point()).toEqual({ x: 7, y: 8 });
    unmount();
    press(button(), 1, 1);
    expect(live?.point()).toEqual({ x: 7, y: 8 });
  });
});
