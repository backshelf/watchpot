import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import {
  BARCODE_MAX_CHARS,
  Barcode,
  bitsOf,
  code128,
  LevelBars,
  levelBarsPath,
  Ruler,
  SERIES_MAX_POINTS,
  Sparkline,
  SplitFlap,
  seriesPoints,
  seriesY,
  tickPath,
} from "../../src/ui/print";

/** The run widths a symbol's bars and spaces make, read back from the bars. */
function runsOf(text: string): string {
  const { bars } = code128(text);
  let runs = "";
  bars.forEach((b, i) => {
    runs += String(b.w);
    const next = bars[i + 1];
    if (next) runs += String(next.x - b.x - b.w);
  });
  return runs;
}

describe("code128", () => {
  test("encodes start B, the data, the checksum and the stop", () => {
    // "A" is value 33; the checksum is (104 + 33) mod 103 = 34, "B"'s pattern.
    expect(runsOf("A")).toBe(`211214${"111323"}${"131123"}2331112`);
  });

  test("every symbol is eleven modules and the stop thirteen", () => {
    for (const text of ["", "AWAY1234", "~ !"]) {
      const n = [...text].length;
      expect(code128(text).width).toBe(11 * (n + 2) + 13);
    }
  });

  test("encodes a character outside printable ASCII as a space, and cuts a long text", () => {
    expect(runsOf("é")).toBe(runsOf(" "));
    expect(code128("x".repeat(1000)).width).toBe(11 * (BARCODE_MAX_CHARS + 2) + 13);
  });
});

describe("Barcode", () => {
  test("is an image named by its label", () => {
    render(<Barcode value="AB12" label="lot number" />);
    const img = screen.getByRole("img", { name: "lot number" });
    expect(img.hasAttribute("data-barcode")).toBe(true);
    expect(img.querySelector("path")?.getAttribute("d")?.startsWith("M0 0h2")).toBe(true);
  });

  test("without a label is hidden decoration", () => {
    const { container } = render(<Barcode value="AB12" />);
    const svg = container.querySelector("[data-barcode]") as SVGElement;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.hasAttribute("role")).toBe(false);
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("ruler and level bars", () => {
  test("tickPath caps its ticks and makes every major one long", () => {
    expect(tickPath(1e9, 5, 8).split("M")).toHaveLength(202);
    expect(tickPath(4, 2, 8)).toBe("M0 8V0M25 8V4M50 8V0M75 8V4M100 8V0");
  });

  test("Ruler places its caret at --at, clamped", () => {
    const { container } = render(<Ruler at={1.7} />);
    const caret = container.querySelector("[data-caret]") as HTMLElement;
    expect(caret.style.getPropertyValue("--at")).toBe("1");
  });

  test("levelBarsPath keeps the newest readings at the right and draws missing ones as the floor", () => {
    const { d, width } = levelBarsPath([1], 3, 10);
    expect(width).toBe(8);
    expect(d).toBe("M0 4.5h2v1h-2zM3 4.5h2v1h-2zM6 0h2v10h-2z");
    expect(levelBarsPath([], 1e9, 10).d.split("M")).toHaveLength(241);
  });

  test("LevelBars draws one path", () => {
    const { container } = render(<LevelBars values={[0.5, 1]} bars={4} />);
    expect(container.querySelectorAll("[data-level-bars] path")).toHaveLength(1);
  });
});

describe("sparkline", () => {
  test("seriesY puts the top at the top, clamps outside values and centres a flat range", () => {
    expect(seriesY(10, 0, 10, 100, 0)).toBe(0);
    expect(seriesY(0, 0, 10, 100, 0)).toBe(100);
    expect(seriesY(50, 0, 10, 100, 0)).toBe(0);
    expect(seriesY(5, 5, 5, 100, 0)).toBe(50);
  });

  test("seriesPoints spreads the newest points across the frame, oldest at the left, skipping non-finite ones", () => {
    const { points, min, max } = seriesPoints([3, Number.NaN, 1, 2], { width: 100, height: 10, pad: 0 });
    expect([min, max]).toEqual([1, 3]);
    expect(points.map((p) => p[0])).toEqual([0, 50, 100]);
    expect(points[0]?.[1]).toBe(0);
    const long = seriesPoints(
      Array.from({ length: 2000 }, (_, i) => i),
      { width: 1, height: 1 },
    );
    expect(long.points).toHaveLength(SERIES_MAX_POINTS);
    expect(long.min).toBe(2000 - SERIES_MAX_POINTS);
  });

  test("Sparkline draws its zones, rules, line and dot by name", () => {
    const { container } = render(
      <Sparkline
        values={[1, 2, 3]}
        label="price"
        width={300}
        height={96}
        min={0}
        max={4}
        zones={[
          { name: "sell", from: 3, to: 4 },
          { name: "buy", from: 0, to: 1 },
        ]}
        rules={[{ name: "basis", at: 2 }]}
        area
      />,
    );
    // Zones that run to max and min run to the frame's edges, through the pad.
    const sell = container.querySelector('[data-zone="sell"]');
    expect(sell?.getAttribute("y")).toBe("0");
    const buy = container.querySelector('[data-zone="buy"]');
    expect(Number(buy?.getAttribute("y")) + Number(buy?.getAttribute("height"))).toBe(96);
    expect(container.querySelector('[data-rule="basis"]')).not.toBeNull();
    expect(container.querySelector("[data-line]")?.getAttribute("points")?.split(" ")).toHaveLength(3);
    expect(container.querySelector("[data-area]")).not.toBeNull();
    expect(container.querySelector("[data-dot]")?.getAttribute("cx")).toBe("300");
  });

  test("an empty series draws no line and no dot", () => {
    const { container } = render(<Sparkline values={[]} label="none" width={10} height={10} />);
    expect(container.querySelector("[data-line]")).toBeNull();
    expect(container.querySelector("[data-dot]")).toBeNull();
  });
});

describe("bitsOf", () => {
  test("is the low bits, highest first, capped at 64", () => {
    expect(bitsOf(5, 4)).toBe("0101");
    expect(bitsOf(Number.POSITIVE_INFINITY, 3)).toBe("000");
    expect(bitsOf(1, 1000)).toHaveLength(64);
  });
});

describe("SplitFlap", () => {
  test("keys each cell by place and character and remembers what it replaced, under StrictMode", () => {
    const { container, rerender } = render(
      <StrictMode>
        <SplitFlap text="01:59" />
      </StrictMode>,
    );
    const root = container.querySelector("[data-split-flap]") as HTMLElement;
    expect(root.textContent?.startsWith("01:59")).toBe(true);
    const cells = () => [...root.querySelectorAll("[data-flap]")];
    expect(cells()).toHaveLength(5);
    expect(cells()[2]?.hasAttribute("data-gap")).toBe(true);
    const tens = cells()[0];
    const last = cells()[4];

    rerender(
      <StrictMode>
        <SplitFlap text="01:58" />
      </StrictMode>,
    );
    expect(cells()[0]).toBe(tens);
    expect(cells()[4]).not.toBe(last);
    expect(cells()[4]?.getAttribute("data-prev")).toBe("9");
    expect(cells()[0]?.hasAttribute("data-prev")).toBe(false);
  });
});
