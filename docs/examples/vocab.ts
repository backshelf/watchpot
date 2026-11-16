import { type OddsTable, type RarityOf, vocab } from "watchpot/core";

/** The words the recipes share: a game declares them once, and every engine type reads them back. */
export const TOY = vocab({
  currencies: ["gold", "gems"],
  stats: { speed: "toy.speed" },
  rarities: ["common", "rare", "epic"], // lowest first
} as const);

export type Rarity = RarityOf<typeof TOY>;
export const ODDS: OddsTable<Rarity> = { common: 80, rare: 15, epic: 5 };
