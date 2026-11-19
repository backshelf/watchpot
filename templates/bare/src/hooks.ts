import { createRuntimeHooks } from "watchpot/react";
import type { GameStore } from "./game/store";

/** The typed store hooks: every component reads the store through these. */
export const { useGameStore, useGameState } = createRuntimeHooks<GameStore>();
