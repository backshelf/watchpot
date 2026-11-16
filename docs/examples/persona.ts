import { DAY_MS, HOUR_MS, type StateOf } from "watchpot/core";
import { autoPlayer, createSimWorld, fixedSchedule, playDays, rngFor, simStore } from "watchpot/sim";
import { fixtureSave } from "watchpot/test";
import { game } from "./add-a-generator";

type GameState = StateOf<typeof game.features>;

/**
 * A persona is a player. The sim's `autoPlayer` needs no code of its own: it reads every feature's `moves` and
 * buys the best-value affordable one, again until none is. A schedule says when the tab is open.
 */
export function playThreeDays(seed = "persona") {
  const start = Date.UTC(2026, 0, 1, 8);
  const world = createSimWorld((now) => simStore(game, now, seed), start); // one catch-up at the start
  const player = autoPlayer(game, {
    balance: (s: GameState, currency) => s.wallet[currency as "gold" | "gems"],
  });
  let looks = 0;
  playDays({
    world,
    schedule: fixedSchedule(8, 23, 15, 0), // open 08:00 to 23:00, a look every 15 minutes
    days: 3,
    start,
    rng: rngFor(seed, "auto"),
    look: () => {
      player.look(world.store);
      looks += 1;
    },
  });
  const s = world.store.getState();
  return {
    looks,
    owned: s.generator.owned,
    gold: s.wallet.gold.toNumber(),
    hours: (world.now() - start) / HOUR_MS,
  };
}

/** The same idea as a test fixture: a persona that plays a store by hand, saved as a permanent file. */
export const fixture = () =>
  fixtureSave(game, (store, clock) => {
    store.getState().wallet.credit("gold", 500);
    store.getState().generator.buy();
    store.getState().tick(DAY_MS / 24, clock.advance(DAY_MS / 24));
  });

if (import.meta.main) console.log(playThreeDays());
