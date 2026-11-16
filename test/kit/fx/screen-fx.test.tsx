import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, render, renderHook } from "@testing-library/react";
import { Flash, flashKeyframes } from "../../../src/kit/fx/Flash";
import { prefersReducedMotion, setReducedMotion, useReducedMotion } from "../../../src/kit/fx/motion";
import { mixHex } from "../../../src/kit/fx/tokens";
import { SHAKE_MS, shake, shakeKeyframes } from "../../../src/kit/fx/useShake";

describe("mixHex", () => {
  test("mixes two tokens in sRGB, and leaves anything that is not #rrggbb alone", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#000000", "#1f3de8", 0)).toBe("#000000");
    expect(mixHex("#000000", "#1f3de8", 1)).toBe("#1f3de8");
    expect(mixHex("#000000", "#ffffff", 2)).toBe("#ffffff");
    expect(mixHex("rgb(0 0 0)", "#ffffff", 0.5)).toBe("rgb(0 0 0)");
  });
});

describe("Flash", () => {
  test("renders only after the trigger changes, takes the game's class, and leaves when its animation ends", async () => {
    const view = render(<Flash trigger={0} duration={10} className="light" />);
    expect(view.container.firstElementChild).toBeNull();
    view.rerender(<Flash trigger={1} duration={10} className="light" />);
    const flash = view.container.firstElementChild as HTMLElement | null;
    expect(flash?.getAttribute("aria-hidden")).toBe("true");
    expect(flash?.getAttribute("data-flash")).toBe("1");
    expect(flash?.className).toBe("light");
    expect(flash?.style.pointerEvents).toBe("none");
    await act(() => new Promise<void>((done) => setTimeout(done, 60)));
    expect(view.container.firstElementChild).toBeNull();
  });

  test("the curve rises fast to its peak and falls to nothing; reduced is a third as bright", () => {
    const full = flashKeyframes(0.3, false);
    expect(full.map((k) => k.opacity)).toEqual([0, 0.3, 0]);
    expect(Number(full[1]?.offset)).toBeLessThan(0.1);
    const reduced = flashKeyframes(0.3, true);
    expect(Number(reduced[0]?.opacity)).toBeCloseTo(0.1);
    expect(reduced.at(-1)?.opacity).toBe(0);
  });
});

describe("shake", () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  const element = () => {
    const el = document.createElement("div");
    const animate = mock((_k: Keyframe[], _o: KeyframeAnimationOptions) => ({}) as Animation);
    Object.assign(el, { animate });
    return { el, animate };
  };

  test("keyframes start and end at rest, and hard moves further than soft", () => {
    const reach = (s: "soft" | "hard") =>
      Math.max(
        ...shakeKeyframes(s).flatMap((k) =>
          [...String(k.transform).matchAll(/(-?[\d.]+)px/g)].map((m) => Math.abs(Number(m[1]))),
        ),
      );
    for (const s of ["soft", "hard"] as const) {
      const k = shakeKeyframes(s);
      expect(k[0]?.transform).toBe("translate(0, 0)");
      expect(k.at(-1)?.transform).toBe("translate(0, 0)");
    }
    expect(reach("hard")).toBeGreaterThan(reach("soft"));
  });

  test("runs one animation, and none while the OS or the in-game setting reduces motion", () => {
    const { el, animate } = element();
    setReducedMotion("reduced");
    try {
      shake(el);
    } finally {
      setReducedMotion("system");
    }
    expect(animate).not.toHaveBeenCalled();
    shake(el, "hard");
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]?.[1]).toMatchObject({ duration: SHAKE_MS });

    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
    })) as typeof window.matchMedia;
    shake(el);
    expect(animate).toHaveBeenCalledTimes(1);
  });
});

describe("the in-game motion override", () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    setReducedMotion("system");
  });

  test("reduced and full beat the OS; system defers to it", () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
    })) as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(true);
    setReducedMotion("full");
    expect(prefersReducedMotion()).toBe(false);
    window.matchMedia = realMatchMedia;
    setReducedMotion("reduced");
    expect(prefersReducedMotion()).toBe(true);
  });

  test("useReducedMotion re-renders when the setting changes", () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => setReducedMotion("reduced"));
    expect(result.current).toBe(true);
    act(() => setReducedMotion("system"));
    expect(result.current).toBe(false);
  });
});
