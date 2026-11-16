import { mountGame } from "watchpot/react";
import { App } from "./app/App";
import { createGameStore } from "./game/store";
import "./tokens.css";
import "./ui/theme.css";

// The one store, built at the root; hydration from the save is synchronous.
mountGame(createGameStore(), <App />);
