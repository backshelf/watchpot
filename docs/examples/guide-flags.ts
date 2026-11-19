/**
 * An upgrade whose effect is not a number: one shop node whose `effects` are empty, the flag it raises, and the two
 * places the game reads that flag. The workshop is the whole game: a stoke pays the fire's glow, and the second grate
 * — once bought — both opens its own page and switches a step on.
 *
 * The stats feature is where a game's flags live: a source that counts raises a flag beside its effects (here it has
 * none), and every rule asks `s.numbers.flags`. Run it with `bun docs/examples/guide-flags.ts`: it buys the grate on a
 * fake clock and prints the flag, the room and the coals a second.
 */
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineCurrencies,
  defineFeature,
  defineGame,
  defineStats,
  defineUpgradeTree,
  fmt,
  type StateOf,
  vocab,
} from "watchpot/core";

/** The game's words: coals to spend, and the one stat the fire is read at. */
export const WORDS = vocab({ currencies: ["coals"], stats: ["glow"] });

/** The wallet: a balance of coals. */
export const wallet = defineCurrencies({ key: "wallet", vocab: WORDS });

/**
 * The shop: one node, bought once, with no effects at all. What it buys is the flag the source below raises: the
 * shop only says what it costs and what it is called.
 */
export const grate = defineUpgradeTree({
  key: "grate",
  wallet,
  nodes: [
    {
      id: "second-grate",
      name: "A second grate",
      line: "The fire starts drawing on its own.",
      cost: [{ currency: "coals", amount: 15 }],
      maxLevel: 1,
      requires: [],
      effects: [],
    },
  ],
});

/**
 * The source the flag comes from: it counts while the second grate is bought, and its whole doing is the flag. The
 * page's control empties `flags` to unwrite it: the grate is still bought, and the flag is gone.
 */
export const SECOND_GRATE = {
  label: "A second grate",
  owner: "grate",
  active: (s: { grate: { ranks: Record<string, number> } }) => (s.grate.ranks["second-grate"] ?? 0) > 0,
  flags: ["second-grate"],
} as const;

/**
 * The stats: the fire's glow, and the game's flags. A source with no effects still counts, and a counting source's
 * flags are raised: `s.numbers.flags["second-grate"]` is true while the second grate is bought.
 */
export const numbers = defineStats({
  key: "numbers",
  vocab: WORDS,
  reach: [grate],
  stats: { glow: { base: 1 } },
  flags: ["second-grate"],
  sources: [SECOND_GRATE],
});

/** The fire: a stoke pays its glow; with the second grate bought, the fire also draws a glow a second by itself. */
export const fire = defineFeature({
  key: "fire",
  reach: () => [wallet, numbers],
  initial: () => ({ stokes: 0 }),
  actions: (api) => ({
    stoke: () =>
      api.set((s) => {
        // A second grate burns hotter: the flag doubles what a press pays.
        const pay = s.numbers.flags["second-grate"] === true ? s.numbers.glow.mul(2) : s.numbers.glow;
        wallet.draft.credit(s, "coals", pay);
        s.fire.stokes += 1;
      }),
  }),
  steps: {
    produce: {
      // The rule the flag switches: no second grate, no draw.
      grate: {
        pass: "both",
        run: (s, ctx) => {
          if (!s.numbers.flags["second-grate"]) return;
          wallet.draft.credit(s, "coals", s.numbers.glow.mul(ctx.dtMs / 1000));
        },
      },
    },
  },
});

/** The game. The order of the features is not the order they read: `reach` says who reads whom. */
export const game = defineGame({
  id: "workshop",
  save: { key: "workshop.save", version: 1 },
  vocab: WORDS,
  features: [wallet, grate, numbers, fire],
});

/** Whether the second grate is open: the flag the panel and the step both ask about. */
export const hasGrate = (s: StateOf<typeof game.features>): boolean =>
  s.numbers.flags["second-grate"] === true;

/** The shop's one row: the node's name, its price, and whether the wallet covers it. */
export function grateRow(s: StateOf<typeof game.features>) {
  const node = grate.def.nodes[0];
  if (!node) throw new Error("the workshop has no shop node");
  const owned = s.grate.ranks[node.id] ?? 0;
  const next = grate.def.tree.price(node, owned)?.[0];
  return {
    name: node.name,
    owned,
    price: next ? fmt(next.amount).text : null,
    canBuy: grate.select.check(s, node.id) === null,
  };
}

if (import.meta.main) {
  let t = Date.UTC(2026, 0, 1);
  const store = createIdleStore(game, {
    now: () => t,
    storage: createGameStorage(createMemoryBackend()),
  });
  for (let i = 0; i < 20; i++) store.getState().fire.stoke();
  console.log("before:", hasGrate(store.getState()), "coals:", fmt(store.getState().wallet.coals).text);
  console.log("bought the grate:", store.getState().grate.buy("second-grate").ok);
  const before = store.getState().wallet.coals;
  for (let i = 0; i < 10; i++) {
    t += 1000;
    store.getState().tick(1000);
  }
  const s = store.getState();
  console.log("the flag:", hasGrate(s), "drew:", fmt(s.wallet.coals.sub(before)).text, "in 10s");
}
