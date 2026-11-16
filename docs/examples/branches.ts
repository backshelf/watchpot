import {
  type AwayGap,
  adoptBranch,
  branchStore,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  type Draft,
  defineGame,
  feature,
  fmt,
  nextFloat,
  type PlainStore,
  type RngState,
  type StateOf,
  seedRng,
  startGameClock,
} from "watchpot/core";

/**
 * A cellar that ages wine while nobody is in it. Each absence, a draw on the cellar's own saved stream decides how
 * the vintage went: the `luck` it lands on multiplies what the time away pays.
 */
export const cellar = feature({
  key: "cellar",
  initial: (ctx) => ({ bottles: D(10), rng: ctx.rng, luck: 1 }),
  steps: {
    produce: {
      age: {
        pass: "catchUp",
        run: (s, ctx) => {
          if (ctx.dtMs <= 0) return;
          const [roll, next] = nextFloat(s.cellar.rng);
          s.cellar.rng = next as Draft<RngState>;
          s.cellar.luck = 0.5 + roll * 2;
          s.cellar.bottles = s.cellar.bottles.add((ctx.dtMs / 1000) * s.cellar.luck);
        },
      },
    },
  },
});

export const game = defineGame({
  id: "cellar",
  save: { key: "cellar.save", version: 1 },
  features: [cellar],
});
type State = StateOf<typeof game.features>;

/**
 * Three ways the absence could have gone: three branches cut from the store as the player left it, each given its
 * own draws (the stream is reseeded from the saved one and the branch's number), each caught up over the same gap.
 */
export function waysItWent(store: { getState(): State }, at: number, count = 3): PlainStore<State>[] {
  const [stem] = nextFloat(store.getState().cellar.rng);
  return Array.from({ length: count }, (_, i) => {
    const branch = branchStore(game, store, { now: () => at });
    branch.setState((s) => {
      s.cellar.rng = seedRng(`${stem}:${i}`);
    });
    branch.getState().catchUp(at);
    return branch;
  });
}

if (import.meta.main) {
  const T0 = Date.UTC(2026, 0, 5, 8);
  let wall = T0;
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend()),
    now: () => wall,
    seed: "cellar",
  });
  let fire = () => {};
  let ways: PlainStore<State>[] = [];
  let gap: AwayGap | null = null;
  // The clock offers each absence before it credits it. Held, the store stays as the player left it.
  startGameClock(store, {
    visibility: null,
    schedule: (fn) => {
      fire = fn;
      return 1;
    },
    cancel: () => {},
    away: (g) => {
      gap = g;
      ways = waysItWent(store, g.at);
      return "hold";
    },
  });
  wall += 10 * 60_000; // ten minutes with the tab closed
  fire();
  console.log("held:", fmt(store.getState().cellar.bottles).text, "bottles, as the player left them");
  for (const [i, way] of ways.entries()) {
    const s = way.getState().cellar;
    console.log(`way ${i + 1}: luck ×${s.luck.toFixed(2)} → ${fmt(s.bottles).text} bottles`);
  }
  // The player picks the best year; the store takes that branch's state, and the clock carries on.
  const best = ways.reduce((a, b) => (b.getState().cellar.bottles.gt(a.getState().cellar.bottles) ? b : a));
  adoptBranch(store, best);
  (gap as AwayGap | null)?.release();
  console.log("adopted:", fmt(store.getState().cellar.bottles).text, "bottles");
}
