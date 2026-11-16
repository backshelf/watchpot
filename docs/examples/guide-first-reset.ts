import {
  type Achievement,
  achievements,
  createIdleStore,
  D,
  type Decimal,
  defineGame,
  type FeatureApi,
  feature,
  lifetimeMultiplier,
  type PrestigeCore,
  powerGain,
  prestige,
  resetPace,
  ZERO,
} from "watchpot/core";

/**
 * Simmer with its first reset. The pot from chapter 2 (tap for bubbles, buy burners that bubble on their own),
 * one prestige above it that boils the pot over for steam, a wall of medals, and the pages opening as the player
 * gets to them. Chapter 7 of the guide quotes this file.
 */

// --- The run -------------------------------------------------------------------------------------------------

/** The pot's saved state. `made` counts every bubble this run; `taps` counts every tap ever. */
interface PotState {
  bubbles: Decimal;
  made: Decimal;
  burners: number;
  taps: number;
  startedAt: number;
}

/** The slices the pot reads. The boil is declared below the pot, so the pot names its shape by hand. */
interface Kitchen {
  pot: PotState;
  boil: PrestigeCore & { peak: number };
}

/** Every steam ever made adds a tenth to every bubble: 1 + 0.1 x lifetime steam. */
const boost = (s: Kitchen): number => lifetimeMultiplier(s.boil.lifetime, { k: 0.1, exp: 1 });

const burnerCost = (owned: number): Decimal => D(10).mul(D(1.15).pow(owned));

/** Adds bubbles to the balance and to this run's count, in one place. */
const addBubbles = (s: Kitchen, n: Decimal): void => {
  s.pot.bubbles = s.pot.bubbles.add(n);
  s.pot.made = s.pot.made.add(n);
};

export const pot = feature({
  key: "pot",
  initial: (ctx): PotState => ({ bubbles: ZERO, made: ZERO, burners: 0, taps: 0, startedAt: ctx.now }),
  // A boil-over starts the run again, but the count of taps is the player's for good.
  reset: { keep: ["taps"] },
  actions: (api: FeatureApi<Kitchen>) => ({
    tap: () =>
      api.set((s) => {
        s.pot.taps += 1;
        addBubbles(s, D(boost(s)));
      }),
    buyBurner: (): boolean => {
      let bought = false;
      api.set((s) => {
        const cost = burnerCost(s.pot.burners);
        if (s.pot.bubbles.lt(cost)) return;
        s.pot.bubbles = s.pot.bubbles.sub(cost);
        s.pot.burners += 1;
        bought = true;
      });
      return bought;
    },
  }),
  steps: {
    produce: {
      // One bubble a second per burner, times the steam boost.
      burn: (s: Kitchen, ctx) =>
        addBubbles(
          s,
          D(s.pot.burners)
            .mul(boost(s))
            .mul(ctx.dtMs / 1000),
        ),
    },
  },
});

// --- The first reset -----------------------------------------------------------------------------------------

/** Steam a boil-over pays: none under 1,000 bubbles this run, then the square root of how many thousands. */
export const steamGain = (s: Kitchen): Decimal => powerGain(s.pot.made, { k: 1, exp: 0.5, per: 1000 });

/** Seconds since this run began. */
const runSeconds = (s: Kitchen, now: number): number => Math.max(0, (now - s.pot.startedAt) / 1000);

/** How fast boiling over now would grow the steam held, in orders of magnitude a second. */
export const boilPace = (s: Kitchen, now: number): number =>
  resetPace(steamGain(s), s.boil.currency, runSeconds(s, now), 10);

/** Past its peak: the pot pays, and its pace has fallen under 85% of this run's best. */
export const pastPeak = (s: Kitchen, now: number): boolean =>
  steamGain(s).gte(1) && boilPace(s, now) < s.boil.peak * 0.85;

export const boil = prestige({
  key: "boil",
  action: "boilOver",
  reach: [pot],
  initial: () => ({ peak: 0 }),
  gain: (s) => steamGain(s),
  afterReset: (s) => {
    s.boil.peak = 0; // a new run, a new best pace
  },
  steps: {
    settle: {
      peak: (s, ctx) => {
        const pace = boilPace(s, ctx.now);
        if (pace > s.boil.peak) s.boil.peak = pace;
      },
    },
  },
});

// --- Medals and pages ----------------------------------------------------------------------------------------

const MEDALS: Achievement<Kitchen>[] = [
  { id: "first-bubble", name: "First bubble", line: "Tap the pot.", when: (s) => s.pot.taps >= 1 },
  { id: "lit", name: "Lit", line: "Buy a burner.", when: (s) => s.pot.burners >= 1 },
  { id: "boiled", name: "Boiled over", line: "Boil the pot over once.", when: (s) => s.boil.runs >= 1 },
  {
    id: "cold-start",
    name: "Cold start",
    line: "Reach 1,000 bubbles in a run without a burner.",
    secret: true,
    when: (s) => s.pot.made.gte(1000) && s.pot.burners === 0,
  },
];

/** The medal wall: earned once, kept through every boil-over (the default for achievements). */
export const medals = achievements({ key: "medals", columns: 4, list: MEDALS });

const PAGES: Achievement<Kitchen>[] = [
  { id: "pot", name: "Pot", line: "", when: () => true },
  { id: "medals", name: "Medals", line: "", when: (s) => s.pot.taps >= 1 },
  { id: "boil", name: "Boil", line: "", when: (s) => s.boil.runs > 0 || s.pot.made.gte(1000) },
];

/** The pages, on the same factory: a page opens the first pass its condition holds and never shuts. */
export const pages = achievements({ key: "pages", columns: PAGES.length, list: PAGES });

export const isOpen = (s: { pages: { earned: Record<string, number> } }, id: string): boolean =>
  s.pages.earned[id] !== undefined;

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  features: [pot, boil, medals, pages],
});

// --- A run, end to end ---------------------------------------------------------------------------------------

if (import.meta.main) {
  let wall = Date.UTC(2026, 0, 1);
  const store = createIdleStore(game, { now: () => wall });
  const step = (ms: number) => {
    wall += ms;
    store.getState().tick(ms, wall);
  };

  for (let i = 0; i < 12; i++) store.getState().pot.tap();
  for (let i = 0; i < 600; i++) {
    step(1000); // ten minutes, a second at a time, buying every burner the pot can afford
    while (store.getState().pot.buyBurner()) {}
  }

  const s = store.getState();
  console.log("made this run:", s.pot.made.floor().toString(), "steam on offer:", steamGain(s).toString());
  console.log("pages open:", Object.keys(s.pages.earned).join(", "));

  console.log("boiled over:", store.getState().boil.boilOver());
  const after = store.getState();
  console.log(
    "bubbles:",
    after.pot.bubbles.toString(),
    "taps kept:",
    after.pot.taps,
    "steam:",
    after.boil.currency.toString(),
  );

  store.getState().resetProfile(wall); // the "delete my save" button: everything, steam and medals too
  console.log("after a profile reset, runs:", store.getState().boil.runs);
}
