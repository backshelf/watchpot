import { describe, expect, test } from "bun:test";
import {
  challengeRule,
  challenges,
  currencies,
  type Decimal,
  defineGame,
  type Effect,
  feature,
  vocab,
} from "watchpot/core";
import { freshStore, T0 } from "watchpot/test";
import { totals } from "./fold";

const WORDS = vocab({ currencies: ["gold"], stats: [], rarities: ["common"] } as const);
const wallet = currencies({ key: "wallet", vocab: WORDS, start: { gold: 10 } });
const log = feature({
  key: "log",
  initial: () => ({ completed: [] as string[] }),
  reset: "never",
});
type State = {
  wallet: { gold: Decimal };
  trials: { completions: Record<string, number> };
  log: { completed: string[] };
};
const trials = challenges({
  key: "trials",
  list: [
    {
      id: "frugal",
      goal: (s: State) => s.wallet.gold.gte(100),
      maxCompletions: 2,
      effects: (n): Effect[] => [{ stat: "speed", mul: 1 + n }],
      rules: ["noUpgrades"],
    },
    {
      id: "late",
      unlocked: (s) => (s.trials.completions.frugal ?? 0) > 0,
      goal: (s) => s.wallet.gold.gte(1000),
    },
  ],
  onComplete: (d, id) => {
    d.log.completed.push(id);
  },
});
const game = defineGame({
  id: "trials",
  save: { key: "trials.save", version: 1 },
  features: [wallet, log, trials],
  vocab: WORDS,
});

describe("challenges", () => {
  test("entering resets the other features and switches the rule flags on", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit("gold", 40);
    expect(challengeRule(store.getState().trials, "noUpgrades")).toBe(false);
    expect(store.getState().trials.enter("frugal")).toBeNull();
    expect(store.getState().wallet.gold.toNumber()).toBe(10);
    expect(store.getState().trials.active).toBe("frugal");
    expect(challengeRule(store.getState().trials, "noUpgrades")).toBe(true);
    expect(challengeRule(store.getState().trials, "other")).toBe(false);
    expect(store.getState().trials.enter("frugal")).toBe("busy");
  });

  test("the goal completes it once per completion, up to the max, and rewards each", () => {
    const { store } = freshStore(game);
    const speed = () => totals(trials.rules.contributions(store.getState().trials), "speed");
    const finish = (at: number) => {
      store.getState().wallet.credit("gold", 200);
      store.getState().tick(100, at);
    };
    store.getState().trials.enter("frugal");
    finish(T0 + 100);
    expect(store.getState().trials.completions.frugal).toBe(1);
    expect(store.getState().trials.active).toBeNull();
    expect(challengeRule(store.getState().trials, "noUpgrades")).toBe(false);
    expect(store.getState().wallet.gold.toNumber()).toBe(10); // the run reset again
    expect(store.getState().log.completed).toEqual(["frugal"]);
    expect(speed().mult).toBe(2);
    expect(trials.rules.contributions(store.getState().trials)[0]?.source).toBe("trials:frugal");

    finish(T0 + 200); // outside a challenge the goal pays nothing
    expect(store.getState().trials.completions.frugal).toBe(1);
    store.getState().trials.enter("frugal");
    finish(T0 + 300);
    expect(store.getState().trials.completions.frugal).toBe(2);
    expect(speed().mult).toBe(3);
    expect(store.getState().trials.enter("frugal")).toBe("maxed");
  });

  test("the best time only improves", () => {
    const { store, clock } = freshStore(game);
    const run = (ms: number) => {
      store.getState().trials.enter("frugal");
      clock.advance(ms);
      store.getState().wallet.credit("gold", 200);
      store.getState().tick(100);
    };
    run(5000);
    expect(store.getState().trials.bestMs.frugal).toBe(5000);
    run(9000);
    expect(store.getState().trials.bestMs.frugal).toBe(5000);
  });

  test("exiting resets the run and pays nothing", () => {
    const { store } = freshStore(game);
    expect(store.getState().trials.exit()).toBe(false);
    store.getState().trials.enter("frugal");
    store.getState().wallet.credit("gold", 50);
    expect(store.getState().trials.exit()).toBe(true);
    expect(store.getState().wallet.gold.toNumber()).toBe(10);
    expect(store.getState().trials.completions).toEqual({});
    expect(store.getState().trials.active).toBeNull();
    expect(challengeRule(store.getState().trials, "noUpgrades")).toBe(false);
  });

  test("a locked or unknown challenge refuses; the record survives a run reset and a save", () => {
    const { store } = freshStore(game);
    expect(store.getState().trials.enter("late")).toBe("locked");
    expect(store.getState().trials.enter("nothing")).toBe("unknown");
    store.getState().trials.enter("frugal");
    store.getState().wallet.credit("gold", 200);
    store.getState().tick(100, T0 + 100);
    const saved = store.getState().exportProfile();
    store.getState().resetRun();
    expect(store.getState().trials.completions.frugal).toBe(1);
    store.getState().resetProfile();
    expect(store.getState().trials.completions).toEqual({});
    store.getState().importProfile(saved);
    expect(store.getState().trials.completions.frugal).toBe(1);
    expect(store.getState().trials.enter("late")).toBeNull();
  });

  test("two stores of one game keep their own runs", () => {
    const a = freshStore(game).store;
    const b = freshStore(game).store;
    a.getState().trials.enter("frugal");
    b.getState().wallet.credit("gold", 500);
    a.getState().wallet.credit("gold", 200);
    a.getState().tick(100, T0 + 100);
    b.getState().tick(100, T0 + 100);
    expect(a.getState().trials.completions.frugal).toBe(1);
    expect(b.getState().wallet.gold.toNumber()).toBeGreaterThan(500);
  });
});
