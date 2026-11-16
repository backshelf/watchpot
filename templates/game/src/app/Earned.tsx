// @feature achievements
import { createToasts } from "watchpot/ui";
import { useEffect, useState } from "react";
import { ACHIEVEMENTS, WALL_NAME } from "../content/achievements";
import { Toasts } from "../ui/Toasts";
import { useGameState, useGameStore } from "./hooks";
import { sound } from "./sound";

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Says each achievement as it is earned (the wall's `fresh` queue), then clears it from the queue. */
export function EarnedToasts() {
  const store = useGameStore();
  const fresh = useGameState((st) => st.achievements.fresh);
  const [toasts] = useState(() => createToasts({ duration: 5000 }));
  useEffect(() => {
    if (fresh.length === 0) return;
    for (const id of fresh) {
      const a = BY_ID.get(id);
      if (a) toasts.push({ id, title: a.name, body: a.line, tone: "success" });
    }
    sound.play("earned");
    store.getState().achievements.acknowledge(fresh);
  }, [fresh, store, toasts]);
  return <Toasts store={toasts} label={WALL_NAME} dismissLabel="Dismiss" />;
}
