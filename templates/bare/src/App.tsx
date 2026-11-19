import { fmt } from "watchpot/core";
import { useGameRuntime } from "watchpot/react";
import { COUNT, NAME } from "./game/words";
import { useGameState, useGameStore } from "./hooks";

/**
 * The page: a number and the button that raises it. `useGameRuntime` starts the clock (the catch-up for time away,
 * then the ticks), applies the motion setting to the page and reports another tab taking the save.
 */
export function App() {
  const store = useGameStore();
  const motion = useGameState((s) => s.settings.motion);
  const count = useGameState((s) => s.wallet[COUNT]);
  const { taken } = useGameRuntime(store, { motion });
  return (
    <main>
      <h1>{NAME}</h1>
      <p>{fmt(count).text}</p>
      <button type="button" onClick={() => store.getState().wallet.credit(COUNT, 1)}>
        Click
      </button>
      <p>
        <label>
          <input
            type="checkbox"
            checked={motion === "reduced"}
            onChange={(e) => store.getState().settings.change({ motion: e.target.checked ? "reduced" : "system" })}
          />{" "}
          Reduce motion
        </label>
      </p>
      {taken && <p role="alert">{NAME} is open in another tab. Play there, or close it and reload this one.</p>}
    </main>
  );
}
