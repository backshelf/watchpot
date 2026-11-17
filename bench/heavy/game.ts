// The heavy bench's game: the engine's features wired the way orbital-orchard wires them, fed by `content.ts`. No UI,
// no sound: it exists to be played headless and timed.
import {
  type Balances,
  D,
  type Decimal,
  defineCurrencies,
  defineFeature,
  defineGame,
  defineStats,
  defineUpgradeTree,
  type Move,
  offlineCredit,
  rankContributions,
  rankCost,
  type StateOf,
  type TreeActions,
  type TreeState,
  withMoves,
  ZERO,
} from "watchpot/core";
import {
  COST_GROWTH,
  type Currency,
  GENERATORS,
  type GeneratorDef,
  genStat,
  MAIN,
  NODES,
  OFFLINE_BASE,
  OFFLINE_CAP_MS,
  SLUG,
  START,
  TIERS,
  tierStat,
  WORDS,
} from "./content";

/** Every balance, under `wallet`. */
export const wallet = defineCurrencies({
  key: "wallet",
  vocab: WORDS,
  start: { [MAIN]: START },
});

/** The price of the next one of `g` when `owned` are held. */
export const generatorCost = (g: GeneratorDef, owned: number): Decimal =>
  D(g.cost).mul(D(COST_GROWTH).pow(owned)).floor();

/** The id of the generator one tier below `g`, in the same place. */
const below = (g: GeneratorDef): string | null => (g.tier === 0 ? null : `t${g.tier - 1}g${g.index}`);

/** A stat's multiplier as the stats last read it (1 when it has no record yet). */
const statOf = (stats: Record<string, Decimal>, id: string): number => (stats[id] ?? D(1)).toNumber();

/** Generators as one step worth: the stats' multipliers on each, and the chain's fractional units carried between ticks. */
interface GenState {
  owned: Record<string, number>;
  /** Coins a second for the generators held (tier 0). */
  perSecond: Decimal;
  /** Coins a second one generator of each kind makes, with every multiplier and the chain below it. */
  unit: Record<string, number>;
  /** Units of the tier below a generator has made but not yet delivered whole (saved, so a resume keeps them). */
  grown: Record<string, number>;
}

/** Makes the chain's units for `secs` seconds: every higher tier's generators deliver units to the one below. */
function growChain(s: { generators: GenState; stats: Record<string, Decimal> }, secs: number): void {
  for (const g of GENERATORS) {
    const lower = below(g);
    if (!lower) continue;
    const mult = statOf(s.stats, genStat(g.id)) * statOf(s.stats, tierStat(g.tier));
    const made = (s.generators.owned[g.id] ?? 0) * g.rate * mult * secs;
    const bank = (s.generators.grown[lower] ?? 0) + made;
    const whole = Math.floor(bank);
    s.generators.owned[lower] = (s.generators.owned[lower] ?? 0) + whole;
    s.generators.grown[lower] = bank - whole;
  }
}

/**
 * The stats, under `stats`: one multiplier per generator and per tier, each raised by the upgrades' ranks (the tree
 * feeds them as contributions). Each is a Decimal worked out from the state, never saved.
 */
export const stats = defineStats({
  key: "stats",
  vocab: WORDS,
  reach: () => [upgrades],
  stats: Object.fromEntries(
    [...GENERATORS.map((g) => genStat(g.id)), ...Array.from({ length: TIERS }, (_, t) => tierStat(t))].map(
      (id) => [id, { base: 1 }],
    ),
  ),
  contributions: (s) => rankContributions("upgrades", NODES, s.upgrades.ranks),
});

/**
 * The generators: how many of each are owned (a new profile starts with the first of tier 0), and what they make a
 * second, worked out at every tick. `unit` is read the same way as the tree's worth: what the last tick worked out.
 */
