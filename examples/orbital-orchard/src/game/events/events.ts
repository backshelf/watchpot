import {
  type BoardSet,
  buyEventNode,
  composeBoards,
  type Decimal,
  dueMilestones,
  type EventBag,
  eventCurrencyCap,
  eventNodeCost,
  type FeatureApi,
  feature,
  freshRuntime,
  isEventFailure,
  type Move,
  regenEventCurrencies,
  resolveWindow,
  yieldUnits,
  ZERO,
} from "watchpot/core";
import { BOX } from "../../content/gacha";
import { NETS, SHARDS, SHOWER, type ShowerReward } from "../../content/shower";
import { MAIN, PREMIUM } from "../../content/words";
import { summon } from "../gacha";
import { generators } from "../generators";
import { wallet } from "../wallet";
import { type BoardGame, boards } from "./registry";
import { type SkyActions, skyBoard } from "./shower/board";
import { type Sky, showerBag } from "./shower/rules";

/** The events the game runs, in order. A new event adds its id here and registers its board from its folder. */
export const EVENT_ORDER = [SHOWER.id] as const;

/** The fuel yield's carry key, as the engine's runtime names it: `<currency>/<action>`. */
const PLANT_CARRY = `${NETS}/plant`;

let composed: BoardSet<BoardGame, EventBag> | undefined;
/** Read the registry once the modules have loaded (each board's folder registers as it loads), then keep it. */
const boardSet = () =>
  (composed ??= composeBoards(boards.list(EVENT_ORDER), {
    keys: ["runtime", "caughtEver", "planted", "live", "turnsAt"],
    actions: ["buyNode", "claim"],
  }));

/** Trees owned, every kind: what planting fuel counts against. */
const treesOf = (owned: Readonly<Record<string, number>>) => Object.values(owned).reduce((a, b) => a + b, 0);

/** What a milestone's reward does to the game. */
function pay(
  s: { wallet: object; generators: { perSecond: Decimal }; summon: { tokens: Record<string, number> } },
  reward: ShowerReward,
) {
  if (reward.kind === "seeds") wallet.draft.credit(s, PREMIUM, reward.amount);
  else if (reward.kind === "sunlight")
    wallet.draft.credit(s, MAIN, s.generators.perSecond.mul(60 * reward.minutes));
  else s.summon.tokens[BOX] = (s.summon.tokens[BOX] ?? 0) + reward.count;
}

/**
 * The game's events: the meteor shower's runtime (a fresh one each shower), the sky board composed in, and what is
 * kept across showers. The shower is outside the run: changing orbit leaves it alone.
 */
export const events = feature({
  key: "events",
  reach: [wallet, summon, generators],
  initial: () => ({
    ...(boardSet().initial() as { sky: Sky }),
    runtime: freshRuntime(SHOWER, 0),
    caughtEver: 0,
    /** Trees owned when fuel was last counted. */
    planted: 0,
    /** Whether the shower is falling, and when it ends (or the next one starts): worked out each tick. */
    live: false,
    turnsAt: 0,
  }),
  transient: ["live", "turnsAt"],
  reset: "never",
  actions: (api) => ({
    // The board set types its recipes over the boards' view of the game; the feature's api is that view and more.
    ...(boardSet().actions(api as unknown as FeatureApi<BoardGame>) as SkyActions),
    /** Buys a rank of a node of the shower's tree with shards. */
    buyNode: (id: string): boolean => {
      let ok = false;
      api.set((s) => {
        const next = buyEventNode(SHOWER, s.events.runtime, id);
        if (isEventFailure(next)) return;
        s.events.runtime = next;
        ok = true;
      });
      return ok;
    },
    /** Claims a milestone the shower's catch has reached, and pays it. */
    claim: (id: string): boolean => {
      let ok = false;
      api.set((s) => {
        const m = dueMilestones(SHOWER, s.events.runtime).find((x) => x.id === id);
        if (!m) return;
        s.events.runtime.milestonesClaimed.push(m.id);
        for (const r of m.rewards) pay(s, r);
        ok = true;
      });
      return ok;
    },
  }),
  steps: {
    sync: {
      // The window: a new shower gets a fresh runtime and sky; a live one trickles its nets back. The trickle runs
      // from the shower's start, so a return mid-shower finds the nets that came in while away (to the cap).
      window: (s, ctx) => {
        const w = resolveWindow(SHOWER.schedule, ctx.now);
        s.events.live = w.active;
        s.events.turnsAt = w.active ? w.end : w.start;
        if (!w.active) return;
        if (s.events.runtime.cycleStart !== w.start) s.events.runtime = freshRuntime(SHOWER, w.start);
        const bag = showerBag(s.events.runtime);
        s.events.runtime = regenEventCurrencies(SHOWER, s.events.runtime, ctx.now, bag);
        boardSet().prepare(SHOWER.id)?.(s, bag);
      },
    },
    settle: {
      // Planting while the shower falls brings nets in (up to their cap); a reset's fewer trees just moves the mark.
      fuel: (s) => {
        const trees = treesOf(s.generators.owned);
        const grown = trees - s.events.planted;
        s.events.planted = trees;
        if (grown <= 0 || !s.events.live) return;
        const rt = s.events.runtime;
        const fuel = SHOWER.fuel?.[0];
        if (!fuel) return;
        const carry = rt.fuelCarry?.[PLANT_CARRY] ?? 0;
        const paid = yieldUnits(fuel.per, grown, 1, carry);
        rt.fuelCarry = { ...rt.fuelCarry, [PLANT_CARRY]: paid.carry };
        const cap = eventCurrencyCap(SHOWER, NETS, showerBag(rt));
        const nets = (rt.currencies[NETS] ?? ZERO).add(paid.units);
        rt.currencies[NETS] = cap && nets.gt(cap) ? cap : nets;
      },
    },
  },
  // The auto-player casts every net, buys the tree with shards and claims each milestone as it lands.
  moves: (s) => {
    const rt = s.events.runtime;
    const out: Move<typeof s>[] = [];
    const cell = s.events.sky.cells.indexOf(null);
    if (s.events.live && (rt.currencies[NETS] ?? ZERO).gte(1) && cell >= 0)
      out.push({
        id: `cast:${s.events.sky.wave}:${cell}`,
        value: () => 1,
        apply: (store) => store.getState().events.cast(cell) !== null,
      });
    for (const node of SHOWER.upgrades) {
      const rank = rt.upgrades[node.id] ?? 0;
      const [price] = eventNodeCost(node, rank);
      if (rank >= node.maxLevel || !price || node.requires.some((r) => !(rt.upgrades[r] ?? 0))) continue;
      out.push({
        id: `shower:${node.id}`,
        cost: { currency: SHARDS, amount: price.amount },
        value: () => 1,
        apply: (store) => store.getState().events.buyNode(node.id),
      });
    }
    for (const m of dueMilestones(SHOWER, rt))
      out.push({
        id: `claim:${m.id}`,
        value: () => 2,
        apply: (store) => store.getState().events.claim(m.id),
      });
    return out;
  },
});

export { skyBoard };
