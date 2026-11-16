import { describe, expect, test } from "bun:test";
import {
  catalogueRoll,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineFeature,
  defineGacha,
  defineGame,
  drawMany,
  drawRarity,
  freshPity,
  ladder,
  type OddsTable,
  type PityRule,
  type PityState,
  type PityTrigger,
  publishedOdds,
  pullsUntilPity,
  seedRng,
  softPityExtra,
  vocab,
} from "watchpot/core";
import { T0 } from "./toy";

/** A ladder of the test's own, with names no game uses, so nothing here leans on one game's words. */
const STONES = ladder(["pebble", "quartz", "opal", "ruby", "star"] as const);
type Stone = (typeof STONES.ids)[number];

/** The bottom carries the draw; the top three are rare, so the floors do the work. */
const ODDS: OddsTable<Stone> = { pebble: 1000, quartz: 0, opal: 1, ruby: 1, star: 1 };
const RULE: PityRule<Stone> = [
  { rarity: "opal", within: 6 },
  { rarity: "ruby", within: 10, softFrom: 6 },
  { rarity: "star", within: 14 },
];
const RUBY = RULE[1] ?? { rarity: "ruby", within: 10 };
const PULLS = 300;

interface Pull {
  rarity: Stone;
  triggered: PityTrigger<Stone>;
  before: PityState<Stone>;
  after: PityState<Stone>;
}

function run(seed: string, count: number, odds = ODDS, rule = RULE): Pull[] {
  const out: Pull[] = [];
  let pity = freshPity(rule);
  let rng = seedRng(seed);
  for (let i = 0; i < count; i++) {
    const d = drawRarity(STONES, rng, odds, pity, rule);
    out.push({ rarity: d.rarity, triggered: d.triggered, before: pity, after: d.pity });
    pity = d.pity;
    rng = d.rng;
  }
  return out;
}

function longestDry(pulls: Pull[], at: Stone): number {
  let dry = 0;
  let longest = 0;
  for (const p of pulls) {
    dry = STONES.isAtLeast(p.rarity, at) ? 0 : dry + 1;
    longest = Math.max(longest, dry);
  }
  return longest;
}

describe("the kernel over any ladder", () => {
  test("a seeded run replays exactly", () => {
    expect(run("replay", 50)).toEqual(run("replay", 50));
  });

  test("every floor holds: no dry run reaches its count", () => {
    const pulls = run("floors", PULLS);
    for (const floor of RULE) expect(longestDry(pulls, floor.rarity)).toBeLessThan(floor.within);
  });

  test("a floor fires only where the table can reach its rung", () => {
    const low: OddsTable<Stone> = { pebble: 1, quartz: 1, opal: 0, ruby: 0, star: 0 };
    const pulls = run("low", PULLS, low);
    expect(pulls.every((p) => p.triggered === null)).toBe(true);
    expect(pullsUntilPity(STONES, freshPity(RULE), RULE, low)).toEqual({});
  });

  test("the soft ramp climbs from 0 after softFrom to 1 at within, and only on a floor that has one", () => {
    expect(softPityExtra(6, RUBY)).toBe(0);
    expect(softPityExtra(10, RUBY)).toBe(1);
    for (let pull = 7; pull < 10; pull++) {
      expect(softPityExtra(pull, RUBY)).toBeGreaterThan(softPityExtra(pull - 1, RUBY));
      expect(softPityExtra(pull, RUBY)).toBeLessThan(1);
    }
    expect(softPityExtra(100, { rarity: "opal", within: 6 })).toBe(0);
    const soft = run("soft", PULLS).filter((p) => p.triggered === "soft-ruby");
    expect(soft.length).toBeGreaterThan(0);
    expect(soft.every((p) => STONES.isAtLeast(p.rarity, "ruby"))).toBe(true);
  });

  test("a pull resets every floor at or below its rung and counts up the rest", () => {
    for (const p of run("counters", PULLS))
      for (const floor of RULE) {
        const reset = STONES.isAtLeast(p.rarity, floor.rarity);
        expect(p.after[floor.rarity]).toBe(reset ? 0 : (p.before[floor.rarity] ?? 0) + 1);
      }
  });

  test("the countdown names each reachable floor and never drops below one", () => {
    expect(pullsUntilPity(STONES, freshPity(RULE), RULE, ODDS)).toEqual({ opal: 6, ruby: 10, star: 14 });
    for (const p of run("countdown", 60)) {
      const left = pullsUntilPity(STONES, p.after, RULE, ODDS);
      for (const n of Object.values(left)) expect(n).toBeGreaterThanOrEqual(1);
    }
  });

  test("published odds run highest rung first with the empty rows dropped", () => {
    expect(publishedOdds(STONES, ODDS).map((o) => o.rarity)).toEqual(["star", "ruby", "opal", "pebble"]);
  });

  test("an odds table names every rung, and a rule only the ladder's", () => {
    // @ts-expect-error the table misses a rung
    const short: OddsTable<Stone> = { pebble: 1, quartz: 1, opal: 1, ruby: 1 };
    // @ts-expect-error not a rung of the ladder
    const stray: PityRule<Stone> = [{ rarity: "diamond", within: 3 }];
    expect([short, stray]).toHaveLength(2);
  });
});

