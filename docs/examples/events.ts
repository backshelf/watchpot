import {
  buyEventNode,
  buyEventShopItem,
  buyMasteryNode,
  checkPassClaim,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  cycleBand,
  D,
  DAY_MS,
  defineGame,
  dueMilestones,
  type EventDefinition,
  emptyMastery,
  eventCurrencyCap,
  eventNodeRow,
  feature,
  freshRuntime,
  type HeadStartEffect,
  HOUR_MS,
  isEventFailure,
  type KeepEffect,
  msUntilRegen,
  passProgress,
  passStateOf,
  regenEventCurrencies,
  resolveWindow,
  yieldUnits,
  ZERO,
} from "watchpot/core";

/** What the event's nodes do: one effect of the game's own, and the two mastery kinds the framework reads. */
type Effect = { kind: "taste"; mult: number } | KeepEffect | HeadStartEffect;
/** What its milestones, shop and pass pay, in the game's own words. */
type Reward = { kind: "bubbles"; amount: number } | { kind: "ribbons"; amount: number };

const spoonRow = eventNodeRow<Effect>("spoons");
const ribbonRow = eventNodeRow<Effect>("ribbons");

/** Simmer's tasting: a three-day cycle that starts on the first open and starts again when it ends. */
export const TASTING: EventDefinition<Effect, Reward, "tap"> = {
  id: "tasting",
  name: "The tasting",
  tagline: "Every pot gets a spoon.",
  schedule: { kind: "rolling", durationMs: 3 * DAY_MS },
  currencies: [
    // Spoons trickle back, one an hour up to five, and taps pay them too (`fuel`).
    {
      id: "spoons",
      name: "Spoons",
      glyph: "spoon",
      start: 3,
      cap: 5,
      regen: { amount: 1, everyMs: HOUR_MS },
    },
    // Ribbons are kept from cycle to cycle: they live in the mastery, never in a cycle's runtime.
    { id: "ribbons", name: "Ribbons", glyph: "ribbon", start: 0, persistent: true },
  ],
  upgrades: [
    spoonRow("ladle", "Ladle", "Every taste counts double.", 2, 3, [], [{ kind: "taste", mult: 2 }], 2),
    spoonRow("bowl", "Bowl", "Tastes a little more.", 4, 1, ["ladle"], [{ kind: "taste", mult: 1.5 }]),
  ],
  mastery: [
    ribbonRow(
      "recipe-card",
      "Recipe card",
      "Start every tasting with a ladle.",
      1,
      1,
      [],
      [{ kind: "keep", node: "ladle", ranks: 1 }],
    ),
    ribbonRow(
      "pantry",
      "Pantry",
      "Two spoons more at the start.",
      1,
      2,
      [],
      [{ kind: "head-start", currency: "spoons", amount: 2 }],
      1,
    ),
  ],
  milestones: [
    {
      id: "first",
      name: "First taste",
      stat: "tasted",
      threshold: 1,
      rewards: [{ kind: "bubbles", amount: 50 }],
    },
    {
      id: "ten",
      name: "Ten tastes",
      stat: "tasted",
      threshold: 10,
      rewards: [{ kind: "ribbons", amount: 1 }],
    },
    { id: "fifty", name: "Fifty", stat: "tasted", threshold: 50, rewards: [{ kind: "ribbons", amount: 2 }] },
  ],
  shop: [
    {
      id: "jar",
      name: "Jar of bubbles",
      line: "",
      cost: { currency: "spoons", amount: 1 },
      reward: { kind: "bubbles", amount: 100 },
      limit: 2,
    },
  ],
  stats: ["tasted"],
  pass: {
    name: "Tasting card",
    line: "Stamp it as you go.",
    priceCents: 0,
    stat: "tasted",
    unit: ["taste", "tastes"],
    tiers: [
      { at: 5, free: { kind: "bubbles", amount: 20 }, premium: null },
      { at: 20, free: { kind: "ribbons", amount: 1 }, premium: null },
    ],
  },
  fuel: [{ on: "tap", per: 0.25, currency: "spoons" }], // a spoon every four taps
};

/**
 * The game's events feature: the framework is pure functions over data, so the feature is yours. It keeps one
 * runtime and the mastery, starts a new cycle when the window moves on, and lets the trickle run in `sync`.
 */
