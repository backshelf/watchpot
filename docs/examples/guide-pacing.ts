/**
 * Chapter 12 of the guide, "Proving the pacing": Simmer played by the sim lab instead of by you. Simmer is imported
 * from `simmer/game-wallet.ts` with one change the sim needs: the pot carries `moves`, the menu the auto-player
 * buys from. Then a run on `activeSchedule`, the firsts it saw, a pacing contract judged on it, and the test kit's
 * fresh store and fixture save.
 *
 * Run it with `bun docs/examples/guide-pacing.ts`: it plays one played day of Simmer (well under a second) and
 * prints the firsts, the timeline and the verdicts.
 */
import { defineGame, HOUR_MS, MINUTE_MS, withMoves } from "watchpot/core";
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
import {
  BURNER_PER_SECOND,
  burnerPrice,
  lid,
  pot,
  SIMMER_RATES,
  type Simmer,
  stove,
  WORDS,
  wallet,
} from "./simmer/game-wallet";

// --- Simmer, playable ------------------------------------------------------------------------------------------

/**
 * Simmer's pot, carrying what a player could do now, for the sim's auto-player: light a burner. The store never reads
 * this. Moves read the whole state, so any feature can carry them. The stove would be the natural home, but the lid
 * reaches the stove itself, and a stove with moves is a new object, so the lid would have to be rebuilt too. Nothing
 * reaches the pot.
 */
export const playablePot = withMoves(pot, (s: Simmer) => [
  {
    id: "buy-burner",
    cost: { currency: "bubbles", amount: burnerPrice(s.stove.burners) },
    value: () => BURNER_PER_SECOND, // bubbles a second: the only thing a burner does
    apply: (store) => store.getState().stove.buyBurner(),
  },
]);

/** Simmer with the playable pot in the pot's place: the same key, the same save. */
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [wallet, playablePot, stove, lid],
  order: { rates: [...SIMMER_RATES] },
});

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
  const player = autoPlayer(game);

  const hoursIn = () => (world.now() - start) / HOUR_MS;
  const read = (): Row => {
    const s = world.store.getState();
    return { hours: hoursIn(), bubbles: s.wallet.bubbles.toNumber(), burners: s.stove.burners };
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
      const before = world.store.getState().stove.burners;
      if (player.look(world.store).bought === 0) return;
      const now = world.now();
      if (hoursIn() <= 1) longestWait = Math.max(longestWait, now - lastBuy);
      lastBuy = now;
      const after = world.store.getState().stove.burners;
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
    store.getState().stove.buyBurner();
    store.getState().tick(HOUR_MS, clock.advance(HOUR_MS));
  });

/** Loads a save into a fresh store, as a test does, without the catch-up a boot would make. */
export function loadSave(text: string) {
  return freshStore(game, { save: text, catchUp: false }).store.getState();
}

/** A rule checked the short way: one burner and a minute of play, in one call. */
export function aMinuteOnOneBurner(): number {
  const { store, play } = freshStore(game);
  store.setState((s) => {
    s.stove.burners = 1;
  });
  play(MINUTE_MS);
  return store.getState().wallet.bubbles.toNumber(); // the pot's 60 and the burner's 60
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
  const s = loadSave(simmerFixture());
  console.log("fixture:", s.stove.burners, "burner,", s.wallet.bubbles.toFixed(0), "bubbles");
  console.log("a minute on one burner:", aMinuteOnOneBurner(), "bubbles");
}
