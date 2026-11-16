/**
 * Guide chapter 9, saving and time away: Simmer from `simmer/game-wallet.ts` as it ships (save version 1), then a
 * version 2 that renames a saved field and carries the step that moves it, a notice that says why the save is not
 * being kept, and a report of what the stove made while the player was away.
 * Run it with `bun docs/examples/guide-saving.ts`.
 */
import {
  clearSave,
  createIdleStore,
  defineFeature,
  defineGame,
  encodeProfile,
  HOUR_MS,
  type Migration,
  offlineCredit,
  oldestReadable,
  type SaveBlockedBy,
  SaveError,
  saveBlockedBy,
  savedRecord,
  saveSetAside,
  saveStatus,
} from "watchpot/core";
import { awayGains, watchAway } from "watchpot/react";
import { fixtureSave, freshStore } from "watchpot/test";
import {
  AWAY_CAP_MS,
  game,
  lid,
  OFFLINE_RATE,
  SIMMER_PER_SECOND,
  stats,
  stove,
  WORDS,
  wallet,
} from "./simmer/game-wallet";

// --- Version 2: the pot's `taps` is renamed, so the save needs a step -------------------------------------------

/** Version 2: `taps` is now `presses`. The step sees only the pot's own saved data. */
const renameTaps: Migration = (saved) => {
  const { taps, ...rest } = savedRecord(saved);
  return { ...rest, presses: taps };
};

/** The pot at version 2: the same pot, its count renamed, with the step that brings a version 1 save across. */
const pot = defineFeature({
  key: "pot",
  reach: [wallet],
  initial: () => ({ presses: 0 }),
  migrations: { 2: renameTaps },
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        wallet.draft.credit(s, "bubbles", 1);
        s.pot.presses += 1;
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

export const simmerV2 = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 2 },
  vocab: WORDS,
  features: [wallet, pot, stove, lid, stats],
});

/** The store a page builds: saved to localStorage, or held in memory (and said so) where there is none. */
export const createSimmerStore = () => createIdleStore(simmerV2, { now: Date.now });

type SimmerStore = ReturnType<typeof createSimmerStore>;
type SimmerState = ReturnType<SimmerStore["getState"]>;

// --- Telling the player how the save is doing ------------------------------------------------------------------

/** Why this tab writes nothing, in the player's words. */
const BLOCKED: Record<SaveBlockedBy, string> = {
  newer: "This is an older copy of Simmer. Your progress is safe in the newer one: reload to play it.",
  taken: "Simmer is open in another tab. Play there, or reload this one.",
  unreadable: "Simmer could not read your save, so it left it alone. Nothing here is being saved.",
  cleared: "Your save is deleted. Reload to start again.",
};

/** What a save notice says, or null while the save is being kept. Read it again whenever `watchSave` calls. */
export function saveNotice(store: SimmerStore): string | null {
  switch (saveStatus(store)) {
    case "unsaved":
      return "This browser is not keeping your progress.";
    case "blocked":
      return BLOCKED[saveBlockedBy(store) ?? "taken"];
    default:
      return null;
  }
}

/** What to tell a player whose save could not be brought forward, or null when it loaded. */
export function setAsideNotice(store: SimmerStore): string | null {
  switch (saveSetAside(store)) {
    case "old-version":
      return "Your save was too old for this version of Simmer. It is kept, and you are starting again.";
    case "migration-failed":
      return "Simmer could not update your save. It is kept, and you are starting again.";
    default:
      return null;
  }
}

/** The "delete my save" button: nothing pending or flushed on hide can put it back. Then a fresh page. */
export async function startOver(store: SimmerStore): Promise<void> {
  await clearSave(store);
  location.reload();
}

// --- Telling the player what happened while they were away ---------------------------------------------------------

/** Calls `tell` with one line after every return worth telling. Returns the remover. */
export function tellReturns(store: SimmerStore, tell: (line: string) => void): () => void {
  return watchAway<SimmerState>(store, ({ before, after, ms }) => {
    const gains = awayGains(before, after, { bubbles: (s) => s.wallet.earned });
    const minutes = Math.round(ms / 60_000);
    // The same arithmetic the stove's `away` step does, to say whether the cap cut the absence short.
    const { capped } = offlineCredit(ms, OFFLINE_RATE, AWAY_CAP_MS);
    const note = capped ? " (the stove stopped after two hours)" : "";
    for (const { id, gain } of gains) tell(`Away ${minutes} min: +${gain.toFixed(0)} ${id}${note}`);
  });
}

// --- Trying it -------------------------------------------------------------------------------------------------------

if (import.meta.main) {
  // A save made by the version 1 game: five taps.
  const SAVE_V1 = fixtureSave(game, (store) => {
    for (let i = 0; i < 5; i++) store.getState().pot.tap();
  });

  // The version 2 game loads it: the step renames the field, and the store writes it back at version 2.
  const { store, backend, clock } = freshStore(simmerV2, { save: SAVE_V1 });
  console.log("oldest readable:", oldestReadable(simmerV2)); // 1
  const { pot: loaded, wallet: held } = store.getState();
  console.log("presses:", loaded.presses, "bubbles:", held.bubbles.toString()); // 5 and 5
  console.log(backend.getItem("simmer.save"));

  // A save as text, and back.
  const text = store.getState().exportProfile();
  const copy = freshStore(simmerV2).store;
  copy.getState().importProfile(text);
  console.log("imported bubbles:", copy.getState().wallet.bubbles.toString()); // 5

  // A save from a newer build: an import refuses it, a load keeps it and writes nothing.
  const newer = encodeProfile({}, 0, 3);
  try {
    copy.getState().importProfile(newer);
  } catch (e) {
    if (e instanceof SaveError) console.log("import refused:", e.code, e.data); // newer-version
  }
  console.log("loaded newer save:", saveNotice(freshStore(simmerV2, { save: newer }).store));

  // A save older than any step reaches: set aside under `simmer.save.kept`, and a fresh profile.
  const ancient = freshStore(simmerV2, { save: encodeProfile({}, 0, 0) }).store;
  console.log("loaded ancient save:", setAsideNotice(ancient));

  // Time away: three burners, three hours gone. The pot pays it all; the stove pays half, for two hours at most.
  store.setState((s) => {
    s.stove.burners = 3;
  });
  const stop = tellReturns(store, console.log);
  clock.advance(3 * HOUR_MS);
  store.getState().catchUp(); // what the clock does when the player comes back
  stop();
}
