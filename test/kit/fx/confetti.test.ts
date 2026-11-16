import { describe, expect, mock, test } from "bun:test";
import confetti from "canvas-confetti";
import { burst, type ConfettiColors, cents, centsShots, confettiShots } from "../../../src/kit/fx/confetti";
import { setReducedMotion } from "../../../src/kit/fx/motion";
import { tierOf } from "../../../src/kit/fx/rarity";

const colors: ConfettiColors = {
  paper: "#paper",
  hue: "#hue",
  muted: "#muted",
  foil: ["#f1", "#f2", "#f3", "#f4", "#f5"],
};
const none: ConfettiColors = { paper: "", hue: "", muted: "", foil: [] };

const FIVE = ["a", "b", "c", "d", "e"];
const rung = (ladder: string[], i: number) => tierOf(ladder, ladder[i] ?? "");
const particles = (shots: ReturnType<typeof confettiShots>) =>
  shots.reduce((n, s) => n + (s.options.particleCount ?? 0), 0);

describe("confetti presets", () => {
  test("the burst grows with every rung, and the lowest fires nothing", () => {
    const counts = FIVE.map((_, i) => particles(confettiShots(rung(FIVE, i), colors)));
    expect(counts[0]).toBe(0);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1] ?? 0);
  });

  test("a shorter ladder still runs from nothing to the storm", () => {
    const three = ["low", "mid", "top"];
    expect(confettiShots(rung(three, 0), colors)).toEqual([]);
    expect(confettiShots(rung(three, 1), colors)).toEqual(confettiShots(rung(FIVE, 2), colors));
    expect(confettiShots(rung(three, 2), colors)).toEqual(confettiShots(rung(FIVE, 4), colors));
  });

  test("no preset fires when its tokens are missing (no hard-coded fallback colour)", () => {
    for (let i = 1; i < FIVE.length; i++) expect(confettiShots(rung(FIVE, i), none)).toEqual([]);
    expect(centsShots(none)).toEqual([]);
  });

  test("a custom origin is used for bursts", () => {
    const [shot] = confettiShots(rung(FIVE, 2), colors, { x: 0.2, y: 0.3 });
    expect(shot?.options.origin).toEqual({ x: 0.2, y: 0.3 });
  });
});

describe("firing", () => {
  test("nothing fires while the in-game setting reduces motion, with the OS at full motion", () => {
    // A burst on its own canvas first creates the canvas's confetti instance; count those creations.
    const real = confetti.create;
    const create = mock(() => (() => null) as unknown as ReturnType<typeof confetti.create>);
    confetti.create = create as unknown as typeof confetti.create;
    try {
      setReducedMotion("reduced");
      burst(rung(FIVE, 4), { canvas: document.createElement("canvas") });
      cents({ canvas: document.createElement("canvas") });
      expect(create).not.toHaveBeenCalled();
      setReducedMotion("system");
      cents({ canvas: document.createElement("canvas") });
      expect(create).toHaveBeenCalledTimes(1);
    } finally {
      setReducedMotion("system");
      confetti.create = real;
    }
  });
});
