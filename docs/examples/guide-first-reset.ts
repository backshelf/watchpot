/**
 * Chapter 7 of the guide, "The first reset": Simmer with a reset button. Chapter 4's game, with the pot replaced by
 * one that keeps its taps through a reset, steam above it that boils the pot over and says when that is worth doing,
 * a stove whose rate reads the steam, a wall of medals, and the pages opening as the player gets to them.
 *
 * Run it with `bun docs/examples/guide-first-reset.ts`: it taps, buys burners for ten minutes, boils over, and prints
 * what survived.
 */
import {
  defineAchievements,
  defineGame,
  definePrestige,
  feature,
  lifetimeMultiplier,
  powerGain,
} from "watchpot/core";
import {
  AWAY_CAP_MS,
  burnerPrice,
  flameOf,
  lid,
  OFFLINE_RATE,
  SIMMER_PER_SECOND,
  scriptStore,
  WORDS,
  wallet,
} from "./simmer/game-wallet";

// --- The run -------------------------------------------------------------------------------------------------

/** Chapter 4's pot, under the same key, with one change: a reset keeps its count of taps. */
export const pot = feature({
  key: "pot",
  reach: [wallet],
  initial: () => ({ taps: 0 }),
  // A boil-over starts the run again, but the count of taps is the player's for good.
  reset: { keep: ["taps"] },
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        wallet.draft.credit(s, "bubbles", 1);
        s.pot.taps += 1;
      }),
  }),
  steps: {
    produce: {
      simmer: {
        pass: "both",
        run: (s, ctx) => {
          wallet.draft.credit(s, "bubbles", (SIMMER_PER_SECOND * ctx.dtMs) / 1000);
        },
      },
    },
  },
});

/** Chapter 4's stove, under the same key, with one change: its rate reads the steam. */
export const stove = feature({
  key: "stove",
  reach: () => [wallet, lid, steam],
  initial: () => ({ burners: 0, off: false }),
  derived: {
    // Chapter 4's rate, times 1 + 0.1 x every steam ever made.
    perSecond: (s) =>
      flameOf(s.stove.burners)
        .mul(s.lid.on ? 2 : 1)
        .mul(lifetimeMultiplier(s.steam.lifetime, { k: 0.1, exp: 1 })),
  },
  actions: (api) => ({
    buyBurner: () =>
      api.set((s) => {
        if (!wallet.draft.debit(s, "bubbles", burnerPrice(s.stove.burners))) return false;
        s.stove.burners += 1;
        return true;
      }),
    toggle: () =>
      api.set((s) => {
        s.stove.off = !s.stove.off;
      }),
  }),
  steps: {
    guard: { cold: (s) => (s.stove.off ? "stop" : undefined) },
    produce: {
      burn: {
        pass: "tick",
        run: (s, ctx) => {
          wallet.draft.credit(s, "bubbles", s.stove.perSecond.mul(ctx.dtMs / 1000));
        },
      },
      away: {
        pass: "catchUp",
        run: (s, ctx) => {
          const credited = Math.min(ctx.dtMs, AWAY_CAP_MS) * OFFLINE_RATE;
          wallet.draft.credit(s, "bubbles", s.stove.perSecond.mul(credited / 1000));
        },
      },
    },
  },
});

// --- The first reset -----------------------------------------------------------------------------------------

export const steam = definePrestige({
  key: "steam",
  action: "boilOver",
  reach: [wallet],
  // None under 1,000 bubbles this run, then the square root of how many thousands.
  gain: (s) => powerGain(s.wallet.earned, { k: 1, exp: 0.5, per: 1000 }),
  // Past its peak once the pace falls under 85% of this run's best; never in a run's first ten seconds.
  pace: { past: 0.85, floorS: 10 },
});

// --- Medals and pages ----------------------------------------------------------------------------------------

/** The medal wall: earned once, kept through every boil-over (the default for achievements). */
export const medals = defineAchievements({
  key: "medals",
  columns: 4,
  reach: () => [wallet, pot, stove, steam],
  list: [
    { id: "first-bubble", name: "First bubble", line: "Tap the pot.", when: (s) => s.pot.taps >= 1 },
    { id: "lit", name: "Lit", line: "Light a burner.", when: (s) => s.stove.burners >= 1 },
    { id: "boiled", name: "Boiled over", line: "Boil the pot over once.", when: (s) => s.steam.runs >= 1 },
    {
      id: "cold-start",
      name: "Cold start",
      line: "Make 1,000 bubbles in a run without a burner.",
      secret: true,
      when: (s) => s.wallet.earned.gte(1000) && s.stove.burners === 0,
    },
  ],
});

/** The pages, on the same factory: a page opens the first pass its condition holds and never shuts. */
export const pages = defineAchievements({
  key: "pages",
  columns: 3,
  reach: () => [wallet, pot, steam],
  list: [
    { id: "pot", name: "Pot", line: "", when: () => true },
    { id: "medals", name: "Medals", line: "", when: (s) => s.pot.taps >= 1 },
    { id: "steam", name: "Steam", line: "", when: (s) => s.steam.runs > 0 || s.wallet.earned.gte(1000) },
  ],
});

/** Whether a page is open. */
export const isOpen = (s: { pages: { earned: Record<string, number> } }, id: string): boolean =>
  s.pages.earned[id] !== undefined;

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [wallet, pot, stove, lid, steam, medals, pages],
});

// --- A run, end to end ---------------------------------------------------------------------------------------

if (import.meta.main) {
  let wall = Date.UTC(2026, 0, 1);
  const store = scriptStore(game, () => wall);

  for (let i = 0; i < 12; i++) store.getState().pot.tap();
  for (let i = 0; i < 600; i++) {
    wall += 1000; // ten minutes, a second at a time, buying every burner the pot can afford
    store.getState().tick(1000);
    while (store.getState().stove.buyBurner()) {}
  }

  const s = store.getState();
  console.log(
    "made this run:",
    s.wallet.earned.floor().toString(),
    "steam on offer:",
    steam.select.gain(s).toString(),
  );
  console.log("burners:", s.stove.burners, "pages open:", Object.keys(s.pages.earned).join(", "));

  console.log("boiled over:", store.getState().steam.boilOver());
  const after = store.getState();
  console.log(
    "bubbles:",
    after.wallet.bubbles.toString(),
    "burners:",
    after.stove.burners,
    "taps kept:",
    after.pot.taps,
    "steam:",
    after.steam.currency.toString(),
  );

  store.getState().resetProfile(wall); // the "delete my save" button: everything, steam and medals too
  console.log(
    "after a profile reset, runs:",
    store.getState().steam.runs,
    "taps:",
    store.getState().pot.taps,
  );
}
