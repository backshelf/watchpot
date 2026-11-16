import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineGame,
  defineSeenOnce,
  defineSettings,
  feature,
  ZERO,
} from "watchpot/core";

/** The player's choices, saved with the profile: they travel in an export and come back on another machine. */
export interface Choices {
  sound: boolean;
  motion: "system" | "reduced" | "full";
  scheme: "system" | "light" | "dark";
}

export const choices = defineSettings({
  key: "settings",
  initial: (): Choices => ({ sound: true, motion: "system", scheme: "system" }),
});

/** What the player has been shown once: the stove's first tip, the shop's new mark. The ids are the game's. */
export const intro = defineSeenOnce({ key: "intro" });
export const TIPS = { stove: "tip.stove", shop: "tab.shop" } as const;

/** Simmer's pot, so a run reset has something to clear. */
export const pot = feature({
  key: "pot",
  initial: () => ({ bubbles: ZERO }),
  actions: (api) => ({
    tap: () =>
      api.set((d) => {
        d.pot.bubbles = d.pot.bubbles.add(1);
      }),
    boilDry: () => api.set((d) => api.resetRun(d)),
  }),
});

export const game = defineGame({
  id: "simmer-settings",
  save: { key: "simmer-settings.save", version: 1 },
  features: [choices, intro, pot],
});

if (import.meta.main) {
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend()),
    now: () => Date.UTC(2026, 0, 1),
  });
  const s = () => store.getState();

  s().settings.change({ sound: false });
  console.log("first stove tip new?", s().intro.see(TIPS.stove), "| again?", s().intro.see(TIPS.stove));
  s().intro.seeAll([TIPS.stove, TIPS.shop]);
  s().pot.tap();

  const before = s();
  s().intro.seeAll([TIPS.stove, TIPS.shop]); // nothing new: no change, no write
  console.log("a repeat seeAll leaves the state alone:", s() === before);

  s().pot.boilDry();
  console.log(
    "after a run reset: bubbles",
    s().pot.bubbles.toNumber(),
    "| sound",
    s().settings.sound,
    "| seen",
    Object.keys(s().intro.seen),
  );
  s().intro.forget(TIPS.stove);
  console.log("forgotten, the tip is new again:", s().intro.seen[TIPS.stove] !== true);
}
