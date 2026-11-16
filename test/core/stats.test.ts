import { describe, expect, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  type Decimal,
  defineGame,
  type Effect,
  feature,
  reach,
  stats,
  vocab,
} from "watchpot/core";

const WORDS = vocab({ currencies: ["bubbles"], stats: ["heat", "draw", "reach"] });
const save = { key: "stats.save", version: 1 } as const;
const at = () => ({ now: () => 1000, storage: createGameStorage(createMemoryBackend()) });

const COPPER: Effect<"heat"> = { stat: "heat", mul: 2 };

const stove = feature({
  key: "stove",
  initial: () => ({ burners: 0, copper: 0, lid: false, muted: false }),
  actions: (api) => ({
    set: (next: Partial<{ burners: number; copper: number; lid: boolean; muted: boolean }>) =>
      api.set((s) => {
        Object.assign(s.stove, next);
      }),
  }),
});

const numbers = stats({
  key: "numbers",
  vocab: WORDS,
  reach: () => [stove],
  stats: {
    heat: { base: 1 },
    draw: { base: 0, hardcap: 10 },
    reach: { base: 1, softcap: { start: 100, power: 0.5, label: "thin air" } },
  },
  flags: ["sealed"],
  sources: [
    { label: "Burners", owner: "stove", effects: [{ stat: "draw", add: (q) => q.stove.burners }] },
    {
      label: "Lid",
      owner: "stove",
      group: "lid",
      active: (q) => q.stove.lid,
      effects: [{ stat: "heat", mul: 3 }],
      flags: ["sealed"],
    },
    // One stat read by another: reach follows heat.
    { label: "Heat carries", owner: "stove", effects: [{ stat: "reach", mul: (q) => q.numbers.heat }] },
  ],
  contributions: (s) =>
    Array.from({ length: s.stove.copper }, () => ({ source: "kitchen:copper", effect: COPPER })),
  label: (source) => (source === "kitchen:copper" ? "Copper base" : source),
  muted: (s, group) => (group === "lid" && s.stove.muted ? "the lid is off for this run" : false),
});

const game = defineGame({ id: "stats", save, vocab: WORDS, features: [stove, numbers] });
const num = (d: Decimal) => d.toNumber();

describe("the stats feature", () => {
  test("serves every stat under its id, from its declared base", () => {
    const s = createIdleStore(game, at()).getState();
    expect(num(s.numbers.heat)).toBe(1);
    expect(num(s.numbers.draw)).toBe(0);
    expect(s.numbers.flags.sealed).toBe(false);
  });

  test("follows the state, an add before a mul, capped", () => {
    const store = createIdleStore(game, at());
    store.getState().stove.set({ burners: 4, lid: true });
    expect(num(store.getState().numbers.draw)).toBe(4);
    expect(num(store.getState().numbers.heat)).toBe(3);
    expect(store.getState().numbers.flags.sealed).toBe(true);
    store.getState().stove.set({ burners: 40 });
    expect(num(store.getState().numbers.draw)).toBe(10);
    expect(numbers.select.explain(store.getState(), "draw").hardcapped).toBe(true);
  });

  test("a stat that reads another follows it", () => {
    const store = createIdleStore(game, at());
    store.getState().stove.set({ lid: true });
    expect(num(store.getState().numbers.reach)).toBe(3);
    store.getState().stove.set({ copper: 6 });
    // heat is 3 x 2^6 = 192, past the softcap's start: sqrt(192) x sqrt(100).
    expect(num(store.getState().numbers.reach)).toBeCloseTo(Math.sqrt(192) * 10, 6);
    expect(numbers.select.explain(store.getState(), "reach").softcapped).toBe("thin air");
  });

  test("ranks held are one row of the breakdown, counted that many times", () => {
    const store = createIdleStore(game, at());
    store.getState().stove.set({ copper: 3 });
    expect(num(store.getState().numbers.heat)).toBe(8);
    const parts = numbers.select.parts(store.getState(), "heat");
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      label: "Copper base",
      owner: "kitchen",
      op: "mul",
      times: 3,
      muted: null,
    });
    expect(num(parts[0]?.value as Decimal)).toBe(8);
  });

  test("a muted group stops counting and stays in the breakdown, with the reason", () => {
    const store = createIdleStore(game, at());
    store.getState().stove.set({ lid: true, muted: true });
    expect(num(store.getState().numbers.heat)).toBe(1);
    // Its flag stays raised: a mute takes effects, never flags.
    expect(store.getState().numbers.flags.sealed).toBe(true);
    const [lid] = numbers.select.parts(store.getState(), "heat");
    expect(lid).toMatchObject({ label: "Lid", muted: "the lid is off for this run" });
    expect(num(lid?.value as Decimal)).toBe(3);
  });

  test("nothing of it is saved", () => {
    const store = createIdleStore(game, at());
    store.getState().stove.set({ burners: 2 });
    const json = store.getState().exportProfile();
    expect(json).not.toContain("heat");
  });

  test("a step reads a stat like any field", () => {
    const pot = feature({
      key: "pot",
      reach: () => [numbers],
      initial: () => ({ bubbles: 0 }),
      steps: {
        produce: {
          simmer: {
            pass: "tick",
            run: (s, ctx) => {
              s.pot.bubbles += (s.numbers.draw.toNumber() * ctx.dtMs) / 1000;
            },
          },
        },
      },
    });
    const store = createIdleStore(
      defineGame({ id: "pot", save, vocab: WORDS, features: [stove, numbers, pot] }),
      at(),
    );
    store.getState().stove.set({ burners: 5 });
    store.getState().tick(2000, 3000);
    expect(store.getState().pot.bubbles).toBe(10);
  });

  test("two stats that read each other are refused", () => {
    const loop = stats({
      key: "loop",
      vocab: WORDS,
      stats: { heat: { base: 1 }, draw: { base: 1 }, reach: { base: 1 } },
      sources: [
        { label: "a", owner: "x", effects: [{ stat: "heat", mul: (q) => q.loop.draw }] },
        { label: "b", owner: "x", effects: [{ stat: "draw", mul: (q) => q.loop.heat }] },
      ],
    });
    expect(() =>
      createIdleStore(defineGame({ id: "loop", save, vocab: WORDS, features: [loop] }), at()),
    ).toThrow(/loop/);
  });

  test("a stat cannot take a reserved name", () => {
    const words = vocab({ currencies: ["x"], stats: ["flags"] });
    expect(() => stats({ key: "s", vocab: words, stats: { flags: { base: 1 } } })).toThrow("reserved");
  });

  test("a feature reached by type may feed the stats that it reads", () => {
    // The pan reads the stats; the stats read the pan by its state type.
    const pan = feature({
      key: "pan",
      reach: () => [far],
      initial: () => ({ size: 2 }),
      derived: { boil: (s) => s.far.heat.toNumber() * s.pan.size },
    });
    const far = stats({
      key: "far",
      vocab: WORDS,
      reach: reach<{ pan: { size: number } }>(),
      stats: { heat: { base: 1 }, draw: { base: 0 }, reach: { base: 1 } },
      sources: [{ label: "Pan", owner: "pan", effects: [{ stat: "heat", add: (q) => q.pan.size }] }],
    });
    const store = createIdleStore(defineGame({ id: "far", save, vocab: WORDS, features: [pan, far] }), at());
    expect(store.getState().pan.boil).toBe(6);
  });
});