export const generators = defineFeature({
  key: "generators",
  reach: [wallet, stats],
  initial: (): GenState => ({
    owned: Object.fromEntries(GENERATORS.map((g) => [g.id, g.id === "t0g0" ? 1 : 0])),
    perSecond: ZERO,
    unit: {},
    grown: {},
  }),
  transient: ["perSecond", "unit"],
  actions: (api) => ({
    /** Buys one of `id`; false when it is unknown or the wallet is short. */
    buy: (id: string): boolean => {
      let ok = false;
      api.set((s) => {
        const g = GENERATORS.find((x) => x.id === id);
        if (!g) return;
        if (!wallet.draft.debit(s, MAIN, generatorCost(g, s.generators.owned[id] ?? 0))) return;
        s.generators.owned[id] = (s.generators.owned[id] ?? 0) + 1;
        ok = true;
      });
      return ok;
    },
  }),
  steps: {
    rates: {
      stats: (s) => {
        const unit: Record<string, number> = {};
        // Tier by tier, lowest first, so a tier's unit is the one below's already worked out.
        for (const g of GENERATORS) {
          const lower = below(g);
          const chain = lower ? (unit[lower] ?? 0) : 1;
          unit[g.id] = g.rate * statOf(s.stats, genStat(g.id)) * statOf(s.stats, tierStat(g.tier)) * chain;
        }
        s.generators.unit = unit;
        const base = GENERATORS.reduce(
          (sum, g) => (g.tier === 0 ? sum + (unit[g.id] ?? 0) * (s.generators.owned[g.id] ?? 0) : sum),
          0,
        );
        s.generators.perSecond = D(base);
      },
    },
    produce: {
      online: {
        pass: "tick",
        run: (s, ctx) => {
          const secs = ctx.dtMs / 1000;
          wallet.draft.credit(s, MAIN, s.generators.perSecond.mul(secs));
          growChain(s, secs);
        },
      },
      away: {
        pass: "catchUp",
        run: (s, ctx) => {
          const span = offlineCredit(ctx.dtMs, OFFLINE_BASE, OFFLINE_CAP_MS);
          const secs = span.creditedMs / 1000;
          wallet.draft.credit(s, MAIN, s.generators.perSecond.mul(secs));
          growChain(s, secs);
        },
      },
    },
  },
  // One move per generator: worth the coins a second one more adds.
  moves: (s) =>
    GENERATORS.map(
      (g): Move<typeof s> => ({
        id: `build:${g.id}`,
        cost: { currency: MAIN, amount: generatorCost(g, s.generators.owned[g.id] ?? 0) },
        worth: (st) => st.generators.unit[g.id] ?? 0,
        apply: (store) => store.getState().generators.buy(g.id),
      }),
    ),
});

/** What a tree move reads: the ranks, the wallet, and the generators the next rank would raise. */
interface TreeMoveState {
  upgrades: TreeState & TreeActions<Currency>;
  wallet: Balances<Currency>;
  generators: GenState;
}

/** The upgrade tree: ranks bought with the main currency, saved under `upgrades`. Its effects reach the stats. */
export const upgrades = withMoves(
  defineUpgradeTree({ key: "upgrades", nodes: NODES, wallet }),
  (s: TreeMoveState): Move<TreeMoveState>[] =>
    NODES.flatMap((node) => {
      const owned = s.upgrades.ranks[node.id] ?? 0;
      if (owned >= node.maxLevel || node.requires.some((r) => !(s.upgrades.ranks[r] ?? 0))) return [];
      const [price] = rankCost(node, owned);
      if (!price) return [];
      return [
        {
          id: `upgrade:${node.id}`,
          cost: price,
          // Worth: the coins a second the ranks it raises add, from the generators each stat covers.
          worth: (st) =>
            node.effects.reduce((sum, e) => {
              const gain = Number(e.mul ?? 1) - 1;
              const covered = GENERATORS.filter(
                (g) => e.stat === genStat(g.id) || e.stat === tierStat(g.tier),
              );
              return (
                sum +
                covered.reduce(
                  (acc, g) => acc + (st.generators.unit[g.id] ?? 0) * (st.generators.owned[g.id] ?? 0) * gain,
                  0,
                )
              );
            }, 0),
          apply: (store) => store.getState().upgrades.buy(node.id).ok,
        },
      ];
    }),
);

export const game = defineGame({
  id: SLUG,
  save: { key: `${SLUG}.save`, version: 1 },
  vocab: WORDS,
  features: [wallet, upgrades, stats, generators],
});

export type GameState = StateOf<typeof game.features>;
