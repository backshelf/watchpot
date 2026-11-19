import { mountGame } from "watchpot/react";
import { App } from "./App";
import { createGameStore } from "./game/store";

// The one store, built at the root; hydration from the save is synchronous.
mountGame(createGameStore(), <App />);
