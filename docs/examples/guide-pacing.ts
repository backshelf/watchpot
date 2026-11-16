/**
 * Chapter 12 of the guide, "Proving the pacing": Simmer played by the sim lab instead of by you. The pot and its
 * burners are rebuilt here so the file stands on its own, with one addition the sim needs: the pot's `moves`, the
 * menu the auto-player buys from. Then a run on `activeSchedule`, the firsts it saw, a pacing contract judged on
 * it, and the test kit's fresh store and fixture save.
 *
 * Run it with `bun docs/examples/guide-pacing.ts`: it plays one played day of Simmer (well under a second) and
 * prints the firsts, the timeline and the verdicts.
 */
import { D, type Decimal, defineGame, feature, HOUR_MS, MINUTE_MS, ZERO } from "watchpot/core";
import {
  activeSchedule,
  atMost,
  autoPlayer,
  byHour,
  createSimWorld,
  fmtClock,
  grid,
  judge,
  markdownTable,
  playDays,
  rngFor,
  sampler,
  simStore,
  table,
  type Verdict,
} from "watchpot/sim";
import { fixtureSave, freshStore } from "watchpot/test";

// --- Simmer ----------------------------------------------------------------------------------------------------

const burnerCost = (owned: number): Decimal => D(10).mul(D(1.15).pow(owned));

export const pot = feature({
  key: "pot",
  initial: () => ({ bubbles: ZERO, burners: 0 }),
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        s.pot.bubbles = s.pot.bubbles.add(1);
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
      // One bubble a second per burner.
      burn: (s, ctx) => {
        s.pot.bubbles = s.pot.bubbles.add(D(s.pot.burners).mul(ctx.dtMs / 1000));
      },
    },
  },
  // What a player could do now, for the sim's auto-player. The store never reads this.
  moves: (s) => [
    {
      id: "buy-burner",
      cost: { currency: "bubbles", amount: burnerCost(s.pot.burners) },
      value: () => 1, // a bubble a second: the only thing a burner does
      apply: (store) => store.getState().pot.buyBurner(),
    },
  ],
});

export const game = defineGame({ id: "simmer", save: { key: "simmer.save", version: 1 }, features: [pot] });

// --- A run -----------------------------------------------------------------------------------------------------

/** One row of the timeline: what the contract reads, and when. */
export interface Row {
  hours: number;
  bubbles: number;
  burners: number;
}

/** What a run saw: its timeline, the firsts, and the longest wait between two purchases in the first hour. */
export interface Run {
  rows: Row[];
  firsts: string[];
  longestWaitMin: number;
}

/** Plays Simmer for one played day: a look every ten seconds around the clock, three taps at each look. */
export function playSimmer(seed = "simmer"): Run {
  const start = Date.UTC(2026, 0, 1);
  const world = createSimWorld((now) => simStore(game, now, seed), start);
  const player = autoPlayer(game, { balance: (s: { pot: { bubbles: Decimal } }) => s.pot.bubbles });

  const hoursIn = () => (world.now() - start) / HOUR_MS;
  const read = (): Row => {
    const s = world.store.getState();
    return { hours: hoursIn(), bubbles: s.pot.bubbles.toNumber(), burners: s.pot.burners };
  };
  const timeline = sampler({
    marks: [5, 15, 30, 60, 120, 240].map((min) => min * MINUTE_MS),
    start,
    take: read,
    at: (r) => r.hours,
  });

  const firsts: string[] = [];
  const counts = [1, 10, 25, 50, 75];
  let lastBuy = start;
  let longestWait = 0;

  playDays({
    world,
    schedule: activeSchedule(10, 3),
    days: 1,
    start,
    rng: rngFor(seed, "auto"),
    look: (at) => {
      for (let i = 0; i < at.presses; i++) world.store.getState().pot.tap();
      const before = world.store.getState().pot.burners;
      if (player.look(world.store).bought === 0) return;
      const now = world.now();
      if (hoursIn() <= 1) longestWait = Math.max(longestWait, now - lastBuy);
      lastBuy = now;
      const after = world.store.getState().pot.burners;
      for (const n of counts)
        if (before < n && after >= n) firsts.push(`${fmtClock(now - start)}  burner ${n}`);
    },
    afterLook: () => timeline.look(world.now()),
    dayEnd: () => timeline.close(read()),
  });

  return { rows: timeline.rows, firsts, longestWaitMin: longestWait / MINUTE_MS };
}

// --- The contract ----------------------------------------------------------------------------------------------

/** Burners owned at a quarter hour and at one hour of play, each a band from a floor to a ceiling. */
export const CONTRACT = table(
  byHour((r: Row) => r.hours),
  { burners: { name: "Burners", read: (r: Row) => r.burners } },
  grid(
    [0.25, 1],
    [
      [
        "burners",
        [
          [35, 50],
          [50, 70],
        ],
      ],
    ],
  ),
);

/** The run judged: the bands, plus one rule of its own about the longest wait. */
export function judgeSimmer(run: Run): Verdict[] {
  return [...judge(run.rows, CONTRACT), atMost("Longest wait in hour 1 (min)", run.longestWaitMin, 5)];
}

// --- The test kit ----------------------------------------------------------------------------------------------

/** A save made by play: twenty taps, a burner, then an hour on the stove. The same save every time it is made. */
export const simmerFixture = (): string =>
  fixtureSave(game, (store, clock) => {
    for (let i = 0; i < 20; i++) store.getState().pot.tap();
    store.getState().pot.buyBurner();
    store.getState().tick(HOUR_MS, clock.advance(HOUR_MS));
  });

/** Loads a save into a fresh store, as a test does, without the catch-up a boot would make. */
export function loadSave(text: string) {
  return freshStore(game, { save: text, catchUp: false }).store.getState().pot;
}

if (import.meta.main) {
  const run = playSimmer();
  console.log(run.firsts.join("\n"));
  console.log(
    markdownTable(
      ["hours", "bubbles", "burners"],
      run.rows.map((r) => [r.hours.toFixed(2), r.bubbles.toFixed(0), String(r.burners)]),
    ),
  );
  for (const v of judgeSimmer(run)) console.log(v.ok ? "pass" : "FAIL", v.name, v.value.toFixed(1), v.target);
  const pot = loadSave(simmerFixture());
  console.log("fixture:", pot.burners, "burner,", pot.bubbles.toFixed(0), "bubbles");
}
