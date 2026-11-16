import {
  type Achievement,
  achievements,
  busOf,
  currencies,
  type Decimal,
  defineGame,
  type Effect,
} from "watchpot/core";
import { TOY } from "./vocab";

type State = { wallet: { gold: Decimal; gems: Decimal } };

const wallet = currencies({ key: "wallet", vocab: TOY });

const LIST: Achievement<State, Effect>[] = [
  { id: "ten", name: "Pocket money", line: "Hold 10 gold.", when: (s) => s.wallet.gold.gte(10) },
  {
    id: "hoard",
    name: "Hoarder",
    line: "Hold 5 gems for 30 seconds.",
    reward: "+1 speed",
    when: (s) => s.wallet.gems.gte(5),
    forMs: 30_000,
    effects: [{ stat: "speed", add: 1 }],
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

export const wall = achievements({
  key: "wall",
  columns: 4,
  list: LIST,
  rowEffects: () => [{ stat: "speed", mult: 1.25 }],
});

export const game = defineGame({
  id: "wall",
  save: { key: "wall.save", version: 1 },
  features: [wallet, wall],
  vocab: TOY,
});

/** The global multiplier and the stat bus, read off the earned record. */
export function bonuses(s: { wall: { earned: Record<string, number> } }) {
  return {
    power: wall.board.power(s.wall.earned, { each: 1.03, row: 1.25 }),
    bus: busOf(wall.board.contributions(s.wall.earned)),
  };
}
