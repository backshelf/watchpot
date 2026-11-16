import { describe, expect, test } from "bun:test";
import { currencies, D, defineGame, feature, type Move, type StepContext, vocab } from "watchpot/core";
import { autoPlayer, createSimWorld, fixedSchedule, playDays, rngFor, simStore } from "watchpot/sim";
import { freshStore, T0 } from "watchpot/test";

const WORDS = vocab({ currencies: ["gold", "gems"], stats: [], rarities: ["common"] } as const);
const wallet = currencies({ key: "wallet", vocab: WORDS, start: { gold: 10 } });
/** One good for 10 gold, bought once. */
const shop = feature({
  key: "shop",
  initial: () => ({ bought: false }),
  moves: (s: { shop: { bought: boolean } }) =>
    s.shop.bought
      ? []
      : [
          {
            id: "good",
            cost: { currency: "gold", amount: D(10) },
            value: () => 1,
            apply: (store) => {
              (store as { setState(f: (s: object) => object): void }).setState((x) => ({
                ...x,
                shop: { bought: true },
              }));
              return true;
            },
          } satisfies Move<typeof s>,
        ],
});

describe("autoPlayer's default balance", () => {
  test("reads the game's one currencies feature", () => {
    const game = defineGame({
      id: "one",
      save: { key: "one", version: 1 },
      vocab: WORDS,
      features: [wallet, shop],
    });
    const covered = autoPlayer(game);
    const { store } = freshStore(game);
    expect(covered.look(store).bought).toBe(1);
  });

  test("throws with no currencies feature, unless balance is given", () => {
    const game = defineGame({ id: "none", save: { key: "none", version: 1 }, features: [shop] });
    expect(() => autoPlayer(game)).toThrow(/balance/);
    expect(() => autoPlayer(game, { balance: () => D(0) })).not.toThrow();
  });

  test("throws with two currencies features", () => {
    const purse = currencies({ key: "purse", vocab: WORDS, start: { gems: 1 } });
    const game = defineGame({
      id: "two",
      save: { key: "two", version: 1 },
      vocab: WORDS,
      features: [wallet, purse, shop],
    });
    expect(() => autoPlayer(game)).toThrow(/balance/);
  });
});

describe("playDays stops", () => {
  const game = defineGame({ id: "p", save: { key: "p", version: 1 }, vocab: WORDS, features: [wallet] });
  const run = (stop: { until?: () => boolean; hours?: number }) => {
    const world = createSimWorld((now) => simStore(game, now), T0);
    let looks = 0;
    playDays({
      world,
      schedule: fixedSchedule(8, 10, 15, 0),
      days: 5,
      start: T0,
      rng: rngFor("sim", "stop"),
      look: () => looks++,
      ...stop,
    });
    return { looks, at: world.now() };
  };

  test("at the look until() turns true", () => {
    let n = 0;
    expect(run({ until: () => ++n >= 3 }).looks).toBe(3);
  });

  test("once hours have passed, and not before", () => {
    const full = run({});
    const cut = run({ hours: 30 });
    expect(cut.looks).toBeLessThan(full.looks);
    expect(cut.looks).toBeGreaterThan(0);
    expect(cut.at).toBeGreaterThanOrEqual(T0 + 30 * 3_600_000);
  });
});

describe("freshStore's play", () => {
  test("moves the clock and ticks the store over it, at the new now", () => {
    type Seen = { seen: { dtMs: number; at: number } };
    const watch = feature({
      key: "seen",
      initial: () => ({ dtMs: 0, at: 0 }),
      steps: {
        produce: {
          note: {
            pass: "tick",
            run: (d: Seen, ctx: StepContext) => {
              d.seen.dtMs += ctx.dtMs;
              d.seen.at = ctx.now;
            },
          },
        },
      },
    });
    const game = defineGame({
      id: "t",
      save: { key: "t", version: 1 },
      vocab: WORDS,
      features: [wallet, watch],
    });
    const fresh = freshStore(game);
    const before = fresh.clock.now();
    fresh.play(60_000);
    expect(fresh.clock.now()).toBe(before + 60_000);
    const seen = (fresh.store.getState() as unknown as Seen).seen;
    expect(seen.dtMs).toBe(60_000);
    expect(seen.at).toBeGreaterThanOrEqual(before + 60_000);
  });
});
