import {
  catalogueRoll,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineGacha,
  defineGame,
  freshPity,
  type PityRule,
  publishedOdds,
  pullsUntilPity,
} from "watchpot/core";
import { ODDS, type Rarity, TOY } from "./vocab";

/** The catalogue: every item names its rarity (read off the game's own words). */
const HEROES = [
  { id: "mouse", rarity: "common" },
  { id: "rat", rarity: "common" },
  { id: "otter", rarity: "rare" },
  { id: "whale", rarity: "epic" },
] as const satisfies readonly { id: string; rarity: Rarity }[];

/** Guarantees are floors on the ladder: a rare or better within 10 pulls; an epic within 50, ramping from 40. */
const RULE: PityRule<Rarity> = [
  { rarity: "rare", within: 10 },
  { rarity: "epic", within: 50, softFrom: 40 },
];

/** A feature owning one box, "banner": its pity, its rng stream and its opens. The roll turns a rarity into a hero. */
export const summon = defineGacha({
  key: "summon",
  ladder: TOY.rarities,
  vocab: TOY,
  odds: { banner: ODDS },
  pity: { banner: RULE },
  roll: catalogueRoll(HEROES),
});

export const game = defineGame({
  id: "gacha",
  save: { key: "gacha.save", version: 1 },
  features: [summon],
  vocab: TOY,
});

if (import.meta.main) {
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
    now: () => Date.UTC(2026, 0, 1),
    seed: "docs", // a seeded store replays the same pulls
  });
  // `open` is free; a game that charges takes the price and calls `summon.draft.open(draft, box, count)` in one recipe.
  const opened = store.getState().summon.open("banner", 10);
  console.log(
    opened.pulls.map((p) => `${p.rarity}:${p.item.id}${p.triggered ? `(${p.triggered})` : ""}`).join(" "),
  );
  // The published odds and the countdown a game prints on its odds sheet.
  console.log(publishedOdds(TOY.rarities, ODDS));
  console.log(
    pullsUntilPity(TOY.rarities, store.getState().summon.pity.banner ?? freshPity(RULE), RULE, ODDS),
  );
}