describe("drawMany", () => {
  test("threads pity and rng through the post-draw roll, the same as single draws", () => {
    const roll = catalogueRoll<Stone, { id: string; rarity: Stone }>([
      { id: "a", rarity: "pebble" },
      { id: "b", rarity: "pebble" },
      { id: "c", rarity: "opal" },
    ]);
    const many = drawMany(STONES, "box", ODDS, RULE, freshPity(RULE), seedRng("many"), 40, roll);
    expect(many.pulls).toHaveLength(40);
    for (const p of many.pulls) if (p.rarity === "opal") expect(p.item.id).toBe("c");
    expect(drawMany(STONES, "box", ODDS, RULE, freshPity(RULE), seedRng("many"), 40, roll)).toEqual(many);
  });
});

/** A toy gacha: two boxes over the stones, gems that pay for the shiny box. */
const bag = defineGacha({
  key: "bag",
  ladder: STONES,
  odds: { plain: ODDS, shiny: { pebble: 0, quartz: 60, opal: 30, ruby: 8, star: 2 } },
  pity: { plain: RULE, shiny: [{ rarity: "star", within: 20 }] },
  roll: ({ rarity, box, rng }) => [`${box}:${rarity}`, rng],
});

const purse = defineFeature({
  key: "purse",
  reach: [bag],
  initial: () => ({ gems: 25 }),
  actions: (api) => ({
    buyShiny: (count: number): boolean => {
      let ok = false;
      api.set((s) => {
        const owed = (count - Math.min(s.bag.tokens.shiny, count)) * 10;
        if (s.purse.gems < owed) return;
        s.purse.gems -= owed;
        bag.draft.open(s, "shiny", count);
        ok = true;
      });
      return ok;
    },
  }),
});

const game = defineGame({ id: "bag", save: { key: "bag.save", version: 1 }, features: [bag, purse] });

function bagStore(seed = "bag", backend = createMemoryBackend()) {
  const store = createIdleStore(game, {
    storage: createGameStorage(backend, { debounceMs: 0, onError: () => {} }),
    now: () => T0,
    seed,
  });
  return { store, backend };
}

