import {
  boardRegistry,
  composeBoards,
  D,
  type EventBoard,
  type EventDefinition,
  eventNodeRow,
  type FeatureApi,
  feature,
  freshRuntime,
  HOUR_MS,
  regenEventCurrencies,
  resolveWindow,
} from "watchpot/core";

type Effect = { kind: "speed"; mult: number };
type Reward = { kind: "gold"; amount: number };

/** A tree's rows priced in one event currency (ore). */
const stall = eventNodeRow<Effect>("ore");

/** The event as data: a window, currencies (one trickles back), a tree, milestones, a pass. */
export const FAIR: EventDefinition<Effect, Reward, "harvest"> = {
  id: "fair",
  name: "The fair",
  tagline: "Roll up.",
  schedule: { kind: "rolling", durationMs: 24 * HOUR_MS },
  currencies: [
    {
      id: "tickets",
      name: "Tickets",
      glyph: "ticket",
      start: 3,
      cap: 5,
      regen: { amount: 1, everyMs: HOUR_MS },
    },
    { id: "ore", name: "Ore", glyph: "ore", start: 0 },
  ],
  upgrades: [stall("stall", "Stall", "Sell faster.", 10, 3, [], [{ kind: "speed", mult: 1.1 }])],
  milestones: [
    { id: "first", name: "First sale", stat: "sold", threshold: 1, rewards: [{ kind: "gold", amount: 5 }] },
  ],
  shop: [],
  stats: ["sold"],
  pass: { name: "Fair pass", line: "", priceCents: 0, stat: "sold", unit: ["sale", "sales"], tiers: [] },
  fuel: [{ on: "harvest", per: 1, currency: "tickets" }],
};

interface Game {
  events: Record<string, unknown>;
}

/** A board: what this event keeps beyond the shared runtime, saved inside the events feature under `key`. */
const registry = boardRegistry<Game, null>();
export const fairBoard: EventBoard<Game, null, "fairBoard", { visits: number }, { visitFair: () => void }> =
  registry.register({
    id: "fair",
    key: "fairBoard",
    initial: () => ({ visits: 0 }),
    createActions: (api) => ({
      visitFair: () =>
        api.set((s) => {
          (s.events.fairBoard as { visits: number }).visits += 1;
        }),
    }),
  });

/** Read the registry when the store is built (not while modules load) and compose in the game's event order. */
const boards = composeBoards(registry.list(["fair"]), { keys: ["runtime"], actions: [] });

/** The game's events feature: a runtime per event plus the composed boards' state and actions. */
export const events = feature({
  key: "events",
  initial: () => ({ ...boards.initial(), runtime: freshRuntime(FAIR, 0) }),
  // The board set types its recipes over the game state; the feature's api is narrower, so it is cast once, here.
  actions: (api) => boards.actions(api as unknown as FeatureApi<Game>),
});

if (import.meta.main) {
  const rt = freshRuntime(FAIR, 0);
  console.log("tickets at start:", rt.currencies.tickets?.toString());
  const later = regenEventCurrencies(
    FAIR,
    { ...rt, currencies: { ...rt.currencies, tickets: D(0) } },
    10 * HOUR_MS,
  );
  console.log("after 10 idle hours (cap 5):", later.currencies.tickets?.toString());
  console.log("window:", resolveWindow(FAIR.schedule, 30 * HOUR_MS, 0));
}
