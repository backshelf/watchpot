import { describe, expect, test } from "bun:test";
import {
  type BuffRule,
  type BuffsState,
  buffActive,
  buffLeftMs,
  buffStacks,
  buffs,
  busOf,
  defineGame,
  type Effect,
  endBuff,
  expireBuffs,
  feature,
  overlapMs,
  startBuff,
  statTotals,
} from "watchpot/core";
import { freshStore, T0 } from "watchpot/test";

const NONE: BuffsState = { active: {}, ended: {} };
const rule = (stack: BuffRule["stack"], maxStacks?: number): BuffRule => ({
  id: "rush",
  durationMs: 10_000,
  stack,
  maxStacks,
});

describe("the buff kernel", () => {
  test("a start runs for the duration, then expires into ended", () => {
    const s = startBuff(NONE, rule("refresh"), 1000);
    expect(buffActive(s, "rush", 5000)).toBe(true);
    expect(buffLeftMs(s, "rush", 5000)).toBe(6000);
    expect(buffActive(s, "rush", 11_000)).toBe(false);
    const done = expireBuffs(s, 11_000);
    expect(done.ended).toEqual(["rush"]);
    expect(done.state).toEqual({ active: {}, ended: { rush: { since: 1000, until: 11_000 } } });
    expect(expireBuffs(s, 10_999).ended).toEqual([]);
  });

  test("the four stacking rules", () => {
    const at = (stack: BuffRule["stack"], max?: number) => {
      let s = startBuff(NONE, rule(stack, max), 0);
      s = startBuff(s, rule(stack, max), 4000);
      s = startBuff(s, rule(stack, max), 6000);
      return s.active.rush;
    };
    expect(at("refresh")).toMatchObject({ until: 16_000, stacks: 1 });
    expect(at("extend")).toMatchObject({ until: 30_000, stacks: 1 });
    expect(at("stack", 2)).toMatchObject({ until: 16_000, stacks: 2 });
    expect(at("ignore")).toMatchObject({ until: 10_000, stacks: 1 });
    const same = startBuff(NONE, rule("ignore"), 0);
    expect(startBuff(same, rule("ignore"), 1)).toBe(same);
  });

  test("a stopped buff starts fresh whatever its rule", () => {
    const s = startBuff(startBuff(NONE, rule("extend"), 0), rule("extend"), 20_000);
    expect(s.active.rush).toMatchObject({ since: 20_000, until: 30_000, stacks: 1 });
  });

  test("overlapMs measures the stretch it covered; end cuts it short", () => {
    const s = startBuff(NONE, rule("refresh"), 0, { durationMs: 5000, strength: 3 });
    expect(overlapMs(s, "rush", 0, 60_000)).toBe(5000);
    expect(overlapMs(s, "rush", 4000, 60_000)).toBe(1000);
    expect(overlapMs(s, "rush", 6000, 60_000)).toBe(0);
    expect(overlapMs(expireBuffs(s, 60_000).state, "rush", 0, 60_000)).toBe(5000);
    const cut = endBuff(s, "rush", 2000);
    expect(overlapMs(cut, "rush", 0, 60_000)).toBe(2000);
    expect(buffStacks(cut, "rush", 1000)).toBe(0);
    expect(s.active.rush?.strength).toBe(3);
  });
});

const boosts = buffs<"boosts", Effect>({
  key: "boosts",
  list: [
    { id: "rush", durationMs: 77_000, stack: "refresh", effects: () => [{ stat: "speed", mult: 7 }] },
    {
      id: "pile",
      durationMs: 10_000,
      stack: "stack",
      maxStacks: 3,
      effects: (stacks, strength) => [{ stat: "speed", add: stacks * (strength ?? 1) }],
    },
  ],
});

/** Income of 1 a second, 7 while the rush runs: exact over a tick and over an absence. */
const mine = feature({
  key: "mine",
  reach: [boosts],
  initial: () => ({ gold: 0 }),
  steps: {
    produce: {
      income: (d, ctx) => {
        const from = ctx.now - ctx.dtMs;
        d.mine.gold += ctx.dtMs / 1000 + (6 * overlapMs(d.boosts, "rush", from, ctx.now)) / 1000;
      },
    },
  },
});
const game = defineGame({
  id: "boosted",
  save: { key: "boosted.save", version: 1 },
  features: [boosts, mine],
});

describe("buffs feature", () => {
  test("a buff runs out during an absence, and income pays the buffed rate for the part it covered", () => {
    const { store } = freshStore(game);
    expect(store.getState().boosts.start("rush")).toBe(true);
    store.getState().catchUp(T0 + 600_000);
    expect(store.getState().boosts.active).toEqual({});
    expect(store.getState().boosts.ended.rush).toEqual({ since: T0, until: T0 + 77_000 });
    expect(store.getState().mine.gold).toBeCloseTo(600 + 6 * 77);
  });

  test("contributions feed the stat bus while running", () => {
    const { store, clock } = freshStore(game);
    store.getState().boosts.start("pile", { strength: 2 });
    store.getState().boosts.start("pile");
    const now = clock.now();
    expect(statTotals(busOf(boosts.contributions(store.getState().boosts, now)), "speed").add).toBe(4);
    expect(boosts.contributions(store.getState().boosts, now + 10_000)).toEqual([]);
    expect(boosts.contributions(store.getState().boosts, now)[0]?.source).toBe("boosts:pile");
  });

  test("start and end over a draft, for a handler already inside a recipe", () => {
    const draft = { boosts: { active: {}, ended: {} } as BuffsState };
    expect(boosts.start(draft, "nothing", T0)).toBe(false);
    expect(boosts.start(draft, "rush", T0)).toBe(true);
    expect(buffActive(draft.boosts, "rush", T0 + 1000)).toBe(true);
    expect(boosts.end(draft, "rush", T0 + 2000)).toBe(true);
    expect(boosts.end(draft, "rush", T0 + 2000)).toBe(false);
    expect(draft.boosts.ended.rush).toEqual({ since: T0, until: T0 + 2000 });
  });

  test("end stops one now; an unknown id is refused; a run reset ends them all", () => {
    const { store } = freshStore(game);
    expect(store.getState().boosts.start("nothing")).toBe(false);
    store.getState().boosts.start("rush");
    store.getState().boosts.start("pile");
    expect(store.getState().boosts.end("rush")).toBe(true);
    expect(store.getState().boosts.end("rush")).toBe(false);
    store.getState().resetRun();
    expect(store.getState().boosts).toMatchObject({ active: {}, ended: {} });
  });
});
