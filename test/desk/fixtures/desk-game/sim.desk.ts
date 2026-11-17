// A tiny desk for the run service's tests: one currency, one knob (its income a second), one gate at 1 h.
import { D, defineFeature, defineGame, defineKnobs, type StateOf, vocab } from "../../../../src/core";
import {
  autoPlayer,
  createSimWorld,
  defineDesk,
  type FitGate,
  fitTable,
  resumeSimWorld,
  type SimSnapshot,
  simStore,
} from "../../../../src/sim";

const HOUR = 3_600_000;
const words = vocab({ currencies: ["coins"], stats: [], rarities: ["common"] } as const);
const knobs = defineKnobs({
  rate: { value: 2, label: "Income a second", group: "Economy", min: 0, max: 100 },
});

const mine = defineFeature({
  key: "mine",
  initial: () => ({ coins: D(0) }),
  steps: {
    produce: {
      flow: {
        pass: "both",
        run: (s, ctx) => {
          s.mine.coins = s.mine.coins.add(D(knobs.get("rate")).mul(ctx.dtMs / 1000));
        },
      },
    },
  },
});
const game = defineGame({ id: "desk-game", save: { key: "desk-game", version: 1 }, features: [mine] });
type State = StateOf<(typeof game)["features"]>;

const table = fitTable<"g1">();

export default defineDesk({
  vocab: words,
  knobs,
  currency: "coins",
  source: ["sim.desk.ts"],
  windowHours: 1,
  end: { hours: 3 },
  seeds: { tuning: 1, full: 2 },
  fit: { quality: "quick" },
  run({ seed, from }: { seed: number; from?: SimSnapshot }) {
    const build = (now: () => number) => simStore(game, now, seed);
    const world = from ? resumeSimWorld(build, from.world) : createSimWorld(build, Date.UTC(2026, 0, 5, 8));
    const player = autoPlayer<State>(game, { balance: (s) => s.mine.coins, memory: from?.player });
    let played = from?.atMs ?? 0;
    const state = () => world.store.getState() as unknown as State;
    const gates: FitGate[] = [{ key: "g1", atMs: HOUR, price: () => "1" }];
    return {
      table,
      gates,
      step: (dt: number) => {
        world.play(dt);
        played += dt;
      },
      look: () => {
        player.look(world.store as never);
      },
      playedMs: () => played,
      capture: () => ({ world: world.snapshot(), player: player.remember() }),
      sample: () => ({ currencies: { coins: state().mine.coins } }),
    };
  },
});
