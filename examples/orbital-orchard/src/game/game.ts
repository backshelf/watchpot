import { defineGame, type StateOf } from "watchpot/core";
import { SLUG, WORDS } from "../content/words";
import { events } from "./events/events";
import { collection, summon } from "./gacha";
import { generators } from "./generators";
import { ascension } from "./prestige";
import { settings } from "./settings";
import { upgrades } from "./tree";
import { wallet } from "./wallet";

/**
 * The game: its features in order (each phase of the tick runs their steps in this order), its words, its save. A
 * change to the saved shape bumps `save.version` and adds a migration step (`watchpot` README › Saves).
 */
export const game = defineGame({
  id: SLUG,
  save: { key: `${SLUG}.save`, version: 1 },
  vocab: WORDS,
  features: [wallet, upgrades, summon, collection, ascension, generators, events, settings],
});

export type GameState = StateOf<typeof game.features>;
