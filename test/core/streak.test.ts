import { describe, expect, test } from "bun:test";
import {
  claimStreak,
  DAY_MS,
  defineGame,
  feature,
  NO_STREAK,
  type StreakState,
  streak,
  streakStatus,
} from "watchpot/core";
import { freshStore } from "watchpot/test";

/** Local time on a calendar day: the test builds instants; the engine only reads the `now` it is handed. */
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m, d, h, min).getTime();

/** Claims on each instant in turn, from a fresh streak. */
const claims = (instants: number[], grace = 0) => {
  let s: StreakState = NO_STREAK;
  const days: (number | null)[] = [];
  for (const now of instants) {
    const step = claimStreak(s, now, { grace });
    days.push(step?.day ?? null);
    if (step) s = step.state;
  }
  return { state: s, days };
};

/** A local day of 23 or 25 hours in 2026, if this zone keeps daylight saving; else a plain day. */
function dstDay(): [number, number, number] {
  for (let t = at(2026, 0, 1, 0); t < at(2027, 0, 1, 0); t += DAY_MS) {
    const d = new Date(t);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    if (end - start !== DAY_MS) return [d.getFullYear(), d.getMonth(), d.getDate()];
  }
  return [2026, 5, 10];
}

describe("the streak kernel", () => {
  test("one claim a day; consecutive days run up, and the best is kept", () => {
    const { state, days } = claims([
      at(2026, 4, 1, 9),
      at(2026, 4, 1, 22),
      at(2026, 4, 2, 0, 5),
      at(2026, 4, 3, 23, 59),
    ]);
    expect(days).toEqual([1, null, 2, 3]);
    expect(state).toMatchObject({ lastDay: "2026-05-03", count: 3, best: 3, total: 3 });
  });

  test("a missed day breaks the run; grace lets it survive", () => {
    const strict = claims([at(2026, 4, 1), at(2026, 4, 2), at(2026, 4, 4)]);
    expect(strict.days).toEqual([1, 2, 1]);
    expect(strict.state.best).toBe(2);
    const lenient = claims([at(2026, 4, 1), at(2026, 4, 2), at(2026, 4, 4)], 1);
    expect(lenient.days).toEqual([1, 2, 3]);
    expect(claims([at(2026, 4, 1), at(2026, 4, 4)], 1).days).toEqual([1, 1]);
  });

  test("the status: claimable, the run still alive, broken, and the wait to midnight", () => {
    const s = claims([at(2026, 4, 1), at(2026, 4, 2)]).state;
    expect(streakStatus(s, at(2026, 4, 2, 18))).toEqual({
      canClaim: false,
      count: 2,
      broken: false,
      missed: 0,
      msUntilNext: 6 * 3600_000,
    });
    expect(streakStatus(s, at(2026, 4, 3))).toMatchObject({ canClaim: true, count: 2, broken: false });
    expect(streakStatus(s, at(2026, 4, 6))).toMatchObject({
      canClaim: true,
      count: 0,
      broken: true,
      missed: 3,
    });
    expect(streakStatus(NO_STREAK, at(2026, 4, 6))).toMatchObject({
      canClaim: true,
      count: 0,
      broken: false,
    });
  });

  test("a clock set back neither claims again nor breaks the run", () => {
    const s = claims([at(2026, 4, 10)]).state;
    expect(streakStatus(s, at(2026, 4, 8))).toMatchObject({ canClaim: false, broken: false, count: 1 });
    expect(claimStreak(s, at(2026, 4, 8))).toBeNull();
  });

  test("a day of 23 or 25 hours is still one day: late one night, early the next, both count", () => {
    const [y, m, d] = dstDay();
    const before = at(y, m, d - 1, 23, 30);
    const day = at(y, m, d, 0, 30);
    const after = at(y, m, d + 1, 23, 30);
    expect(claims([before, day, after]).days).toEqual([1, 2, 3]);
    const late = at(y, m, d, 23, 0);
    const s = claims([late]).state;
    expect(streakStatus(s, late).msUntilNext).toBe(at(y, m, d + 1, 0) - late);
    expect(streakStatus(s, at(y, m, d + 1, 0, 1)).canClaim).toBe(true);
  });

  test("keep saves a run that would break", () => {
    const s = claims([at(2026, 4, 1), at(2026, 4, 2)]).state;
    let asked = -1;
    const kept = claimStreak(s, at(2026, 4, 5), {
      keep: (missed) => {
        asked = missed;
        return true;
      },
    });
    expect(asked).toBe(2);
    expect(kept).toMatchObject({ day: 3, kept: true });
  });
});

describe("streak feature", () => {
  const bank = feature({ key: "bank", initial: () => ({ gems: 10, gold: 0 }) });
  const daily = streak({
    key: "daily",
    rewards: (day) => Math.min(day, 7) * 100,
    onClaim: (d: { bank: { gems: number; gold: number } }, reward) => {
      d.bank.gold += reward;
    },
    keep: (d, missed) => {
      if (d.bank.gems < missed * 5) return false;
      d.bank.gems -= missed * 5;
      return true;
    },
  });
  const game = defineGame({ id: "daily", save: { key: "daily.save", version: 1 }, features: [bank, daily] });

  test("claim pays the day's reward once a day, keeps across a run reset, and can be bought back", () => {
    const { store, clock } = freshStore(game, { at: at(2026, 4, 1, 10) });
    expect(store.getState().daily.claim()).toEqual({ day: 1, reward: 100, kept: false });
    expect(store.getState().daily.claim()).toBeNull();
    clock.set(at(2026, 4, 2, 10));
    expect(store.getState().daily.claim()?.reward).toBe(200);
    store.getState().resetRun();
    expect(store.getState().daily.count).toBe(2);
    expect(daily.select.status(store.getState(), clock.now()).canClaim).toBe(false);

    clock.set(at(2026, 4, 4, 10)); // one day missed: 5 gems to keep the run
    expect(store.getState().daily.claim()).toEqual({ day: 3, reward: 300, kept: true });
    expect(store.getState().bank).toEqual({ gems: 5, gold: 300 }); // the bank started over with the run
  });

  test("def holds the grace and the rewards, draft is empty", () => {
    expect(daily.def.grace).toBe(0);
    expect(daily.def.rewards(3)).toBe(300);
    expect(daily.draft).toEqual({});
  });

  test("`reach` types the callbacks: a reached feature reads, an unreached one does not", () => {
    const reached = streak({
      key: "visits",
      reach: () => [bank],
      grace: 1,
      rewards: (day) => day,
      onClaim: (d, reward) => {
        d.bank.gold += reward + d.visits.count;
      },
    });
    streak({
      key: "bad",
      reach: [bank],
      rewards: (day) => day,
      // @ts-expect-error nothing reached a "moon"
      keep: (d) => d.moon.phase > 0,
    });
    expect(reached.def.grace).toBe(1);
  });
});
