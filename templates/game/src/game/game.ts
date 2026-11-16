import { defineGame, type StateOf } from "watchpot/core";
import { SLUG, WORDS } from "../content/words";
import { settings } from "./settings";
import { stats } from "./stats";
import { wallet } from "./wallet";
// @if generators
import { producers } from "./generators";
// @end
// @if dimensions
import { chain } from "./dimensions";
// @end
// @if clicker
import { press } from "./clicker";
// @end
// @if tree
import { upgrades } from "./tree";
// @end
// @if gacha
import { collection, summon } from "./gacha";
// @end
// @if prestige
import { ascension } from "./prestige";
// @end
// @if achievements
import { wall } from "./achievements";
// @end
// @if visitor
import { boosts, visitors } from "./visitor";
// @end

/**
 * The game: its features in order (each phase of a pass runs their steps in this order, so the stats come before the
 * core that reads them), its words, its save. A change to the saved shape bumps `save.version` and adds a migration
 * step (`watchpot` README › Saves).
 */
export const game = defineGame({
  id: SLUG,
  save: { key: `${SLUG}.save`, version: 1 },
  vocab: WORDS,
  features: [
    wallet,
    settings,
    // @if tree
    upgrades,
    // @end
    // @if gacha
    summon,
    collection,
    // @end
    // @if prestige
    ascension,
    // @end
    // @if achievements
    wall,
    // @end
    // @if visitor
    boosts,
    visitors,
    // @end
    stats,
    // @if generators
    producers,
    // @end
    // @if dimensions
    chain,
    // @end
    // @if clicker
    press,
    // @end
  ],
});

export type GameState = StateOf<typeof game.features>;
