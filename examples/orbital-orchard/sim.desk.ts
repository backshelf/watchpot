/**
 * The orchard on the sim desk (`bun run desk`): its knobs (`src/content/knobs.ts`) as sliders, one unbroken run on the
 * engine's auto-player drawn as pace graphs. The desk calls `run` once per seed, steps it, and asks `sample` for the
 * balances. The world and the auto-player are built the way `sim/run.ts` builds them. A game copies this file's
 * shape: swap the game, the balance reader and the generators' list.
 */
import { type Decimal, ZERO } from "watchpot/core";
import {
  autoPlayer,
  createSimWorld,
  defineDesk,
  type FitGate,
  fitTable,
  resumeSimWorld,
  type SimSnapshot,
  simStore,
} from "watchpot/sim";
import { GENERATORS } from "./src/content/generators";
import { knobs } from "./src/content/knobs";
import { type Currency, MAIN, PREMIUM, WORDS } from "./src/content/words";
import { type GameState, game } from "./src/game/game";
import { generatorCost } from "./src/game/generators";

/** A Monday, 08:00 local: where a fresh run starts (the same as `sim/run.ts`). */
const START = new Date(2026, 0, 5, 8, 0, 0).getTime();

/** One generator's next price, as the desk reads it. */
type Next = { currency: Currency; cost: Decimal };

/** The orchard has no fitted prices: its prices are the knobs' formula, so the table is empty and no gate is set. */
const table = fitTable();

export default defineDesk({
  vocab: WORDS,
  knobs,
  // What the generators cost: progress is measured in it.
  currency: MAIN,
  // Files whose change drops a cached run. Not `sim.tuning.json`: Save writes it, and a knob change is not a code change.
  source: ["src/**/*.ts", "sim.desk.ts"],
  windowHours: 2,
  end: { hours: 24 },
  seeds: { tuning: 1, full: 8 },
  fit: { quality: "quick" },
  run({ seed, from }: { seed: number; from?: SimSnapshot }) {
    const build = (now: () => number) => simStore(game, now, seed);
    const world = from ? resumeSimWorld(build, from.world) : createSimWorld(build, START);
    const state = () => world.store.getState() as unknown as GameState;
    const player = autoPlayer<GameState>(game, {
      // The wallet's currencies, else the shower's (its shards buy its tree): the same reader as `sim/run.ts`.
      balance: (s, currency) =>
        (s.wallet as unknown as Record<string, Decimal>)[currency] ??
        s.events.runtime.currencies[currency] ??
        ZERO,
      memory: from?.player,
    });
    let played = from?.atMs ?? 0;
    return {
      table,
      gates: [] as FitGate[],
      step: (dt: number) => {
        world.play(dt);
        played += dt;
      },
      look: () => {
        player.look(world.store as never);
      },
      playedMs: () => played,
      capture: () => ({ world: world.snapshot(), player: player.remember() }),
      sample: () => {
        const s = state();
        return {
          // Every currency's balance.
          currencies: { sunlight: s.wallet[MAIN], seeds: s.wallet[PREMIUM] },
          // The price of the next one of each generator, in the currency it costs.
          next: Object.fromEntries(
            GENERATORS.map((g): [string, Next] => [
              g.id,
              { currency: MAIN, cost: generatorCost(g, s.generators.owned[g.id] ?? 0) },
            ]),
          ),
        };
      },
    };
  },
});
