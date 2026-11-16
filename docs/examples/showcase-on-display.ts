import { defineGame, type Effect, feature, levels, type XpCurve } from "watchpot/core";

/** A minute for the first level, each after it half again as long. */
const SLOW: XpCurve = { kind: "geometric", base: 60, growth: 1.5 };

const DISHES = ["soup", "stew", "broth"] as const;

/** One track per dish. Its XP is seconds: how long the dish has sat in the window. */
export const fame = levels({
  key: "fame",
  tracks: DISHES.map((id) => ({ id, curve: SLOW })),
  maxLevel: 10,
  effects: (_track, level): Effect[] => [{ stat: "price", mul: 1 + 0.1 * level }],
});

/** The window: two dishes on show at a time, picked by the player. */
export const shopWindow = feature({
  key: "window",
  reach: [fame],
  initial: () => ({ shown: ["soup"] as string[] }),
  actions: (api) => ({
    show: (ids: readonly string[]) =>
      api.set((s) => {
        s.window.shown = ids.slice(0, 2);
      }),
  }),
  steps: {
    produce: {
      // Every pass, the tab open or a catch-up after an absence: each dish on show gains its seconds.
      age: {
        pass: "both",
        run: (d, ctx) => {
          for (const id of d.window.shown) fame.draft.gain(d, id, ctx.dtMs / 1000);
        },
      },
    },
  },
});

export const game = defineGame({
  id: "window",
  save: { key: "window.save", version: 1 },
  features: [fame, shopWindow],
});
// fame.select.progress(state, "soup") → { level, into, need, share }: the bar under the dish
