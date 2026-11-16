import {
  type Achievement,
  type Decimal,
  defineAchievements,
  defineCurrencies,
  defineGame,
  defineStats,
  type Effect,
  type StatOf,
} from "watchpot/core";
import { TOY } from "./vocab";

type State = { wallet: { gold: Decimal; gems: Decimal } };
/** An effect on one of the toy's stats. */
type Fx = Effect<StatOf<typeof TOY>>;

const wallet = defineCurrencies({ key: "wallet", vocab: TOY });

const LIST: Achievement<State, Fx>[] = [
  { id: "ten", name: "Pocket money", line: "Hold 10 gold.", when: (s) => s.wallet.gold.gte(10) },
  {
    id: "hoard",
    name: "Hoarder",
    line: "Hold 5 gems for 30 seconds.",
    reward: "+1 speed",
    when: (s) => s.wallet.gems.gte(5),
    forMs: 30_000,
    effects: [{ stat: "toy.speed", add: 1 }],
  },
  {
    id: "clean",
    name: "Clean slate",
    line: "Reset holding no gems.",
    secret: true,
    on: ["reset"],
    when: (s) => s.wallet.gems.lte(0),
  },
  { id: "found", name: "Found it", line: "Open the hidden door." }, // the game calls award("found")
];

export const wall = defineAchievements({
  key: "wall",
  columns: 4,
  list: LIST,
  rowEffects: (): Fx[] => [{ stat: "toy.speed", mul: 1.25 }],
});

/**
 * What the wall gives, on the engine's `stats`: the global multiplier (the count earned and the rows) as a source,
 * and every earned achievement's and full row's effects as contributions. `s.stats["toy.speed"]` is the result.
 */
export const bonuses = defineStats({
  key: "stats",
  vocab: TOY,
  reach: () => [wall],
  stats: { "toy.speed": { base: 1 } },
  sources: [
    {
      label: "The wall",
      owner: "wall",
      effects: [{ stat: "toy.speed", mul: (q) => wall.select.power(q, { each: 1.03, row: 1.25 }) }],
    },
  ],
  contributions: (s) => wall.select.contributions(s),
});

export const game = defineGame({
  id: "wall",
  save: { key: "wall.save", version: 1 },
  features: [wallet, wall, bonuses],
  vocab: TOY,
});
