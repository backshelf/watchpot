import { D, type Decimal, feature, type Move, offlineCredit, ZERO } from "watchpot/core";
import { COST_GROWTH, GENERATORS, type GeneratorDef, OFFLINE_CAP_MS } from "../content/generators";
import { MAIN } from "../content/words";
import { collection } from "./gacha";
import { ascension } from "./prestige";
import { offlineOf, outputOf, statBus } from "./stats";
import { upgrades } from "./tree";
import { wallet } from "./wallet";

/** The price of the next one of `g` when `owned` are held. */
export const generatorCost = (g: GeneratorDef, owned: number): Decimal =>
  D(g.cost).mul(D(COST_GROWTH).pow(owned)).floor();

/**
 * The generators: how many of each are owned (a new profile starts with one of the first), and what they make a
 * second with the stats applied. `perSecond`, `output` and `offline` are worked out at every tick and never saved.
 */
export const generators = feature({
  key: "generators",
  reach: [wallet, upgrades, collection, ascension],
  initial: () => ({
    owned: Object.fromEntries(GENERATORS.map((g, i) => [g.id, i === 0 ? 1 : 0])) as Record<string, number>,
    perSecond: ZERO,
    output: 1,
    offline: 0,
  }),
  transient: ["perSecond", "output", "offline"],
  actions: (api) => ({
    /** Buys one of `id`; false when it is unknown or the wallet is short. */
    buy: (id: string): boolean => {
      let ok = false;
      api.set((s) => {
        const g = GENERATORS.find((x) => x.id === id);
        if (!g) return;
        if (!wallet.debit(s, MAIN, generatorCost(g, s.generators.owned[id] ?? 0))) return;
        s.generators.owned[id] = (s.generators.owned[id] ?? 0) + 1;
        ok = true;
      });
      return ok;
    },
  }),
  steps: {
    rates: {
      stats: (s) => {
        const bus = statBus(s);
        s.generators.output = outputOf(bus);
        s.generators.offline = offlineOf(bus);
        const base = GENERATORS.reduce((sum, g) => sum + g.rate * (s.generators.owned[g.id] ?? 0), 0);
        s.generators.perSecond = D(base).mul(s.generators.output);
      },
    },
    produce: {
      online: {
        pass: "tick",
        run: (s, ctx) => wallet.credit(s, MAIN, s.generators.perSecond.mul(ctx.dtMs / 1000)),
      },
      away: {
        pass: "catchUp",
        run: (s, ctx) => {
          const span = offlineCredit(ctx.dtMs, s.generators.offline, OFFLINE_CAP_MS);
          wallet.credit(s, MAIN, s.generators.perSecond.mul(span.creditedMs / 1000));
        },
      },
    },
  },
  // One move per generator: worth the production it adds a second.
  moves: (s) =>
    GENERATORS.map(
      (g): Move<typeof s> => ({
        id: `build:${g.id}`,
        cost: { currency: MAIN, amount: generatorCost(g, s.generators.owned[g.id] ?? 0) },
        value: (st) => g.rate * st.generators.output,
        apply: (store) => store.getState().generators.buy(g.id),
      }),
    ),
});
