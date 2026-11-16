// How a game is played headless and checked on the 1.0 engine, on the example game of `invention.ts`. A scaffolded game
// already has all of this (`sim/run.ts`, `test/parity.test.ts`, `test/decimals.test.ts`); this is what each line is for.
//
// Type-checked with the engine. The two tests at the foot are written as they sit in a game's `test/` folder.
import { expect, test } from "bun:test";
import { HOUR_MS } from "watchpot/core";
import { autoPlayer, createSimWorld, playStraight, simStore } from "watchpot/sim";
import { decimalComparisons, plainParity } from "watchpot/test";
import { type GameState, game } from "./invention";

const START = Date.UTC(2026, 0, 5, 8);

/** What the player is trying to grow: income a second. */
const objective = (s: GameState): number => s.furnace.perSecond.toNumber();

/**
 * One played hour: the sim runs on plain data (`simStore`), so it is fast; the auto-player buys what each feature's
 * `moves` offer. `objective` is what the player is trying to grow, read off the state: a move that states no `worth`
 * is worth what buying it adds to it, tried on the state and put back. A move that does not move the objective at
 * once (an unlock, a cap, a reset) states its own `worth`, as the prestige layer does.
 */
export function playOneHour(): GameState {
  const world = createSimWorld((now) => simStore(game, now, "sim"), START);
  const player = autoPlayer<GameState>(game, { objective });
  playStraight({
    world,
    ms: HOUR_MS,
    lookEveryMs: 10_000,
    look: () => void player.look(world.store as never),
  });
  return world.store.getState() as unknown as GameState;
}

// The plain store the sim runs on and the real store the page runs on must agree: one test, once per game. A
// feature that works on the real store and not the plain one fails here, named by field, not in a fit's numbers.
test("the plain store plays the game as the real store does", () => {
  const players = {
    real: autoPlayer<GameState>(game, { objective }),
    plain: autoPlayer<GameState>(game, { objective }),
  };
  const act = (store: unknown, _step: number, which: "real" | "plain") =>
    void players[which].look(store as never);
  expect(plainParity(game, { act })).toBeNull();
});

// A Decimal compared with `<` or `===` compiles and is wrong. This asks the type checker for every comparison in the
// game's own code and lists each `file:line` that compares two Decimals (it needs `typescript` 7).
test("no Decimal is compared with an operator", async () => {
  expect(await decimalComparisons({ tsconfig: "tsconfig.json", under: ["src", "sim"] })).toEqual([]);
});
