import { defineSettings as playerSettings } from "watchpot/core";
import type { GameRuntimeOptions } from "watchpot/react";

/** The player's choices: sound on or off, and the motion ("system" follows the OS, "reduced" stills it). */
export interface Settings {
  sound: boolean;
  motion: GameRuntimeOptions["motion"];
}

/**
 * The settings, under `settings`: kept through a prestige, changed with `change(patch)`. A save from before them
 * loads with these defaults (the loader fills a missing key), so they need no migration.
 */
export const settings = playerSettings({
  key: "settings",
  initial: (): Settings => ({ sound: true, motion: "system" }),
});
