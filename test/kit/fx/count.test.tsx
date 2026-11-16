import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, render } from "@testing-library/react";
import { StrictMode } from "react";
import { D, type Decimal } from "../../../src/core/decimal";
import { Count, countBetween, countFrameCap, countUp } from "../../../src/kit/fx/Count";
import { setReducedMotion } from "../../../src/kit/fx/motion";

/** Frames the test hands out by hand, each `step` ms after the last. */
function frames(step = 16) {
  let t = 0;
  let queue: { id: number; cb: (time: number) => void }[] = [];
  let next = 1;
  let ran = 0;
  return {
    frame(cb: (time: number) => void) {
      const id = next++;
      queue.push({ id, cb });
      return id;
    },
    cancelFrame(id: number) {
      queue = queue.filter((f) => f.id !== id);
    },
    /** Runs up to `n` frames; returns how many ran. */
    run(n = 1000) {
      let done = 0;
      while (queue.length > 0 && done < n) {
        const due = queue;
        queue = [];
        t += step;
        for (const f of due) f.cb(t);
        done++;
        ran++;
      }
      return done;
    },
    ran: () => ran,
    pending: () => queue.length,
    setStep(ms: number) {
      step = ms;
    },
  };
}

const fmt = (d: Decimal) => d.toString();

describe("countBetween", () => {
  test("is straight below a thousand and in log space above it", () => {
    expect(countBetween(D(0), D(100), 0.5).toNumber()).toBe(50);
    expect(countBetween(D(1), D("1e300"), 0.5).log10().toNumber()).toBeCloseTo(150, 6);
    expect(countBetween(D(10), D(1000), 0.5).toNumber()).toBeCloseTo(100, 6);
  });

  test("from nothing to a large figure rolls through the orders of magnitude; to a small one, straight", () => {
    expect(countBetween(D(0), D("1e300"), 0.5).log10().toNumber()).toBeCloseTo(150, 6);
    expect(countBetween(D(0.5), D("1e6"), 0.25).log10().toNumber()).toBeCloseTo(1.5, 6);
    expect(countBetween(D(0), D(999), 0.5).toNumber()).toBeCloseTo(499.5, 6);
    expect(countBetween(D(0), D("1e300"), 0).eq(0)).toBe(true);
  });

  test("rolls through the exponent past 1e308", () => {
    const mid = countBetween(D("1e1000"), D("1e3000"), 0.5);
    expect(mid.log10().toNumber()).toBeCloseTo(2000, 6);
  });

  test("ends exactly on its ends", () => {
    expect(countBetween(D(3), D("1e500"), 1).eq("1e500")).toBe(true);
    expect(countBetween(D(3), D("1e500"), 0).eq(3)).toBe(true);
  });
});

describe("countUp", () => {
  test("rolls by time and lands on the end, once", () => {
    const f = frames(16);
    const node = { textContent: "" as string | null };
    let landed = 0;
    countUp(node, { from: 0, to: 1000, ms: 160, format: fmt, reduced: false, onLand: () => landed++, ...f });
    expect(node.textContent).toBe("0");
    f.run(5);
    expect(Number(node.textContent)).toBeGreaterThan(0);
    expect(Number(node.textContent)).toBeLessThan(1000);
    f.run();
    expect(node.textContent).toBe("1000");
    expect(landed).toBe(1);
  });

  test("never takes more than its frame cap, whatever the clock does", () => {
    const f = frames(0);
    const node = { textContent: "" as string | null };
    countUp(node, { to: "1e9000", ms: 1000, format: fmt, reduced: false, ...f });
    const ran = f.run(100_000);
    expect(ran).toBeLessThanOrEqual(countFrameCap(1000));
    expect(node.textContent).toBe(D("1e9000").toString());
  });

  test("waits out its delay before moving", () => {
    const f = frames(10);
    const node = { textContent: "" as string | null };
    countUp(node, { from: 0, to: 100, ms: 100, delay: 50, format: fmt, reduced: false, ...f });
    f.run(5);
    expect(node.textContent).toBe("0");
    f.run();
    expect(node.textContent).toBe("100");
  });

  test("under reduced motion shows the end at once and lands", () => {
    const f = frames();
    const node = { textContent: "" as string | null };
    let landed = false;
    countUp(node, { to: 42, format: fmt, reduced: true, onLand: () => (landed = true), ...f });
    expect(node.textContent).toBe("42");
    expect(landed).toBe(true);
    expect(f.pending()).toBe(0);
  });

  test("cancel stops where it is without landing; finish writes the end and lands", () => {
    const f = frames(16);
    const a = { textContent: "" as string | null };
    let landedA = false;
    const runA = countUp(a, {
      to: 1000,
      ms: 500,
      format: fmt,
      reduced: false,
      onLand: () => (landedA = true),
      ...f,
    });
    f.run(3);
    runA.cancel();
    const at = a.textContent;
    f.run();
    expect(a.textContent).toBe(at);
    expect(landedA).toBe(false);

    const b = { textContent: "" as string | null };
    let landedB = 0;
    const runB = countUp(b, {
      to: 1000,
      ms: 500,
      format: fmt,
      reduced: false,
      onLand: () => landedB++,
      ...f,
    });
    f.run(2);
    runB.finish();
    runB.finish();
    expect(b.textContent).toBe("1000");
    expect(landedB).toBe(1);
  });
});

describe("Count", () => {
  const raf = globalThis.requestAnimationFrame;
  const caf = globalThis.cancelAnimationFrame;
  let f = frames();
  beforeEach(() => {
    f = frames(16);
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      f.frame(cb)) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => f.cancelFrame(id)) as typeof cancelAnimationFrame;
    setReducedMotion("full");
  });
  afterEach(() => {
    globalThis.requestAnimationFrame = raf;
    globalThis.cancelAnimationFrame = caf;
    setReducedMotion("system");
  });

  test("rolls under StrictMode, marks itself while counting, and a new `to` rolls on from where it stands", () => {
    const { container, rerender } = render(
      <StrictMode>
        <Count to={100} ms={160} format={fmt} />
      </StrictMode>,
    );
    const span = container.querySelector("span") as HTMLSpanElement;
    expect(span.hasAttribute("data-counting")).toBe(true);
    act(() => {
      f.run();
    });
    expect(span.textContent).toBe("100");
    expect(span.hasAttribute("data-counting")).toBe(false);

    rerender(
      <StrictMode>
        <Count to={200} ms={160} format={fmt} />
      </StrictMode>,
    );
    expect(span.textContent).toBe("100");
    act(() => {
      f.run();
    });
    expect(span.textContent).toBe("200");
  });

  test("skip lands it at once; unmount stops it", () => {
    const { container, rerender, unmount } = render(<Count to={1000} ms={1000} format={fmt} />);
    const span = container.querySelector("span") as HTMLSpanElement;
    act(() => {
      f.run(2);
    });
    rerender(<Count to={1000} ms={1000} format={fmt} skip />);
    expect(span.textContent).toBe("1000");
    rerender(<Count to={5000} ms={1000} format={fmt} />);
    unmount();
    expect(f.pending()).toBe(0);
  });
});
