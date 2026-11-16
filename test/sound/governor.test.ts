import { describe, expect, test } from "bun:test";
import { type Admission, createGovernor, type Governor, ROLL_FALL_MS } from "../../src/sound/governor";
import type { Cue } from "../../src/sound/types";

const kick: Cue = { voices: [] };

/** Plays `key` at each of `times`, collecting the admissions. */
function run(g: Governor, key: string, cue: Cue, times: readonly number[], seconds = 0.2, options = {}) {
  return times.map((t) => g.admit(key, cue, options, t, seconds));
}

const every = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

const plays = (list: readonly Admission[]) => list.filter((a) => a.action === "play");

describe("rolls", () => {
  const rattle: Cue = { voices: [], roll: { above: 20 } };

  test("100 plays in a second give under 25 voice starts and one roll that ends within 400 ms of the last", () => {
    const g = createGovernor({ voices: 64 });
    const times = every(0, 990, 10);
    let starts = 0;
    let rollsBegun = 0;
    let rolling = false;
    for (const t of times) {
      const a = g.admit("rattle", rattle, {}, t, 0.2);
      if (a.action === "play") starts++;
      if (a.action === "roll" && !rolling) {
        rolling = true;
        rollsBegun++;
        starts++; // the engine starts the roll's one voice
      }
    }
    expect(starts).toBeLessThan(25);
    expect(rollsBegun).toBe(1);
    // The engine polls every 50 ms.
    let endedAt = -1;
    let reports = 0;
    for (let t = 1000; t <= 2500; t += 50) {
      for (const roll of g.rolls(t)) {
        expect(roll.key).toBe("rattle");
        if (roll.ended) {
          reports++;
          if (endedAt < 0) endedAt = t;
        }
      }
    }
    expect(reports).toBe(1);
    expect(endedAt - 990).toBeGreaterThanOrEqual(ROLL_FALL_MS);
    expect(endedAt - 990).toBeLessThanOrEqual(400);
    // Then the cue plays singly again.
    expect(g.admit("rattle", rattle, {}, 3000, 0.2).action).toBe("play");
  });

  test("a roll's voice follows the rate: louder and higher as it climbs, back as it eases", () => {
    const g = createGovernor({ voices: 64 });
    run(g, "rattle", rattle, every(0, 300, 10)); // ~30 a second: rolling
    const steady = g.rolls(300)[0];
    run(g, "rattle", rattle, every(302, 1300, 2)); // much faster
    const fast = g.rolls(1300)[0];
    expect(steady?.ended).toBe(false);
    expect(fast?.ended).toBe(false);
    expect(fast?.db ?? 0).toBeGreaterThan(steady?.db ?? 0);
    expect(fast?.rate ?? 0).toBeGreaterThan(steady?.rate ?? 0);
    for (const r of [steady, fast]) {
      expect(r?.rate ?? 0).toBeGreaterThan(0.5);
      expect(r?.rate ?? 0).toBeLessThan(2);
      expect(Math.abs(r?.db ?? 99)).toBeLessThanOrEqual(12);
    }
  });

  test("a roll keeps going while the rate holds, and a cue with no roll never rolls", () => {
    const g = createGovernor({ voices: 64 });
    // 40 a second for three seconds, polled as the engine polls.
    for (const t of every(0, 3000, 25)) {
      g.admit("rattle", rattle, {}, t, 0.2);
      if (t % 50 === 0) expect(g.rolls(t).every((r) => !r.ended)).toBe(true);
    }
    expect(g.rolls(3000)).toHaveLength(1);
    const flat = run(g, "kick", kick, every(0, 990, 10));
    expect(flat.some((a) => a.action === "roll")).toBe(false);
  });
});