export const tasting = feature({
  key: "tasting",
  initial: (ctx) => ({
    runtime: freshRuntime(TASTING, ctx.now),
    mastery: emptyMastery(),
  }),
  reset: "never",
  actions: (api) => ({
    /** A tap on the pot while the tasting runs: one taste, and the fuel's share of a spoon. */
    taste: () =>
      api.set((d) => {
        const rt = d.tasting.runtime;
        const per = TASTING.fuel?.[0]?.per ?? 0;
        const { units, carry } = yieldUnits(per, 1, 1, rt.fuelCarry?.["spoons/tap"] ?? 0);
        rt.fuelCarry = { ...rt.fuelCarry, "spoons/tap": carry };
        const cap = eventCurrencyCap(TASTING, "spoons");
        const spoons = (rt.currencies.spoons ?? ZERO).add(units);
        rt.currencies.spoons = cap && spoons.gt(cap) ? cap : spoons; // fuel from play stops at the cap too
        rt.stats.tasted = (rt.stats.tasted ?? 0) + 1;
      }),
    buy: (node: string) =>
      api.set((d) => {
        const next = buyEventNode(TASTING, d.tasting.runtime, node);
        if (isEventFailure(next)) return next.code;
        d.tasting.runtime = next;
        return null;
      }),
  }),
  steps: {
    sync: {
      cycle: (d, ctx) => {
        const window = resolveWindow(TASTING.schedule, ctx.now, d.tasting.runtime.cycleStart);
        if (window.start !== d.tasting.runtime.cycleStart)
          d.tasting.runtime = freshRuntime(TASTING, window.start, ctx.now, d.tasting.mastery);
        d.tasting.runtime = regenEventCurrencies(TASTING, d.tasting.runtime, ctx.now);
      },
    },
  },
});

export const game = defineGame({
  id: "simmer-tasting",
  save: { key: "simmer-tasting.save", version: 1 },
  features: [tasting],
});

if (import.meta.main) {
  let wall = Date.UTC(2026, 0, 1);
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend()),
    now: () => wall,
  });
  store.getState().catchUp(wall);
  const t = () => store.getState().tasting;

  console.log(
    "spoons at the start:",
    t().runtime.currencies.spoons?.toNumber(),
    "| next in",
    msUntilRegen(TASTING, t().runtime, "spoons", wall),
    "ms",
  );
  wall += 90 * 60_000;
  store.getState().tick(1000, wall);
  console.log("90 minutes on:", t().runtime.currencies.spoons?.toNumber(), "spoons");

  for (let i = 0; i < 12; i++) store.getState().tasting.taste();
  console.log("12 tastes:", t().runtime.currencies.spoons?.toNumber(), "spoons, at the cap");
  const tasting = store.getState().tasting;
  console.log("buy the bowl first:", tasting.buy("bowl"), "| the ladle:", tasting.buy("ladle"));

  const rt = t().runtime;
  console.log(
    "milestones due:",
    dueMilestones(TASTING, rt).map((m) => m.id),
    "| band so far:",
    cycleBand(TASTING, rt),
  );
  const pass = passProgress(TASTING.pass, rt.stats.tasted ?? 0);
  const claim = checkPassClaim(TASTING.pass, passStateOf(rt), rt.stats.tasted ?? 0, 1, "free");
  console.log("pass:", JSON.stringify(pass), "| claim tier 1:", claim);

  const jar = buyEventShopItem(TASTING, rt, "jar");
  console.log(
    "the jar:",
    isEventFailure(jar) ? jar.code : `bought, ${jar.currencies.spoons?.toNumber()} spoons left`,
  );

  // A ribbon from the "ten" milestone buys the recipe card; the next cycle starts with a ladle already bought.
  const mastery = buyMasteryNode(
    TASTING,
    { ...emptyMastery(), currencies: { ribbons: D(1) } },
    "recipe-card",
  );
  const later = rt.cycleStart + 3 * DAY_MS;
  const window = resolveWindow(TASTING.schedule, later, rt.cycleStart);
  if (!isEventFailure(mastery)) {
    const next = freshRuntime(TASTING, window.start, later, mastery);
    console.log(
      "three days on, a new cycle:",
      window.start !== rt.cycleStart,
      "| it starts with",
      JSON.stringify(next.upgrades),
    );
  }
}
