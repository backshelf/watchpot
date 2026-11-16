import { describe, expect, test } from "bun:test";
import {
  busOf,
  defineGame,
  type Effect,
  feature,
  fillLoadout,
  type LoadoutItem,
  type LoadoutSet,
  loadout,
  loadoutFeature,
  searchLoadout,
  statTotals,
} from "watchpot/core";
import { freshStore } from "watchpot/test";

const SLOTS = [{ id: "head", kind: "hat" }, { id: "hand", kind: "tool" }, { id: "spare" }] as const;
const ITEMS: readonly LoadoutItem<Effect>[] = [
  { id: "cap", kind: "hat", tags: ["wool"], effects: [{ stat: "speed", add: 1 }] },
  { id: "helm", kind: "hat", tags: ["iron"], effects: [{ stat: "speed", add: 3 }] },
  { id: "mitt", kind: "tool", tags: ["wool"], effects: [{ stat: "speed", mult: 2 }] },
  { id: "scarf", kind: "charm", tags: ["wool"] },
];
const SETS: readonly LoadoutSet<Effect>[] = [
  {
    id: "woollens",
    tag: "wool",
    tiers: [
      { count: 2, effects: [{ stat: "speed", add: 10 }] },
      { count: 3, effects: [{ stat: "speed", add: 50 }] },
    ],
  },
];
const rules = loadout({ id: "kit", slots: SLOTS, items: ITEMS, sets: SETS });
const all = () => true;

describe("loadout rules", () => {
  test("an item goes only where its kind fits and only when held", () => {
    const slotted: Record<string, string | null> = {};
    expect(rules.equip(slotted, "head", "mitt", all)).toBe("wrong-kind");
    expect(rules.equip(slotted, "nose", "cap", all)).toBe("unknown-slot");
    expect(rules.equip(slotted, "head", "crown", all)).toBe("unknown-item");
    expect(rules.equip(slotted, "head", "cap", () => false)).toBe("not-owned");
    expect(slotted).toEqual({});
    expect(rules.equip(slotted, "head", "cap", all)).toBeNull();
    expect(slotted.head).toBe("cap");
  });

  test("an item already slotted moves rather than doubling", () => {
    const slotted: Record<string, string | null> = { head: null, hand: null, spare: "cap" };
    expect(rules.equip(slotted, "head", "cap", all)).toBeNull();
    expect(slotted).toEqual({ head: "cap", hand: null, spare: null });
  });

  test("a set pays its highest reached tier and nothing below it", () => {
    const two = { head: "cap", hand: "mitt", spare: null };
    expect(rules.standings(two)[0]).toMatchObject({ count: 2, tier: 0, next: 3 });
    const three = { ...two, spare: "scarf" };
    expect(rules.standings(three)[0]).toMatchObject({ count: 3, tier: 1, next: null });
    const speed = (s: Record<string, string | null>) => statTotals(busOf(rules.contributions(s)), "speed");
    expect(speed({ head: "helm", hand: null, spare: null })).toEqual({ add: 3, mult: 1 });
    expect(speed(two)).toEqual({ add: 11, mult: 2 });
    expect(speed(three)).toEqual({ add: 51, mult: 2 });
    expect(rules.contributions(three).map((c) => c.source)).toContain("kit:set:woollens");
  });

  test("a repeated id is refused", () => {
    expect(() => loadout({ id: "x", slots: [{ id: "a" }, { id: "a" }], items: [] })).toThrow(/slot "a"/);
  });
});

describe("loadoutFeature", () => {
  const bag = feature({
    key: "bag",
    initial: () => ({ held: ["cap", "mitt"] as string[] }),
  });
  const kit = loadoutFeature({
    key: "kit",
    slots: SLOTS,
    items: ITEMS,
    sets: SETS,
    owns: (s: { bag: { held: string[] } }, item) => s.bag.held.includes(item),
  });
  const game = defineGame({ id: "lo", save: { key: "lo.save", version: 1 }, features: [bag, kit] });

  test("equips what the game says the player holds, and keeps it through a run reset", () => {
    const { store } = freshStore(game);
    expect(store.getState().kit.equip("head", "helm")).toBe("not-owned");
    expect(store.getState().kit.equip("head", "cap")).toBeNull();
    expect(store.getState().kit.equip("hand", "mitt")).toBeNull();
    expect(store.getState().kit.slotted).toEqual({ head: "cap", hand: "mitt", spare: null });
    store.getState().resetRun();
    expect(store.getState().kit.slotted.head).toBe("cap");
    expect(store.getState().kit.clear("head")).toBe(true);
    expect(store.getState().kit.slotted.head).toBeNull();
  });
});

describe("fillLoadout", () => {
  const add = (n: number): Effect[] => [{ stat: "out", add: n }];
  const rules = loadout<Effect>({
    id: "rig",
    slots: [{ id: "a" }, { id: "b" }, { id: "c" }],
    items: [
      { id: "big1", effects: add(4) },
      { id: "big2", effects: add(4) },
      { id: "big3", effects: add(4) },
      { id: "kit1", tags: ["kit"], effects: add(1) },
      { id: "kit2", tags: ["kit"], effects: add(1) },
      { id: "kit3", tags: ["kit"], effects: add(1) },
      { id: "unowned", effects: add(1000) },
    ],
    sets: [{ id: "kit", tag: "kit", tiers: [{ count: 3, effects: add(100) }] }],
  });
  const score = (slotted: Parameters<typeof rules.contributions>[0]) =>
    rules.contributions(slotted).reduce((n, c) => n + (c.effect.add ?? 0), 0);
  const owns = (id: string) => id !== "unowned";

  test("it finds a set that pays only whole, which filling one slot at a time never reaches", () => {
    expect(fillLoadout(rules, { owns, score, depth: 1 })).toEqual({ a: "big1", b: "big2", c: "big3" });
    const best = fillLoadout(rules, { owns, score });
    expect(new Set(Object.values(best))).toEqual(new Set(["kit1", "kit2", "kit3"]));
  });

  test("it keeps to what is owned and to the open slots", () => {
    const best = fillLoadout(rules, { owns, score, slots: ["a", "b"] });
    expect(Object.keys(best)).toEqual(["a", "b"]);
    expect(Object.values(best)).not.toContain("unowned");
    expect(score(best)).toBe(8);
  });

  test("a search stepped a scoring at a time only climbs, and settles where the whole run does", () => {
    const search = searchLoadout(rules, { owns, score });
    const seen: number[] = [];
    let steps = 0;
    while (search.step(1)) {
      seen.push(search.bestScore());
      steps++;
    }
    expect(steps).toBeGreaterThan(10);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] as number);
    expect(search.best()).toEqual(fillLoadout(rules, { owns, score }));
    expect(search.bestScore()).toBe(score(search.best()));
  });
});
