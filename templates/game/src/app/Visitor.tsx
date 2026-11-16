// @feature visitor
import { nextFloat, seedRng } from "watchpot/core";
import { useClockNow } from "watchpot/react";
import { BUFF, LIFE_MS, VISITOR } from "../content/visitor";
import { STAT } from "../content/words";
import { VISITOR_KIND } from "../game/visitor";
import { Arrival } from "../ui/Arrival";
import { BuffChip } from "../ui/BuffChip";
import { useGameState, useGameStore } from "./hooks";
import { VISITOR_MARK } from "./icons";
import { sound } from "./sound";

/** Where an arrival sits: read off its id, so it stays put across renders and reloads, and clear of the edges. */
const placeOf = (id: string) => {
  const [x, next] = nextFloat(seedRng(id));
  const [y] = nextFloat(next);
  return { x: 0.15 + x * 0.7, y: 0.2 + y * 0.6 };
};

/** The visitor over the page while one is here: press it to catch it. */
export function VisitorLayer() {
  const store = useGameStore();
  const live = useGameState((st) => st.visitors.kinds[VISITOR_KIND]?.live ?? null);
  const now = useClockNow(250);
  if (!live || now >= live.diesAt) return null;
  return (
    <Arrival
      at={placeOf(live.id)}
      life={(live.diesAt - now) / LIFE_MS}
      label={`${VISITOR.name}: ${VISITOR.line}`}
      onCatch={() => store.getState().visitors.catch(VISITOR_KIND) && sound.play("catch")}
    >
      {VISITOR_MARK}
    </Arrival>
  );
}

/** The visitor's bonus while it runs, with its time left. */
export function BoostChip() {
  const active = useGameState((st) => st.boosts.active[BUFF.id]);
  const now = useClockNow(250);
  if (!active || active.until <= now) return null;
  return (
    <BuffChip
      name={BUFF.name}
      effect={`${STAT.output} ×${BUFF.mult}`}
      secondsLeft={(active.until - now) / 1000}
      seconds={BUFF.seconds}
    />
  );
}
