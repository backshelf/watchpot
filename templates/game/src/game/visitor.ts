// @feature visitor
import { type BuffRule, type BuffsState, buffs, type Effect, spawns } from "watchpot/core";
import type { StatId } from "../content/words";
import { BUFF, LIFE_MS, WAIT } from "../content/visitor";

/** The visitor's bonus as the buffs kernel reads it: catching another while it runs starts the clock again. */
const RULE: BuffRule = { id: BUFF.id, durationMs: BUFF.seconds * 1000, stack: "refresh" };

/** The timed bonuses, on the engine's `buffs`: the visitor's, output ×`BUFF.mult` while it runs. */
export const boosts = buffs<"boosts", Effect<StatId>>({
  key: "boosts",
  list: [{ ...RULE, effects: () => [{ stat: "output", mul: BUFF.mult }] }],
});

/** The one kind of arrival, and the id `catch` takes. */
export const VISITOR_KIND = "visitor";

/**
 * The visitor, on the engine's `spawns`: one turns up after a ramped wait (`WAIT`), stays `LIFE_MS`, and caught it
 * starts the bonus. Its arrivals and catches are on its own saved stream; the auto-player catches whatever is live.
 */
export const visitors = spawns({
  key: "visitors",
  kinds: [{ id: VISITOR_KIND, wait: WAIT, lifeMs: LIFE_MS, outcomes: [{ id: BUFF.id, weight: 1 }] }],
  onCatch: (d: { boosts: BuffsState }, _outcome, now) => {
    boosts.start(d, BUFF.id, now);
  },
});
