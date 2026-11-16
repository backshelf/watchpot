import { createRuntimeHooks } from "watchpot/react";
import type { GameStore } from "../game/store";

/**
 * The typed store hooks: every screen reads the store through these. `useGameView` is the whole state at a reading
 * pace (a few times a second), for a screen that shows many numbers; `useGameState` a selected value, every change.
 */
export const { useGameStore, useGameState, useGameView } = createRuntimeHooks<GameStore>();