describe("cooldowns and repetition", () => {
  test("a cue inside its cooldown is skipped, and plays again after it", () => {
    const g = createGovernor({ voices: 64 });
    const cue: Cue = { voices: [], cooldownMs: 100 };
    expect(run(g, "hat", cue, [0, 50, 99, 100, 150, 250]).map((a) => a.action)).toEqual([
      "play",
      "skip",
      "skip",
      "play",
      "skip",
      "play",
    ]);
  });

  test("each repeat inside 4 seconds is 1.5 dB lower to a floor of -9 dB, with a wider vary", () => {
    const g = createGovernor({ voices: 64 });
    const out = plays(run(g, "kick", kick, every(0, 1000, 100))) as { db: number; vary: number }[];
    expect(out[0]).toEqual({ action: "play", db: 0, vary: 1 } as never);
    expect(out[1]?.db).toBeCloseTo(-1.5, 9);
    expect(out[2]?.db).toBeCloseTo(-3, 9);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]?.db ?? 0).toBeLessThanOrEqual(out[i - 1]?.db ?? 0);
      expect(out[i]?.vary ?? 0).toBeGreaterThanOrEqual(out[i - 1]?.vary ?? 0);
    }
    expect(out.at(-1)?.db).toBeCloseTo(-9, 9);
    expect(out.at(-1)?.vary).toBeCloseTo(2, 9);
  });

  test("a play counts in full for 2 seconds, then fades out of the count over 2 more", () => {
    const g = createGovernor({ voices: 64 });
    run(g, "kick", kick, every(0, 1000, 100));
    const mid = g.admit("kick", kick, {}, 4000, 0.2) as { db: number };
    expect(mid.db).toBeLessThan(0);
    expect(mid.db).toBeGreaterThan(-9);
    const later = createGovernor({ voices: 64 });
    run(later, "kick", kick, every(0, 1000, 100));
    expect(later.admit("kick", kick, {}, 5001, 0.2)).toEqual({ action: "play", db: 0, vary: 1 });
  });

  test("repetition is per cue", () => {
    const g = createGovernor({ voices: 64 });
    run(g, "kick", kick, every(0, 500, 50));
    expect(g.admit("hat", kick, {}, 510, 0.2)).toEqual({ action: "play", db: 0, vary: 1 });
  });
});

describe("the loudness window", () => {
  const loud: Cue = { voices: [], loudness: 80 };
  const quiet: Cue = { voices: [], loudness: 30 };

  test("a quiet cue is skipped under a loud one and admitted two seconds after it ends", () => {
    const g = createGovernor({ voices: 64 });
    expect(g.admit("boom", loud, {}, 0, 1).action).toBe("play");
    expect(g.admit("tick", quiet, {}, 500, 0.1).action).toBe("skip");
    expect(g.admit("tick", quiet, {}, 999, 0.1).action).toBe("skip");
    expect(g.admit("tick", quiet, {}, 3000, 0.1).action).toBe("play");
  });

  test("a cue within the window plays beside the loud one", () => {
    const g = createGovernor({ voices: 64 });
    g.admit("boom", loud, {}, 0, 1);
    expect(g.admit("blip", { voices: [], loudness: 45 }, {}, 100, 0.1).action).toBe("play");
  });

  test("the window is a choice", () => {
    const g = createGovernor({ voices: 64, window: 60 });
    g.admit("boom", loud, {}, 0, 1);
    expect(g.admit("tick", quiet, {}, 100, 0.1).action).toBe("play");
  });

  test("a full pool skips what is quieter than everything sounding", () => {
    const g = createGovernor({ voices: 4 });
    for (let i = 0; i < 4; i++) g.admit(`pad${i}`, { voices: [], loudness: 60 }, {}, i, 5);
    expect(g.admit("blip", { voices: [], loudness: 50 }, {}, 10, 0.1).action).toBe("skip");
    expect(g.admit("chord", { voices: [], loudness: 60 }, {}, 10, 0.1).action).toBe("play");
  });
});

describe("mine", () => {
  test("a mine play is admitted in every case, and lowered by repetition 3 dB at most", () => {
    const g = createGovernor({ voices: 2 });
    const mine = { mine: true };
    // Under a loud voice, in a full pool.
    g.admit("boom", { voices: [], loudness: 90 }, {}, 0, 10);
    g.admit("boom2", { voices: [], loudness: 90 }, {}, 0, 10);
    const quiet: Cue = { voices: [], loudness: 10, cooldownMs: 1000, roll: { above: 5 } };
    const out = run(g, "tap", quiet, every(10, 1000, 10), 0.1, mine);
    expect(out.every((a) => a.action === "play")).toBe(true);
    for (const a of out) if (a.action === "play") expect(a.db).toBeGreaterThanOrEqual(-3);
    expect(g.rolls(1000)).toEqual([]);
  });

  test("a mine play during a roll still sounds on its own", () => {
    const g = createGovernor({ voices: 64 });
    const cue: Cue = { voices: [], roll: { above: 10 } };
    const out = run(g, "rattle", cue, every(0, 500, 20));
    expect(out.at(-1)?.action).toBe("roll");
    expect(g.admit("rattle", cue, { mine: true }, 510, 0.1).action).toBe("play");
  });
});

describe("the clock", () => {
  test("a clock that runs backwards starts afresh", () => {
    const g = createGovernor({ voices: 64 });
    const cue: Cue = { voices: [], cooldownMs: 10_000 };
    expect(g.admit("hat", cue, {}, 5000, 0.1).action).toBe("play");
    expect(g.admit("hat", cue, {}, 5100, 0.1).action).toBe("skip");
    expect(g.admit("hat", cue, {}, 0, 0.1).action).toBe("play");
  });
});
