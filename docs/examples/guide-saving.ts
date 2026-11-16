/**
 * Guide chapter 9, saving and time away: Simmer cut down to its pot and burners, at two save versions, with the
 * rename between them, a derived rate that is never saved, and burners that pay half while the player is away.
 * Run it with `bun docs/examples/guide-saving.ts`.
 */
import {
  catchUp,
  createIdleStore,
  D,
  type Decimal,
  defineGame,
  encodeProfile,
  feature,
  HOUR_MS,
  isPlainObject,
  type Migration,
  oldestReadable,
  SaveError,
  saveStatus,
  ZERO,
} from "watchpot/core";
import { awayGains, watchAway } from "watchpot/react";
import { fixtureSave, freshStore } from "watchpot/test";

// --- Version 1: Simmer as it first shipped ---------------------------------------------------------------------

/** The pot at version 1: `popped` counts every bubble the pot has ever made. */
const potV1 = feature({
  key: "pot",
  initial: () => ({ bubbles: ZERO, popped: ZERO }),
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        s.pot.bubbles = s.pot.bubbles.add(1);
        s.pot.popped = s.pot.popped.add(1);
      }),
  }),
});

export const simmerV1 = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  features: [potV1],
});

// --- Version 2: the field is renamed, so the save needs a step ------------------------------------------------

/** Version 2: `popped` is now `bubblesEver`. The step sees only the pot's own saved data. */
const renamePopped: Migration = (saved) => {
  if (!isPlainObject(saved)) return saved;
  const { popped, ...rest } = saved;
  return popped === undefined ? rest : { ...rest, bubblesEver: popped };
};

const pot = feature({
  key: "pot",
  initial: () => ({ bubbles: ZERO, bubblesEver: ZERO }),
  migrations: { 2: renamePopped },
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        s.pot.bubbles = s.pot.bubbles.add(1);
        s.pot.bubblesEver = s.pot.bubblesEver.add(1);
      }),
  }),
});

// --- The burners: a rate that is worked out, never saved, and paid differently while away ----------------------

/** Bubbles a second one burner makes. */
const BURNER_RATE = 1;
/** While the player is away, burners pay half, for at most eight hours. */
const AWAY_RATE = 0.5;
const AWAY_CAP_MS = 8 * HOUR_MS;

const rateOf = (owned: number): Decimal => D(owned).mul(BURNER_RATE);

const burners = feature({
  key: "burners",
  reach: [pot],
  initial: () => ({ owned: 0, perSecond: ZERO }),
  // `perSecond` is worked out from `owned`, so it is never saved...
  transient: ["perSecond"],
  // ...and `derive` works it out again whenever the state is made fresh: a new store, a load, an import, a reset.
  derive: (s) => {
    s.burners.perSecond = rateOf(s.burners.owned);
  },
  steps: {
    rates: {
      perSecond: (s) => {
        s.burners.perSecond = rateOf(s.burners.owned);
      },
    },
    produce: {
      // A live tick pays in full.
      live: {
        pass: "tick",
        run: (s, ctx) => {
          const made = s.burners.perSecond.mul(ctx.dtMs / 1000);
          s.pot.bubbles = s.pot.bubbles.add(made);
          s.pot.bubblesEver = s.pot.bubblesEver.add(made);
        },
      },
      // The catch-up pays for the time away at the away rate, up to the cap.
      away: {
        pass: "catchUp",
        run: (s, ctx) => {
          const { creditedMs } = catchUp(ctx.dtMs, AWAY_RATE, AWAY_CAP_MS);
          const made = s.burners.perSecond.mul(creditedMs / 1000);
          s.pot.bubbles = s.pot.bubbles.add(made);
          s.pot.bubblesEver = s.pot.bubblesEver.add(made);
        },
      },
    },
  },
});

export const simmer = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 2 },
  features: [pot, burners],
});

/** The store a page builds: saved to localStorage, or held in memory (and said so) where there is none. */
export const createSimmerStore = () => createIdleStore(simmer, { now: () => Date.now() });

type SimmerStore = ReturnType<typeof createSimmerStore>;
type SimmerState = ReturnType<SimmerStore["getState"]>;

/** What a save notice says, or null while the save is being kept. Read it again whenever `watchSave` calls. */
export function saveNotice(store: SimmerStore): string | null {
  switch (saveStatus(store)) {
    case "unsaved":
      return "This browser is not keeping your progress.";
    case "blocked":
      // A newer build's save, or another tab of the game: the status does not say which.
      return "Simmer is saving somewhere else (a newer version, or another tab). Nothing here is being saved.";
    default:
      return null;
  }
}

// --- Telling the player what happened while they were away ---------------------------------------------------------

/** Calls `tell` with one line after every return worth telling. Returns the remover. */
export function tellReturns(store: SimmerStore, tell: (line: string) => void): () => void {
  return watchAway<SimmerState>(store, ({ before, after, ms }) => {
    const gains = awayGains(before, after, { bubbles: (s) => s.pot.bubbles });
    const minutes = Math.round(ms / 60_000);
    for (const { id, gain } of gains) tell(`Away ${minutes} min: +${gain.toFixed(0)} ${id}`);
  });
}

// --- Trying it -------------------------------------------------------------------------------------------------------

if (import.meta.main) {
  // A save made by the version 1 game: five taps.
  const SAVE_V1 = fixtureSave(simmerV1, (store) => {
    for (let i = 0; i < 5; i++) store.getState().pot.tap();
  });

  // The version 2 game loads it: the step renames the field, and the burners start from `initial`.
  const { store, clock } = freshStore(simmer, { save: SAVE_V1 });
  console.log("oldest readable:", oldestReadable(simmer)); // 1
  console.log("bubblesEver:", store.getState().pot.bubblesEver.toString()); // 5

  // A save as text, and back.
  const text = store.getState().exportProfile();
  const copy = freshStore(simmer).store;
  copy.getState().importProfile(text);
  console.log("imported bubbles:", copy.getState().pot.bubbles.toString()); // 5

  // A save from a newer build: an import refuses it, a load keeps it and writes nothing.
  const newer = encodeProfile({}, 0, 3);
  try {
    copy.getState().importProfile(newer);
  } catch (e) {
    if (e instanceof SaveError) console.log("import refused:", e.code, e.data); // newer-version
  }
  console.log("loaded newer save:", saveNotice(freshStore(simmer, { save: newer }).store)); // saving somewhere else

  // Time away: three burners, two hours gone, paid at half rate.
  store.setState((s) => {
    s.burners.owned = 3;
  });
  const stop = tellReturns(store, console.log);
  clock.advance(2 * HOUR_MS);
  store.getState().catchUp(); // what the clock does when the player comes back
  stop(); // Away 120 min: +10800 bubbles
}
