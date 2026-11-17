import { expect, test } from "bun:test";
import { createPlainStore, defineCurrencies, defineGame, defineGenerators, vocab } from "watchpot/core";
import { type AutoStore, autoPlayer } from "watchpot/sim";

const WORDS = vocab({ currencies: ["bubbles"] });
const wallet = defineCurrencies({ key: "wallet", vocab: WORDS, start: { bubbles: 15 } });
const kettles = defineGenerators({
  key: "kettles",
  wallet,
  list: [
    { id: "kettle", pays: "bubbles", makes: "bubbles", rate: 1, cost: { base: 10, growth: 1.15 } },
    { id: "urn", pays: "bubbles", makes: "bubbles", rate: 8, cost: { base: 100, growth: 1.2 } },
  ],
});
const game = defineGame({
  id: "automemo",
  save: { key: "automemo.save", version: 1 },
  vocab: WORDS,
  features: [wallet, kettles],
});

type S = { kettles: { owned: Record<string, number> } };

const play = (hide: boolean): string[] => {
  const store = createPlainStore(game, { now: () => 0, seed: "s" });
  const seen: AutoStore<S> = hide
    ? { getState: () => store.getState() as unknown as S, trial: (run) => store.trial(run) }
    : (store as unknown as AutoStore<S>);
  const player = autoPlayer<S>(game, {
    objective: (s) => Object.values(s.kettles.owned).reduce((a, b) => a + b, 0),
    quiet: true,
  });
  const log: string[] = [];
  for (let i = 0; i < 200; i++) {
    store.getState().tick(5_000);
    const before = JSON.stringify(store.getState().kettles.owned);
    player.look(seen);
    log.push(`${i}:${before}>${JSON.stringify(store.getState().kettles.owned)}`);
  }
  return log;
};

test("an auto-player makes the same purchases with and without the store's memo", () => {
  const without = play(true);
  const withMemo = play(false);
  expect(withMemo).toEqual(without);
  expect(withMemo.at(-1)).not.toBe(withMemo[0]);
});
