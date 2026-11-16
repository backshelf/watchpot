/**
 * Chapter 7 of the guide, "The first reset": Simmer with a reset button. Chapter 4's game, with the pot replaced by
 * one that keeps its taps through a reset and records when the run began, steam above it that boils the pot over, a
 * wall of medals, and the pages opening as the player gets to them.
 *
 * Run it with `bun docs/examples/guide-first-reset.ts`: it taps, buys burners for ten minutes, boils over, and prints
 * what survived.
 */
import {
  type Achievement,
  achievements,
  type Decimal,
  defineGame,
  feature,
  lifetimeMultiplier,
  powerGain,
  prestige,
  resetPace,
  type StateOf,
} from "watchpot/core";
import {
  lid,
  SIMMER_PER_SECOND,
  SIMMER_RATES,
  scriptStore,
  stove,
  WORDS,
  wallet,
} from "./simmer/game-wallet";

// --- The run -------------------------------------------------------------------------------------------------

/**
 * Chapter 4's pot, under the same key, with two changes: it records when the run began (`startedAt`), and a reset
 * keeps its count of taps.
 */
export const pot = feature({
  key: "pot",
  reach: [wallet],
  initial: (ctx) => ({ taps: 0, startedAt: ctx.now }),
  // A boil-over starts the run again, but the count of taps is the player's for good.
  reset: { keep: ["taps"] },
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        wallet.credit(s, "bubbles", 1);
        s.pot.taps += 1;
      }),
  }),
  steps: {
    produce: {
      simmer: (s, ctx) => {
        wallet.credit(s, "bubbles", (SIMMER_PER_SECOND * ctx.dtMs) / 1000);
      },
    },
  },
});

// --- The first reset -----------------------------------------------------------------------------------------

/** What steam reads: the wallet's `earned` (this run's bubbles) and when the run began. */
type Run = StateOf<readonly [typeof wallet, typeof pot]>;

/** Steam a boil-over pays: none under 1,000 bubbles this run, then the square root of how many thousands. */
export const steamGain = (s: Run): Decimal => powerGain(s.wallet.earned, { k: 1, exp: 0.5, per: 1000 });

/** Seconds since this run began. */
const runSeconds = (s: Run, now: number): number => Math.max(0, (now - s.pot.startedAt) / 1000);

/** How fast boiling over now would grow the steam held, in orders of magnitude a second. */
export const boilPace = (s: Run & { steam: { currency: Decimal } }, now: number): number =>
  resetPace(steamGain(s), s.steam.currency, runSeconds(s, now), 10);

/** Past its peak: the pot pays, and its pace has fallen under 85% of this run's best. */
export const pastPeak = (s: Run & { steam: { currency: Decimal; peak: number } }, now: number): boolean =>
  steamGain(s).gte(1) && boilPace(s, now) < s.steam.peak * 0.85;

export const steam = prestige({
  key: "steam",
  action: "boilOver",
  reach: [wallet, pot, stove],
  initial: () => ({ peak: 0 }),
  gain: (s) => steamGain(s),
  afterReset: (s) => {
    s.steam.peak = 0; // a new run, a new best pace
  },
  steps: {
    rates: {
      // Every steam ever made adds a tenth to the stove: 1 + 0.1 x lifetime steam.
      drive: (s) => {
        s.stove.perSecond = s.stove.perSecond.mul(lifetimeMultiplier(s.steam.lifetime, { k: 0.1, exp: 1 }));
      },
    },
    settle: {
      peak: (s, ctx) => {
        const pace = boilPace(s, ctx.now);
        if (pace > s.steam.peak) s.steam.peak = pace;
      },
    },
  },
});

// --- Medals and pages ----------------------------------------------------------------------------------------

/** Everything the medals and pages read: the run and the steam above it. */
const BELOW = [wallet, pot, stove, lid, steam] as const;
type Kitchen = StateOf<typeof BELOW>;

const MEDALS: Achievement<Kitchen>[] = [
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
];

/** The medal wall: earned once, kept through every boil-over (the default for achievements). */
export const medals = achievements({ key: "medals", columns: 4, list: MEDALS });

const PAGES: Achievement<Kitchen>[] = [
  { id: "pot", name: "Pot", line: "", when: () => true },
  { id: "medals", name: "Medals", line: "", when: (s) => s.pot.taps >= 1 },
  { id: "steam", name: "Steam", line: "", when: (s) => s.steam.runs > 0 || s.wallet.earned.gte(1000) },
];

/** The pages, on the same factory: a page opens the first pass its condition holds and never shuts. */
export const pages = achievements({ key: "pages", columns: PAGES.length, list: PAGES });

export const isOpen = (s: { pages: { earned: Record<string, number> } }, id: string): boolean =>
  s.pages.earned[id] !== undefined;

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [...BELOW, medals, pages],
  // The steam's push lands after the stove sets its rate and the lid doubles it.
  order: { rates: [...SIMMER_RATES, "steam.rates.drive"] },
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
    steamGain(s).toString(),
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
