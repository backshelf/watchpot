import { describe, expect, test } from "bun:test";
import {
  boardRegistry,
  buyEventNode,
  composeBoards,
  D,
  dueMilestones,
  type EventBoard,
  type EventDefinition,
  eventNodeRow,
  freshRuntime,
  regenEventCurrencies,
  resolveWindow,
} from "watchpot/core";

/** A toy game's words: its own effects (with the framework's mastery kinds) and its own reward. */
type Effect =
  | { kind: "speed"; mult: number }
  | { kind: "keep"; node: string; ranks: number }
  | { kind: "head-start"; currency: string; amount: number };
type Reward = { kind: "gold"; amount: number };

const node = eventNodeRow<Effect>("ore");
const HOUR = 3_600_000;

const FAIR: EventDefinition<Effect, Reward, "harvest"> = {
  id: "fair",
  name: "The fair",
  tagline: "Roll up.",
  schedule: { kind: "rolling", durationMs: 24 * HOUR },
  currencies: [
    {
      id: "tickets",
      name: "Tickets",
      glyph: "ticket",
      start: 3,
      cap: 5,
      regen: { amount: 1, everyMs: HOUR },
    },
    { id: "ore", name: "Ore", glyph: "ore", start: 0 },
    { id: "ribbons", name: "Ribbons", glyph: "ribbon", start: 0, persistent: true },
  ],
  upgrades: [node("stall", "Stall", "Sell faster.", 10, 3, [], [{ kind: "speed", mult: 1.1 }], 1.5)],
  mastery: [
    node("old-hand", "Old hand", "Keep a stall.", 1, 1, [], [{ kind: "keep", node: "stall", ranks: 2 }]),
    node(
      "early",
      "Early",
      "Two tickets more.",
      1,
      2,
      [],
      [{ kind: "head-start", currency: "tickets", amount: 2 }],
      1.5,
    ),
  ],
  milestones: [
    { id: "first", name: "First", stat: "sold", threshold: 1, rewards: [{ kind: "gold", amount: 5 }] },
  ],
  shop: [],
  stats: ["sold"],
  pass: { name: "Pass", line: "", priceCents: 0, stat: "sold", unit: ["sale", "sales"], tiers: [] },
  fuel: [{ on: "harvest", per: 1, currency: "tickets" }],
};

describe("the events framework over a game's own words", () => {
  test("a cycle starts with the mastery's keeps and head starts, and its tree sells in its currency", () => {
    const runtime = freshRuntime(FAIR, 0, 0, { currencies: {}, upgrades: { "old-hand": 1, early: 2 } });
    expect(runtime.upgrades).toEqual({ stall: 2 });
    expect(runtime.currencies.tickets?.toNumber()).toBe(7);
    expect(runtime.currencies.ribbons).toBeUndefined();
    const rich = { ...runtime, currencies: { ...runtime.currencies, ore: D(1_000) } };
    const bought = buyEventNode(FAIR, rich, "stall");
    expect("code" in bought).toBe(false);
    if (!("code" in bought)) expect(bought.upgrades.stall).toBe(3);
  });

  test("the trickle stops at the cap and milestones pay the game's reward", () => {
    const runtime = freshRuntime(FAIR, 0);
    const later = regenEventCurrencies(FAIR, runtime, 10 * HOUR);
    expect(later.currencies.tickets?.toNumber()).toBe(5);
    const due = dueMilestones(FAIR, { ...runtime, stats: { sold: 1 } });
    const pays: Reward[] = due.flatMap((m) => [...m.rewards]);
    expect(pays).toEqual([{ kind: "gold", amount: 5 }]);
    expect(resolveWindow(FAIR.schedule, 30 * HOUR, 0).start).toBe(30 * HOUR);
  });
});

interface Game {
  events: Record<string, unknown>;
}

const board = (
  id: string,
  key: string,
  actions: Record<string, () => void> = {},
): EventBoard<Game, null> => ({
  id,
  key,
  initial: () => ({}),
  createActions: () => actions,
});

describe("event boards", () => {
  test("the registry reads its boards back in the game's order and refuses one for an unknown event", () => {
    const registry = boardRegistry<Game, null>();
    registry.register(board("b", "bees"));
    registry.register(board("a", "ants"));
    expect(registry.list(["a", "b", "c"]).map((b) => b.key)).toEqual(["ants", "bees"]);
    expect(() => registry.list(["a"])).toThrow(/"b"/);
    expect(() => registry.register(board("a", "other"))).toThrow(/twice/);
  });

  test("composing refuses a taken key or action, and leaves an unregistered board's key out", () => {
    const set = composeBoards([board("a", "ants"), board("b", "bees")]);
    expect(set.initial()).toEqual({ ants: {}, bees: {} });
    expect(() => composeBoards([board("a", "ants"), board("b", "ants")])).toThrow(/ants/);
    expect(() => composeBoards([board("a", "runtime")], { keys: ["runtime"] })).toThrow(/runtime/);
    const noop = () => undefined;
    const clash = composeBoards([board("a", "ants", { go: noop }), board("b", "bees", { go: noop })]);
    expect(() => clash.actions({} as never)).toThrow(/"go"/);
  });
});