describe("gacha()", () => {
  test("refuses a vocabulary with no rarities at definition", () => {
    const bare = vocab({ currencies: ["gold"] });
    expect(() =>
      defineGacha({ key: "empty", ladder: bare.rarities, odds: { box: {} }, pity: { box: [] } }),
    ).toThrow(/gacha "empty": its ladder has no rungs/);
  });

  test("a fresh gacha holds zeroed counters for every box and floor", () => {
    const s = bagStore().store.getState().bag;
    expect(s.pity).toEqual({ plain: { opal: 0, ruby: 0, star: 0 }, shiny: { star: 0 } });
    expect(s.opened).toEqual({ plain: 0, shiny: 0 });
    expect(s.tokens).toEqual({ plain: 0, shiny: 0 });
    expect(s.lastOpen).toBeNull();
  });

  test("an open draws through the kernel on the feature's stream, spends tokens first and records itself", () => {
    const { store } = bagStore();
    store.getState().bag.grant("plain", 2);
    const open = store.getState().bag.open("plain", 5);
    const s = store.getState().bag;
    expect(open.tokensUsed).toBe(2);
    expect(open.pulls).toHaveLength(5);
    expect(open.pulls.every((p) => p.item === `plain:${p.rarity}`)).toBe(true);
    expect(s.tokens.plain).toBe(0);
    expect(s.opened.plain).toBe(5);
    expect(s.lastOpen).toEqual(open);
    const twin = drawMany(
      STONES,
      "plain",
      ODDS,
      RULE,
      freshPity(RULE),
      bagStore().store.getState().bag.rng,
      5,
      ({ rarity, box, rng }) => [`${box}:${rarity}`, rng],
    );
    expect(open.pulls).toEqual(twin.pulls);
    expect(s.pity.plain).toEqual(twin.pity);
  });

  test("a game's paying action opens inside its own recipe", () => {
    const { store } = bagStore();
    expect(store.getState().purse.buyShiny(2)).toBe(true);
    expect(store.getState().purse.gems).toBe(5);
    expect(store.getState().bag.opened.shiny).toBe(2);
    expect(store.getState().purse.buyShiny(1)).toBe(false);
  });

  test("the same seed replays the same opens, and the state survives a reload", () => {
    const a = bagStore("same");
    const b = bagStore("same");
    expect(a.store.getState().bag.open("plain", 20)).toEqual(b.store.getState().bag.open("plain", 20));
    const reloaded = bagStore("other", a.backend).store.getState().bag;
    expect(reloaded.pity).toEqual(a.store.getState().bag.pity);
    expect(reloaded.rng).toEqual(a.store.getState().bag.rng);
    expect(reloaded.opened.plain).toBe(20);
  });

  test("an import of a save from before the gacha draws what the run would have drawn", () => {
    const wallet = defineFeature({ key: "purse", initial: () => ({ gems: 25 }) });
    const before = defineGame({ id: "bag", save: { key: "bag.save", version: 1 }, features: [wallet] });
    const old = createIdleStore(before, {
      storage: createGameStorage(createMemoryBackend(), { debounceMs: 0, onError: () => {} }),
      now: () => T0,
      seed: "same",
    });
    const carried = bagStore("same").store;
    const imported = bagStore("same").store;
    imported.getState().importProfile(old.getState().exportProfile(), T0 + 5000);
    expect(imported.getState().bag.open("shiny", 20)).toEqual(carried.getState().bag.open("shiny", 20));
    expect(imported.getState().bag.rng).toEqual(carried.getState().bag.rng);
  });

  test("a prestige reset keeps it whole by default", () => {
    const { store } = bagStore();
    store.getState().bag.open("shiny", 3);
    store.getState().resetRun();
    expect(store.getState().bag.opened.shiny).toBe(3);
  });

  test("def carries what it was declared with; draft.open is the paying action's open", () => {
    expect(bag.def.boxes).toEqual(["plain", "shiny"]);
    expect(bag.def.ladder).toBe(STONES);
    expect(bag.def.odds.plain).toBe(ODDS);
    expect(bag.def.pity.plain).toBe(RULE);
    expect(bag.select).toEqual({});
    const { store } = bagStore("draft");
    const draft = {
      bag: JSON.parse(JSON.stringify(store.getState().bag)) as ReturnType<typeof store.getState>["bag"],
    };
    expect(bag.draft.open(draft, "plain", 4).pulls).toHaveLength(4);
    expect(draft.bag.opened.plain).toBe(4);
  });
});
