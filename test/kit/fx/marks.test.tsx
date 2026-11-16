import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { act, render } from "@testing-library/react";
import { StrictMode } from "react";
import { compositorOnly, createMarks, kick, MarkLayer, markKeyframes } from "../../../src/kit/fx/marks";

interface Call {
  el: Element;
  keyframes: Keyframe[];
  duration: number;
}
let calls: Call[] = [];
const proto = HTMLElement.prototype as unknown as { animate?: unknown; getAnimations?: unknown };
const realAnimate = proto.animate;
const realGet = proto.getAnimations;

beforeEach(() => {
  jest.useFakeTimers();
  calls = [];
  proto.animate = function (this: Element, keyframes: Keyframe[], o: KeyframeAnimationOptions) {
    calls.push({ el: this, keyframes, duration: Number(o.duration) });
    return { cancel() {} };
  };
  proto.getAnimations = () => [];
});
afterEach(() => {
  jest.useRealTimers();
  proto.animate = realAnimate;
  proto.getAnimations = realGet;
  document.body.replaceChildren();
});

function layer(): HTMLDivElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 600 }) as DOMRect;
  document.body.append(el);
  return el;
}

describe("createMarks", () => {
  test("places a mark at a client point, relative to its layer, with its kind and step", () => {
    const marks = createMarks({ className: "ink", reduced: () => false });
    const host = layer();
    marks.attach(host);
    const el = marks.at(130, 80, { kind: "buy", step: 3, text: "x12" });
    expect(el?.parentElement).toBe(host);
    expect(el?.getAttribute("data-mark")).toBe("buy");
    expect(el?.getAttribute("aria-hidden")).toBe("true");
    expect(el?.className).toBe("ink");
    expect(el?.style.left).toBe("30px");
    expect(el?.style.top).toBe("30px");
    expect(el?.style.getPropertyValue("--step")).toBe("3");
    expect(el?.textContent).toBe("x12");
    expect(calls).toHaveLength(1);
  });

  test("never holds more than max: the oldest goes first", () => {
    const marks = createMarks({ max: 3, reduced: () => false });
    const host = layer();
    marks.attach(host);
    const first = marks.at(0, 0, { text: "first" });
    for (let i = 0; i < 5; i++) marks.at(i, i, { text: `m${i}` });
    expect(host.children).toHaveLength(3);
    expect(first?.isConnected === false || first?.textContent !== "first").toBe(true);
    expect([...host.children].map((c) => c.textContent)).toEqual(["m2", "m3", "m4"]);
  });

  test("removes each mark when its run ends, and reuses the element", () => {
    const marks = createMarks({ duration: 400, reduced: () => false });
    const host = layer();
    marks.attach(host);
    const a = marks.at(0, 0);
    jest.advanceTimersByTime(399);
    expect(host.children).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(host.children).toHaveLength(0);
    expect(marks.live()).toBe(0);
    const b = marks.at(0, 0, { kind: "next" });
    expect(b).toBe(a);
    expect(b?.getAttribute("data-mark")).toBe("next");
  });

  test("a mark's own custom properties do not carry over to the next use of its element", () => {
    const marks = createMarks({ duration: 100, reduced: () => false });
    marks.attach(layer());
    const a = marks.at(0, 0, { vars: { "--tilt": "4deg" } });
    expect(a?.style.getPropertyValue("--tilt")).toBe("4deg");
    jest.advanceTimersByTime(100);
    const b = marks.at(0, 0);
    expect(b).toBe(a);
    expect(b?.style.getPropertyValue("--tilt")).toBe("");
    expect(b?.style.left).toBe("-100px");
  });

  test("under reduced motion it only fades in place, for half the time", () => {
    const marks = createMarks({ duration: 600, reduced: () => true });
    marks.attach(layer());
    marks.at(0, 0);
    const call = calls[0];
    expect(call?.duration).toBe(300);
    const transforms = new Set(call?.keyframes.map((k) => k.transform));
    expect(transforms.size).toBe(1);
  });

  test("animates nothing but the compositor's properties", () => {
    const marks = createMarks({ reduced: () => false });
    marks.attach(layer());
    marks.at(0, 0, {
      keyframes: [
        { left: "0px", opacity: 0 },
        { left: "9px", opacity: 1, width: "3px" },
      ],
    });
    expect(calls[0]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(compositorOnly([{ transform: "none", top: "1px", offset: 0.5 }])).toEqual([
      { transform: "none", offset: 0.5 },
    ]);
  });

  test("leaves the run to the game's CSS when keyframes are null, and lives its lifetime", () => {
    const marks = createMarks({ keyframes: null, lifetime: 1000 });
    const host = layer();
    marks.attach(host);
    marks.at(0, 0);
    expect(calls).toHaveLength(0);
    jest.advanceTimersByTime(999);
    expect(host.children).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(host.children).toHaveLength(0);
  });

  test("makes nothing while hidden or unattached; detaching clears the layer", () => {
    let hidden = true;
    const marks = createMarks({ hidden: () => hidden });
    expect(marks.at(0, 0)).toBeNull();
    const host = layer();
    const detach = marks.attach(host);
    expect(marks.at(0, 0)).toBeNull();
    hidden = false;
    marks.at(0, 0);
    marks.at(0, 0);
    detach();
    expect(host.children).toHaveLength(0);
    expect(marks.at(0, 0)).toBeNull();
  });

  test("the default run is centred on its point in every frame", () => {
    for (const reduced of [true, false])
      for (const k of markKeyframes(reduced)) expect(String(k.transform)).toContain("translate(-50%, -50%)");
  });
});

describe("MarkLayer", () => {
  test("attaches under StrictMode and detaches on unmount", () => {
    const marks = createMarks({ reduced: () => false });
    const { container, unmount } = render(
      <StrictMode>
        <MarkLayer marks={marks} className="layer" />
      </StrictMode>,
    );
    const host = container.querySelector("[data-mark-layer]") as HTMLElement;
    expect(host.getAttribute("aria-hidden")).toBe("true");
    act(() => {
      marks.at(5, 5);
    });
    expect(host.children).toHaveLength(1);
    unmount();
    expect(marks.at(5, 5)).toBeNull();
  });
});

describe("kick", () => {
  test("flips the attribute so a keyframe restarts, at most once per gap", () => {
    let t = 0;
    const el = document.createElement("span");
    expect(kick(el, "bump", { now: () => t })).toBe(true);
    expect(el.getAttribute("data-bump")).toBe("a");
    t = 100;
    expect(kick(el, "bump", { now: () => t })).toBe(false);
    t = 200;
    expect(kick(el, "bump", { now: () => t })).toBe(true);
    expect(el.getAttribute("data-bump")).toBe("b");
    expect(kick(null)).toBe(false);
  });
});
