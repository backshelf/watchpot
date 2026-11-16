import type { Decimal, DecimalSource } from "../decimal";
import type { GraphNode, NodeCost } from "../graph/nodes";
import type { Yield } from "../graph/yields";
import type { WorldOverlay } from "../world";
import type { EventSchedule } from "./schedule";

/**
 * An event is data (`EventDefinition`) plus a runtime record the store keeps per event (`EventRuntime`), and,
 * across cycles, its mastery (`EventMastery`). The definition is generic over three of the game's words: `E`, what
 * a tree node does (the game's modifier union); `R`, what a milestone, a shop item or a pass tier pays (the game's
 * reward); `A`, the game's actions that pay fuel into it.
 */

/**
 * What a node's effect must be: anything with a `kind`. Two kinds are the framework's own and keep these shapes:
 * `keep` and `head-start`, which a mastery tree uses to start every cycle further on (`freshRuntime`).
 */
export interface EventEffect {
  readonly kind: string;
}

/** Mastery: every cycle starts with the cycle tree's `node` at `ranks` or more (the largest kept rank wins). */
export interface KeepEffect {
  kind: "keep";
  node: string;
  ranks: number;
}

/** Mastery: every cycle starts with `amount` more of a cycle currency, per rank. */
export interface HeadStartEffect {
  kind: "head-start";
  currency: string;
  amount: number;
}

/** A node of an event's tree (the cycle's or the mastery's); its effects are the game's modifiers. */
export type EventNode<E extends EventEffect = EventEffect> = GraphNode<E>;

/** A node's or a shop item's price in one of the event's currencies. */
export type EventCost = NodeCost;

/** Fuel from play: one of the event's currencies, paid by one of the game's actions (`Yield`). */
export interface EventFuel<A extends string = string> extends Yield<A> {
  currency: string;
}

/** One event currency: its id, start, cap, trickle and whether it persists across cycles. */
export interface EventCurrencyDefinition {
  id: string;
  name: string;
  /** The glyph the game draws for it: one of its own glyph names. */
  glyph: string;
  start: DecimalSource;
  cap?: DecimalSource;
  /**
   * The trickle: `amount` every `everyMs` of wall time up to the cap, live or benched, so a closed tab is not
   * nothing. Play is the real source (`EventDefinition.fuel`).
   */
  regen?: { amount: DecimalSource; everyMs: number };
  /**
   * Kept across cycles (mastery points): held in the event's `EventMastery`, not the runtime, never regenerating.
   * A reward of it, a milestone's or a pass tier's, is credited there.
   */
  persistent?: true;
}

/** A milestone paid when an event stat reaches a threshold. */
export interface EventMilestone<R = unknown> {
  id: string;
  name: string;
  /** The runtime stat it reads and the value that unlocks it. */
  stat: string;
  threshold: number;
  rewards: readonly R[];
}

/** One item of an event's shop, priced in event currencies. */
export interface EventShopItem<R = unknown> {
  id: string;
  name: string;
  line: string;
  cost: EventCost;
  reward: R;
  /** Purchases per cycle; unlimited when absent. */
  limit?: number;
}

/**
 * Every event sells its own pass: tiers climbed by one of the event's stats, a free lane, and a premium lane bought
 * for the current cycle only (a restart sells it again).
 */
export interface EventPassTier<R = unknown> {
  /** The stat value that reaches this tier. Ascending through the list. */
  at: number;
  free: R | null;
  premium: R | null;
}

/** An event's pass: its name, price in cents, the stat it levels on and its tiers. */
export interface EventPassDefinition<R = unknown> {
  name: string;
  /** The pitch under the name, in the game's voice. */
  line: string;
  /** Real money, per cycle. */
  priceCents: number;
  /** The runtime stat that climbs the track. */
  stat: string;
  /** What one point of the stat is called, singular and plural ("tile", "tiles"). */
  unit: readonly [string, string];
  tiers: readonly EventPassTier<R>[];
}

/** One cycle's pass: whether the premium lane is bought, and the tiers claimed per lane (1-based). */
export interface EventPassState {
  premium: boolean;
  claimedFree: number[];
  claimedPremium: number[];
}

