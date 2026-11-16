import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { Marquee, Near, nearLevel, rimBulbs, rimPoint } from "../../src/ui/near";

describe("nearLevel", () => {
  const at = [0.8, 0.95];

  test("rises at a threshold", () => {
    expect(nearLevel(0.79, at, 0)).toBe(0);
    expect(nearLevel(0.8, at, 0)).toBe(1);
    expect(nearLevel(0.97, at, 0)).toBe(2);
  });

  test("falls only past the hysteresis, a band at a time as far as the value goes", () => {
    expect(nearLevel(0.79, at, 1, 0.02)).toBe(1);
    expect(nearLevel(0.78, at, 1, 0.02)).toBe(1);
    expect(nearLevel(0.77, at, 1, 0.02)).toBe(0);
    expect(nearLevel(0.94, at, 2, 0.02)).toBe(2);
    expect(nearLevel(0.9, at, 2, 0.02)).toBe(1);
    expect(nearLevel(0.1, at, 2, 0.02)).toBe(0);
  });

  test("reads a non-finite value as nothing", () => {
    expect(nearLevel(Number.NaN, at, 0)).toBe(0);
  });
});

describe("Near", () => {
  test("names its band on data-near and holds it through a wobble", () => {
    const { rerender } = render(
      <StrictMode>
        <Near value={0.5} data-testid="n" />
      </StrictMode>,
    );
    const el = screen.getByTestId("n");
    expect(el.hasAttribute("data-near")).toBe(false);
    expect(el.style.getPropertyValue("--near")).toBe("0.5");
    rerender(
      <StrictMode>
        <Near value={0.96} data-testid="n" />
      </StrictMode>,
    );
    expect(el.getAttribute("data-near")).toBe("close");
    rerender(
      <StrictMode>
        <Near value={0.94} data-testid="n" />
      </StrictMode>,
    );
    expect(el.getAttribute("data-near")).toBe("close");
    rerender(
      <StrictMode>
        <Near value={0.85} data-testid="n" names={["warm", "hot"]} />
      </StrictMode>,
    );
    expect(el.getAttribute("data-near")).toBe("warm");
  });
});

describe("the rim", () => {
  test("rimPoint walks clockwise from the top-left corner", () => {
    expect(rimPoint(0, 10, 4)).toEqual([0, 0]);
    expect(rimPoint(10, 10, 4)).toEqual([10, 0]);
    expect(rimPoint(12, 10, 4)).toEqual([10, 2]);
    expect(rimPoint(20, 10, 4)).toEqual([4, 4]);
    expect(rimPoint(27, 10, 4)).toEqual([0, 1]);
    expect(rimPoint(28, 10, 4)).toEqual([0, 0]);
  });

  test("rimBulbs spaces bulbs evenly and caps their count whatever the box", () => {
    expect(rimBulbs(0, 20)).toEqual([]);
    expect(rimBulbs(100, 30, { spacing: 16, pad: 0 })).toHaveLength(Math.round(260 / 16));
    expect(rimBulbs(1e9, 1e9, { max: 120 })).toHaveLength(120);
    expect(rimBulbs(1, 1, { min: 8 })).toHaveLength(8);
    const first = rimBulbs(100, 30, { pad: 5 })[0];
    expect(first).toEqual({ x: -5, y: -5, i: 0 });
  });
});

describe("Marquee", () => {
  test("wraps its children with a hidden ring; nothing is drawn before it is measured", () => {
    render(
      <Marquee fill={0.5} data-state="charging">
        <button type="button">Go</button>
      </Marquee>,
    );
    const button = screen.getByRole("button", { name: "Go" });
    const root = button.parentElement as HTMLElement;
    expect(root.hasAttribute("data-marquee")).toBe(true);
    expect(root.getAttribute("data-state")).toBe("charging");
    const rim = root.querySelector("[data-rim]");
    expect(rim?.getAttribute("aria-hidden")).toBe("true");
    expect(rim?.children).toHaveLength(0);
  });

  test("once measured, lights the share `fill` asks for, clockwise, and marks the next", () => {
    const RO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        this.cb([{ contentRect: { width: 100, height: 30 } } as ResizeObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const { container } = render(
        <Marquee
          fill={0.25}
          spacing={10}
          pad={0}
          bulbProps={(i) => ({ className: "bulb", style: { "--i": i % 3 } })}
        >
          <span>x</span>
        </Marquee>,
      );
      // A bulb's own props keep their style beside the placement.
      const fourth = container.querySelectorAll<HTMLElement>("[data-bulb]")[4];
      expect(fourth?.className).toBe("bulb");
      expect(fourth?.style.getPropertyValue("--i")).toBe("1");
      expect(fourth?.style.getPropertyValue("--k")).toBe("4");
      const bulbs = container.querySelectorAll("[data-bulb]");
      expect(bulbs).toHaveLength(26);
      expect(container.querySelectorAll("[data-lit]")).toHaveLength(7);
      expect(bulbs[7]?.hasAttribute("data-next")).toBe(true);
      expect((container.firstElementChild as HTMLElement).style.getPropertyValue("--n")).toBe("26");
    } finally {
      globalThis.ResizeObserver = RO;
    }
  });
});
