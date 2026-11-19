import { defineCurrencies, defineGame, defineSettings, type StateOf } from "watchpot/core";
import type { GameRuntimeOptions } from "watchpot/react";
import { SLUG, WORDS } from "./words";

/** Every balance, under `wallet`: `credit` and `debit` come with it. */
export const wallet = defineCurrencies({ key: "wallet", vocab: WORDS });

/** The player's choices: the motion ("system" follows the OS, "reduced" stills it). */
export interface Settings {
  motion: GameRuntimeOptions["motion"];
}

/**
 * The settings, under `settings`: kept through a reset, changed with `change(patch)`. A save from before a new key
 * loads with its default (the loader fills a missing key), so adding one needs no migration.
 */
export const settings = defineSettings({
  key: "settings",
  initial: (): Settings => ({ motion: "system" }),
});

/**
 * The game: its features in order, its words, its save. A change to the saved shape bumps `save.version` and adds a
 * migration step (`watchpot` README › Saves).
 */
export const game = defineGame({
  id: SLUG,
  save: { key: `${SLUG}.save`, version: 1 },
  vocab: WORDS,
  features: [wallet, settings],
});

export type GameState = StateOf<typeof game.features>;