/** A pass lane: `free` or `premium`. */
export type EventPassLane = "free" | "premium";

/**
 * A handful of an event currency for the game's premium currency, unlimited, landing past the cap as a shop pack
 * does.
 */
export interface GemBuy {
  id: string;
  /** The button's words before the price. */
  label: string;
  currency: string;
  amount: number;
  gems: number;
}

/** An event as data: window, currencies, trees, milestones, shop, pass and fuel. */
export interface EventDefinition<
  E extends EventEffect = EventEffect,
  R = unknown,
  A extends string = string,
> {
  id: string;
  name: string;
  tagline: string;
  /** False switches the event off: never active, never live, no autopilot. Its saved progress stays. Default on. */
  enabled?: boolean;
  schedule: EventSchedule;
  currencies: readonly EventCurrencyDefinition[];
  upgrades: readonly EventNode<E>[];
  milestones: readonly EventMilestone<R>[];
  shop: readonly EventShopItem<R>[];
  /** The stat keys the event tracks, for the record. */
  stats: readonly string[];
  pass: EventPassDefinition<R>;
  /**
   * What the rest of the game pays into this event while it is the live event: the fuel that comes from play. The
   * first yield's currency is the event's fuel (`fuelCurrency`): the autopilot spends it while the event is benched.
   */
  fuel?: readonly EventFuel<A>[];
  /** The mastery tree: bought with the event's persistent currencies, kept across cycles. */
  mastery?: readonly EventNode<E>[];
  /** Plays a benched event's fuel for it: see `Autoplay`. Without one the event waits while benched. */
  autoplay?: Autoplay;
  /** The event's colours. */
  world?: WorldOverlay;
  /** Fuel for the premium currency, sold beside the fuel's count. */
  gemBuys?: readonly GemBuy[];
}

/** What an event keeps across cycles: its persistent currencies and its mastery tree's ranks. */
export interface EventMastery {
  currencies: Record<string, Decimal>;
  upgrades: Record<string, number>;
}

/** One cycle of an event: its currencies, ranks, stats, milestones claimed and pass. */
export interface EventRuntime {
  /** The window start this runtime belongs to; a new window resets it. */
  cycleStart: number;
  currencies: Record<string, Decimal>;
  /** Per regenerating currency: the wall time its next unit is counted from. */
  regenAt: Record<string, number>;
  upgrades: Record<string, number>;
  milestonesClaimed: string[];
  shopBought: Record<string, number>;
  stats: Record<string, number>;
  /** The event pass for this cycle. Absent on a runtime saved before passes: read it through `passStateOf`. */
  pass?: EventPassState;
  /** Per fuel yield (`<currency>/<action>`), the fraction of a unit carried to the next action. */
  fuelCarry?: Record<string, number>;
}

/**
 * What the framework reads of the modifiers in force. A game implements it over its own stats; `NO_BAG` is the
 * neutral one.
 */
export interface EventBag {
  regenMult: (eventId: string, currency: string) => number;
  capAdd: (eventId: string, currency: string) => Decimal;
  /** An event-local stat: `base` plus every add, times every mult. */
  stat: (eventId: string, key: string, base?: number) => number;
}

/**
 * The autopilot: plays `fuel` units of the event's fuel currency, already taken off the runtime's balance, at
 * `efficiency` (0 to 1), and returns the runtime with what that play earned: its currencies and stats. Pure and
 * cheap (it may run every tick), and it touches only the runtime: an event's board is its own to reconcile with
 * the stats on the next visit.
 */
export type Autoplay = (
  runtime: EventRuntime,
  fuel: number,
  bag: EventBag,
  efficiency: number,
) => EventRuntime;

/** Why an event action did not happen, as a value rather than a throw. */
export type EventFailure =
  | { code: "unknown" }
  | { code: "maxed" }
  | { code: "requires"; node: string }
  | { code: "cannot-afford"; currency: string; balance: Decimal; price: Decimal }
  | { code: "sold-out" }
  | { code: "inactive" };
