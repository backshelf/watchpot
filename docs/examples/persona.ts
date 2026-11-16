import { DAY_MS, HOUR_MS, type StateOf } from "watchpot/core";
import {
  activeSchedule,
  autoPlayer,
  createSimWorld,
  nominalWakeHour,
  playDays,
  rngFor,
  simStore,
} from "watchpot/sim";
import { type FixturePlay, fixtureSave } from "watchpot/test";
import { game } from "./add-a-generator";

type GameState = StateOf<typeof game.features>;

/** A player at the game the whole time: a look every 10 seconds, so every hour of the run is a played hour. */
const ACTIVE = activeSchedule(10);

/**
 * The sim's player is the auto-player, and it needs no code of its own: it reads every feature's `moves` and buys
 * the best-value affordable one, again until none is. A schedule says when the tab is open.
 */
export function playAnHour(seed = "auto") {
  const start = Date.UTC(2026, 0, 1, nominalWakeHour(ACTIVE));
  const world = createSimWorld((now) => simStore(game, now, seed), start); // one catch-up at the start
  // No `balance`: the game has one wallet, so the auto-player reads what it holds there. A move with no worth is
  // worth what it adds to the objective: the generator's gold a second.
  const player = autoPlayer(game, { objective: (s: GameState) => s.generator.perSecond.toNumber() });
  let looks = 0;
  let bought = 0;
  playDays({
    world,
    schedule: ACTIVE,
    days: 1,
    hours: 1, // stop after the look that crosses the first played hour
    start,
    rng: rngFor(seed, "auto"),
    look: () => {
      bought += player.look(world.store).bought;
      looks += 1;
    },
  });
  const s = world.store.getState();
  return { looks, bought, owned: s.generator.owned, hours: (world.now() - start) / HOUR_MS };
}

/** A fixture play: plain calls on a store, which `fixtureSave` turns into the same save string every time. */
const play: FixturePlay<GameState> = (store, clock) => {
  store.getState().wallet.credit("gold", 500);
  store.getState().generator.buy();
  store.getState().tick(DAY_MS / 24, clock.advance(DAY_MS / 24));
};

export const fixture = () => fixtureSave(game, play);

if (import.meta.main) {
  console.log(playAnHour());
  const save = fixture();
  console.log("fixture is stable:", save === fixture());
}
