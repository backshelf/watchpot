// The game this page runs: a pot, some heat under it, and a valve. It is the site's own toy, small on purpose, and
// every rule in it is an engine system: `currencies`, `generators`, `prestige`, the store, the clock, the save.
// The same definition is played by the visitor (or the auto-player) above and by the sim lab further down.
import {
  D,
  type Decimal,
  defineCurrencies,
  defineFeature,
  defineGame,
  defineGenerators,
  definePrestige,
  HOUR_MS,
  lifetimeMultiplier,
  type Move,
  powerGain,
  type StateOf,
  vocab,
  withMoves,
} from "watchpot/core";

// A vocabulary needs a ladder even where nothing is drawn from it: this game has one rung.
export const WORDS = vocab({ currencies: ["steam"], stats: [], rarities: ["plain"] } as const);

/** Steam, and a total of all of it boiled this run (what the valve reads). */
export const wallet = defineCurrencies({ key: "wallet", vocab: WORDS, earnedThisRun: { steam: "boiled" } });

/** What venting has earned so far multiplies everything under the pot. */
export const pressureBonus = (lifetime: Decimal, k = 0.25) => lifetimeMultiplier(lifetime, { k, exp: 0.9 });

export const HEAT = [
  { id: "candle", name: "Candle", line: "It is a start.", cost: { base: 10, growth: 1.14 }, rate: 0.5 },
  { id: "burner", name: "Burner", line: "A ring of blue.", cost: { base: 120, growth: 1.15 }, rate: 5 },
  {
    id: "coil",
    name: "Coil",
    line: "Glows when it means it.",
    cost: { base: 1_800, growth: 1.16 },
    rate: 46,
  },
  {
    id: "furnace",
    name: "Furnace",
    line: "Somebody shovels.",
    cost: { base: 32_000, growth: 1.17 },
    rate: 520,
  },
  {
    id: "reactor",
    name: "Reactor",
    line: "Best left unwatched.",
    cost: { base: 700_000, growth: 1.18 },
    rate: 7_400,
  },
] as const;

export type HeatId = (typeof HEAT)[number]["id"];

/** The owned counts that double (and better) a source's output. */
export const MILESTONES = [
  { at: 10, gives: { mult: 2 } },
  { at: 25, gives: { mult: 2 } },
  { at: 50, gives: { mult: 3 } },
  { at: 100, gives: { mult: 4 } },
] as const;

/** Steam boiled this run turns into pressure when the valve opens, and the run starts over. */
const ventGain = (boiled: Decimal) => powerGain(boiled, { k: 1, exp: 0.5, per: 250_000 });

/** What the sim lab turns: how much a unit of pressure is worth (0.25 is the game as shipped). */
export interface Tuning {
  pressure?: number;
}

function build({ pressure = 0.25 }: Tuning = {}) {
  const heat = defineGenerators({
    key: "heat",
    wallet,
    list: HEAT.map((g) => ({
      ...g,
      pays: "steam" as const,
      makes: "steam" as const,
      free: g.id === "candle" ? 1 : 0,
      milestones: MILESTONES,
    })),
    global: [{ at: 10, gives: { mult: 2 } }],
    mult: (s: { valve: { lifetime: Decimal } }) => pressureBonus(s.valve.lifetime, pressure),
    // A watched pot: the whole of an absence counts, up to half a day of it.
    away: () => ({ rate: 1, capMs: 12 * HOUR_MS }),
  });

  /** The one thing a hand does: lift the lid. A press pays a tenth of a second of the pot's own output, never under 1. */
  const lid = defineFeature({
    key: "lid",
    reach: [wallet, heat],
    initial: () => ({ presses: 0 }),
    reset: "never",
    actions: (api) => ({
      press: () =>
        api.set((s) => {
          wallet.draft.credit(s, "steam", (s.heat.perSecond.steam ?? D(0)).div(10).max(1));
          s.lid.presses += 1;
        }),
    }),
  });

  const valveBase = definePrestige({
    key: "valve",
    action: "vent",
    reach: [wallet],
    gain: (s) => ventGain(s.wallet.boiled),
  });

  type ValveReads = { wallet: { boiled: Decimal }; valve: { lifetime: Decimal; vent: () => boolean } };

  /** The auto-player vents once a vent would at least match everything venting has ever paid (and is worth three). */
  const valve = withMoves(valveBase, (state: ValveReads): Move<ValveReads>[] => {
    const gain = ventGain(state.wallet.boiled);
    const ready = gain.gte(3) && gain.gte(state.valve.lifetime);
    return [
      { id: "valve.vent", worth: () => (ready ? 1 : 0), apply: (store) => store.getState().valve.vent() },
    ];
  });

  const toy = defineGame({
    id: "pot",
    save: { key: "watchpot.site.pot", version: 1 },
    features: [wallet, heat, lid, valve],
    vocab: WORDS,
  });

  return { toy, heat, lid, valve };
}

/** The game as this page ships it. */
export const { toy, heat, lid, valve } = build();

/** The same game with its prices turned, for the sim lab: a different definition, never the page's own store. */
export const tunedToy = (tuning: Tuning) => build(tuning).toy;

export type ToyState = StateOf<typeof toy.features>;

/** What the valve would pay now. */
export const ventNow = (s: ToyState): Decimal => ventGain(s.wallet.boiled);
