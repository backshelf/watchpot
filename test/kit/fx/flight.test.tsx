import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  FLIGHT,
  FlightHost,
  type FlyOptions,
  flightKeyframes,
  flightPath,
  useFlight,
} from "../../../src/kit/fx/flight";
import { setReducedMotion } from "../../../src/kit/fx/motion";

interface PageProps {
  opts: Omit<FlyOptions, "from">;
  host?: boolean;
  /** The one pill on the page: gold unless named. */
  pill?: string;
}

/** The page's glyphs: gold and gems only, so any other currency has none of its own. */
const glyphOf = (currency: string) => (currency === "gold" || currency === "gems" ? <i>{currency}</i> : null);

/** A page root with a host, one pill and a button that flies `opts` from itself. */
function Page({ opts, host = true, pill = "gold" }: PageProps) {
  const fly = useFlight();
  return (
    <div data-theme="game">
      {host && <FlightHost glyphOf={glyphOf} />}
      <span data-testid="pill" data-pill={pill} />
      <button type="button" onClick={(e) => fly({ ...opts, from: e.currentTarget })}>
        Claim
      </button>
    </div>
  );
}

const glyphs = () => document.querySelectorAll("[data-flight-glyph]");
const claim = () => act(() => fireEvent.click(screen.getByRole("button", { name: "Claim" })));
const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));
/** The last glyph of `n` lands at this many ms. */
const lastLanding = (n: number) =>
  FLIGHT.burst + (n - 1) * Math.min(FLIGHT.stagger, FLIGHT.staggerSpan / (n - 1)) + FLIGHT.travel;

describe("fly", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setReducedMotion("full");
  });
  afterEach(() => {
    setReducedMotion("system");
    jest.useRealTimers();
  });

  test("spawns the count in the page root, bumps the pill as they land and removes them", () => {
    render(<Page opts={{ currency: "gold", count: 3 }} />);
    claim();
    expect(glyphs()).toHaveLength(3);
    const root = document.querySelector("[data-theme]");
    for (const g of glyphs()) expect(root?.contains(g)).toBe(true);
    const pill = screen.getByTestId("pill");
    expect(pill).not.toHaveAttribute("data-bump");
    advance(FLIGHT.burst + FLIGHT.travel);
    expect(pill).toHaveAttribute("data-bump");
    expect(glyphs()).toHaveLength(2);
    advance(lastLanding(3));
    expect(glyphs()).toHaveLength(0);
    advance(FLIGHT.bump);
    expect(pill).not.toHaveAttribute("data-bump");
  });

  test("a count over the cap flies the cap", () => {
    render(<Page opts={{ currency: "gold", count: FLIGHT.max * 3 }} />);
    claim();
    expect(glyphs()).toHaveLength(FLIGHT.max);
    advance(lastLanding(FLIGHT.max));
    expect(glyphs()).toHaveLength(0);
  });

  test("a missing target or no host is a no-op", () => {
    const missing = render(<Page opts={{ currency: "gems" }} />);
    claim();
    expect(glyphs()).toHaveLength(0);
    advance(1000);
    expect(screen.getByTestId("pill")).not.toHaveAttribute("data-bump");
    missing.unmount();

    render(<Page opts={{ currency: "gold" }} host={false} />);
    expect(() => claim()).not.toThrow();
    expect(glyphs()).toHaveLength(0);
    expect(screen.getByTestId("pill")).not.toHaveAttribute("data-bump");
  });

  test("a currency with no glyph only bumps its pill", () => {
    render(<Page opts={{ currency: "tokens" }} pill="tokens" />);
    claim();
    expect(glyphs()).toHaveLength(0);
    expect(screen.getByTestId("pill")).toHaveAttribute("data-bump");
  });

  test("reduced motion spawns none and still bumps the pill", () => {
    setReducedMotion("reduced");
    render(<Page opts={{ currency: "gold" }} />);
    claim();
    expect(glyphs()).toHaveLength(0);
    const pill = screen.getByTestId("pill");
    expect(pill).toHaveAttribute("data-bump");
    advance(FLIGHT.bump);
    expect(pill).not.toHaveAttribute("data-bump");
  });
});

describe("flightPath", () => {
  const from = { x: 40, y: 400 };
  const to = { x: 300, y: 20 };

  test("starts on the source, ends on the target, times rise from 0 to 1", () => {
    for (let i = 0; i < 6; i++) {
      const p = flightPath(from, to, i, 6);
      expect(p.x[0]).toBe(from.x);
      expect(p.y[0]).toBe(from.y);
      expect(p.x.at(-1)).toBeCloseTo(to.x);
      expect(p.y.at(-1)).toBeCloseTo(to.y);
      expect(p.times[0]).toBe(0);
      expect(p.times.at(-1)).toBeCloseTo(1);
      for (let k = 1; k < p.times.length; k++) expect(p.times[k]).toBeGreaterThan(p.times[k - 1] ?? 1);
      expect(p.x).toHaveLength(p.times.length);
    }
  });

  test("glyphs land one stagger apart, and twelve stay inside the capped spread", () => {
    const six = Array.from({ length: 6 }, (_, i) => flightPath(from, to, i, 6).duration);
    expect((six[1] ?? 0) - (six[0] ?? 0)).toBe(FLIGHT.stagger);
    const twelve = Array.from({ length: 12 }, (_, i) => flightPath(from, to, i, 12).duration);
    expect((twelve[11] ?? 0) - (twelve[0] ?? 0)).toBeCloseTo(FLIGHT.staggerSpan);
  });

  test("keyframes fade in, spring past full size, and land small and gone on the target", () => {
    const frames = flightKeyframes(flightPath(from, to, 2, 6));
    expect(frames[0]?.opacity).toBe(0);
    expect(frames.at(-1)?.opacity).toBe(0);
    expect(frames.at(-1)?.transform).toMatch(/^translate\(300(\.0+\d*)?px, 20(\.0+\d*)?px\) /);
    const scales = frames.map((f) => Number(/scale\(([\d.]+)\)/.exec(String(f.transform))?.[1]));
    expect(Math.max(...scales)).toBeGreaterThan(1);
    expect(scales.at(-1)).toBeLessThan(1);
  });

  test("each glyph bows its own way", () => {
    const mid = (i: number) => {
      const p = flightPath(from, to, i, 6);
      return p.x[Math.floor(p.x.length * 0.7)] ?? 0;
    };
    expect(new Set([0, 1, 2, 3].map(mid)).size).toBe(4);
  });
});
