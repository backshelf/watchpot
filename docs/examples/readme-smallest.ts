import { createIdleStore, D, defineGame, feature, startGameClock } from "watchpot/core";

const bakery = feature({
  key: "bakery",
  initial: () => ({ loaves: D(0), ovens: 1 }),
  derived: { perSecond: (s) => D(s.bakery.ovens) },
  actions: (api) => ({
    bake: () =>
      api.set((s) => {
        s.bakery.loaves = s.bakery.loaves.add(1);
      }),
    buyOven: () =>
      api.set((s) => {
        s.bakery.ovens += 1;
      }),
  }),
  steps: {
    produce: {
      ovens: {
        pass: "both",
        run: (s, ctx) => {
          s.bakery.loaves = s.bakery.loaves.add(s.bakery.perSecond.mul(ctx.dtMs / 1000));
        },
      },
    },
  },
});

export const game = defineGame({
  id: "bakery",
  save: { key: "bakery.save", version: 1 },
  features: [bakery],
});
export const store = createIdleStore(game, { now: () => Date.now() });
export const stopClock = startGameClock(store); // one catch-up for time away, then ticking; it saves too
