import { describe, expect, test } from "bun:test";
import { D } from "watchpot/core";
import {
  bareSimStore,
  createSimWorld,
  fixedSchedule,
  fmtClock,
  playDays,
  playStraight,
  rngFor,
  shortDecimal,
  simArgs,
} from "watchpot/sim";

function bareWorld() {
  const seen = { ticked: 0, ticks: 0, away: 0 };
  const world = createSimWorld(
    (now) =>
      bareSimStore(now, {
        tick: (dt) => {
          seen.ticked += dt;
          seen.ticks++;
        },
        away: (ms) => {
          seen.away += ms;
        },
      }),
    1_000_000,
  );
  return { world, seen };
}

describe("bareSimStore", () => {
  test("the opening catch-up credits nothing", () => {
    expect(bareWorld().seen.away).toBe(0);
  });

  test("play ticks the rules and away credits the gap once", () => {
    const { world, seen } = bareWorld();
    world.play(5000, 1000);
    expect(seen.ticked).toBe(5000);
    expect(seen.ticks).toBe(5);
    world.away(60_000);
    expect(seen.away).toBe(60_000);
    expect(world.gameNow()).toBe(world.now());
  });

  test("playDays ticks while attended and catches up across the closed tab", () => {
    const { world, seen } = bareWorld();
    playDays({
      world,
      schedule: fixedSchedule(8, 10, 15, 0),
      days: 2,
      start: 0,
      rng: rngFor("sim", "bare"),
      look: () => {},
    });
    expect(seen.ticked).toBeGreaterThan(0);
    expect(seen.away).toBeGreaterThan(0);
  });
});

describe("playStraight", () => {
  test("stops at ms, the last stretch the remainder", () => {
    const { world, seen } = bareWorld();
    const stretches: number[] = [];
    let after = 0;
    playStraight({
      world,
      ms: 25_000,
      lookEveryMs: 10_000,
      look: () => stretches.push(world.now()),
      afterLook: () => after++,
    });
    expect(seen.ticked).toBe(25_000);
    expect(stretches).toEqual([1_000_000, 1_010_000, 1_020_000]);
    expect(after).toBe(3);
  });

  test("stops when until holds", () => {
    const { world, seen } = bareWorld();
    playStraight({
      world,
      ms: 100_000,
      lookEveryMs: 10_000,
      look: () => {},
      until: () => seen.ticked >= 30_000,
    });
    expect(seen.ticked).toBe(30_000);
  });
});

describe("simArgs", () => {
  test("reads flags and values, the last repeat wins, the value keeps later equals", () => {
    const args = simArgs(["--fast", "--seed=7", "--seed=9", "--q=a=b", "plain"]);
    expect(args.get("fast")).toBe("true");
    expect(args.get("seed")).toBe("9");
    expect(args.get("q")).toBe("a=b");
    expect(args.has("plain")).toBe(false);
  });
});

describe("printers", () => {
  test("fmtClock floors minutes and never goes negative", () => {
    expect(fmtClock(0)).toBe("0:00");
    expect(fmtClock(59_999)).toBe("0:00");
    expect(fmtClock(4 * 3_600_000 + 5 * 60_000)).toBe("4:05");
    expect(fmtClock(-5000)).toBe("0:00");
  });

  test("shortDecimal is whole below a million, then an exponent", () => {
    expect(shortDecimal(D(0))).toBe("0");
    expect(shortDecimal(D(-3))).toBe("0");
    expect(shortDecimal(D(999_999.9))).toBe("999999");
    expect(shortDecimal(D("1e12"))).toBe("e12.0");
    expect(shortDecimal(D("2e12"))).toBe("e12.3");
  });
});
