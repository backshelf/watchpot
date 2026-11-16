// The sim plays on the plain store (`simStore`), not the real one: this plays one seed through both, the auto-player
// acting on each, and names the first field they part on. A feature written with something only the real store
// has (an immer draft escaping a step, a state read through a stale reference) fails here, not in a fit's numbers.
import { expect, test } from "bun:test";
import { autoPlayer } from "watchpot/sim";
import { plainParity } from "watchpot/test";
import { type GameState, game } from "../src/game/game";

test("the plain store plays the game as the real store does", () => {
  const players = { real: autoPlayer<GameState>(game), plain: autoPlayer<GameState>(game) };
  expect(plainParity(game, { act: (store, _step, which) => void players[which].look(store as never) })).toBeNull();
});
