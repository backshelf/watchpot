import type { Draft } from "immer";
import { type EventBag, type EventBoard, resolveWindow, ZERO } from "watchpot/core";
import { NETS, SHARDS, SHOWER } from "../../../content/shower";
import { PREMIUM } from "../../../content/words";
import { wallet } from "../../wallet";
import { type BoardGame, boards } from "../registry";
import { type Catch, castAt, freshSky, type Sky, showerMods } from "./rules";

/** The sky as the board keeps it, under `events.sky`. */
const skyOf = (s: Draft<BoardGame>) => s.events.sky as Sky;

/** The board's actions, merged into the events feature's. */
export interface SkyActions {
  /** Casts a net at a cell of the sky: what it caught, or null (no shower, no net, a cell already caught). */
  cast(cell: number): Catch | null;
}

/**
 * The shower's board: the sky. Each sky holds a fixed set of tokens; a net cast at a cell brings one back, drawn from
 * what is still up. An emptied sky is the next wave's. A new shower starts a new sky (`prepare`).
 */
export const skyBoard: EventBoard<BoardGame, EventBag, "sky", Sky, SkyActions> = boards.register({
  id: SHOWER.id,
  key: "sky",
  initial: () => freshSky(0),
  prepare: (s) => {
    if (skyOf(s).cycle !== s.events.runtime.cycleStart) s.events.sky = freshSky(s.events.runtime.cycleStart);
  },
  createActions: (api) => ({
    cast: (cell) => {
      let caught: Catch | null = null;
      api.set((s) => {
        if (!resolveWindow(SHOWER.schedule, api.now()).active) return;
        const rt = s.events.runtime;
        const sky = skyOf(s);
        if (sky.cycle !== rt.cycleStart) return;
        const nets = rt.currencies[NETS] ?? ZERO;
        if (nets.lt(1)) return;
        const c = castAt(
          sky,
          cell,
          api.rng(`sky:${sky.cycle}:${sky.wave}:${cell}`),
          showerMods(rt).catchMult,
        );
        if (!c) return;
        rt.currencies[NETS] = nets.sub(1);
        rt.currencies[SHARDS] = (rt.currencies[SHARDS] ?? ZERO).add(c.shards);
        rt.stats.caught = (rt.stats.caught ?? 0) + c.shards;
        rt.stats.casts = (rt.stats.casts ?? 0) + 1;
        s.events.caughtEver += c.shards;
        if (c.seeds > 0) wallet.draft.credit(s, PREMIUM, c.seeds);
        sky.cells[cell] = c.token;
        if (c.cleared) {
          s.events.sky = freshSky(sky.cycle, sky.wave + 1);
          rt.stats.skies = (rt.stats.skies ?? 0) + 1;
        }
        caught = c;
      });
      return caught;
    },
  }),
});
