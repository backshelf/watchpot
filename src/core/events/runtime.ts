import { D, ZERO } from "../decimal";
import { assertNodeGrowth, checkRank, rankCost } from "../graph/nodes";
import type {
  EventDefinition,
  EventEffect,
  EventFailure,
  EventMastery,
  EventMilestone,
  EventNode,
  EventPassDefinition,
  EventPassLane,
  EventPassState,
  EventRuntime,
  HeadStartEffect,
  KeepEffect,
} from "./definition";

/**
 * The runtime's rules: a cycle's fresh runtime, the cycle tree and the mastery tree, the shop, milestones, the
 * pass and the band a finished cycle earned. Every function is pure: it takes the runtime (or the mastery) and
 * returns the next one, or the failure.
 */

/**
 * A tree's row builder, its prices in one currency: a node from one row, rank one at `cost`, each further rank
 * times `costGrowth`, which a row of more than one rank must give (a row of one rank may leave it out). Bind `E` to
 * the game's modifier union, so an effect literal is checked against it: `eventNodeRow<Modifier>("ore")`.
 */
export function eventNodeRow<E extends EventEffect>(currency: string): EventNodeRow<E> {
  return (
    id: string,
    name: string,
    line: string,
    cost: number,
    maxLevel: number,
    requires: readonly string[],
    effects: readonly E[],
    costGrowth?: number,
  ): EventNode<E> => {
    const node = {
      id,
      name,
      line,
      cost: [{ currency, amount: cost }],
      maxLevel,
      requires,
      effects,
      ...(costGrowth === undefined ? {} : { costGrowth }),
    };
    assertNodeGrowth(node);
    return node as EventNode<E>;
  };
}

/** The row builder `eventNodeRow` returns: `costGrowth` is optional for one rank and required above it. */
export interface EventNodeRow<E extends EventEffect> {
  (
    id: string,
    name: string,
    line: string,
    cost: number,
    maxLevel: 1,
    requires: readonly string[],
    effects: readonly E[],
    costGrowth?: number,
  ): EventNode<E>;
  (
    id: string,
    name: string,
    line: string,
    cost: number,
    maxLevel: number,
    requires: readonly string[],
    effects: readonly E[],
    costGrowth: number,
  ): EventNode<E>;
}

/** A mastery tree with nothing bought. */
export const emptyMastery = (): EventMastery => ({ currencies: {}, upgrades: {} });

/** The event's fuel: its first yield's currency, or null for an event fuelled by nothing. */
export function fuelCurrency(def: EventDefinition): string | null {
  return def.fuel?.[0]?.currency ?? null;
}

/** Whether an event currency survives into the next cycle. */
export function isPersistent(def: EventDefinition, currencyId: string): boolean {
  return def.currencies.some((c) => c.id === currencyId && c.persistent);
}

const isKeep = (e: EventEffect): e is KeepEffect => e.kind === "keep";
const isHeadStart = (e: EventEffect): e is HeadStartEffect => e.kind === "head-start";

/** The mastery tree's effects that pass `is`, once per rank held. */
function masteryEffects<T extends EventEffect>(
  def: EventDefinition,
  mastery: EventMastery | undefined,
  is: (e: EventEffect) => e is T,
): T[] {
  const out: T[] = [];
  if (!mastery) return out;
  for (const node of def.mastery ?? []) {
    const level = mastery.upgrades[node.id] ?? 0;
    for (let i = 0; i < level; i++) for (const e of node.effects) if (is(e)) out.push(e);
  }
  return out;
}

/** Finds a mastery node by id. */
export function masteryNodeById<E extends EventEffect>(
  def: EventDefinition<E>,
  nodeId: string,
): EventNode<E> | undefined {
  return def.mastery?.find((n) => n.id === nodeId);
}

/** Whether a mastery node can be bought: null, or the failure. */
export function checkMasteryNode(
  def: EventDefinition,
  mastery: EventMastery,
  nodeId: string,
): EventFailure | null {
  const node = masteryNodeById(def, nodeId);
  if (!node) return { code: "unknown" };
  return checkRank(node, mastery.upgrades, (currency) => mastery.currencies[currency]);
}

/** Buys one rank of a mastery node: the new mastery, or the failure. */
export function buyMasteryNode(
  def: EventDefinition,
  mastery: EventMastery,
  nodeId: string,
): EventMastery | EventFailure {
  const failure = checkMasteryNode(def, mastery, nodeId);
  if (failure) return failure;
  const node = masteryNodeById(def, nodeId);
  if (!node) return { code: "unknown" };
  const level = mastery.upgrades[nodeId] ?? 0;
  const currencies = { ...mastery.currencies };
  for (const c of rankCost(node, level))
    currencies[c.currency] = (currencies[c.currency] ?? ZERO).sub(c.amount);
  return { currencies, upgrades: { ...mastery.upgrades, [nodeId]: level + 1 } };
}

/** A pass with nothing claimed. */
export const emptyPassState = (): EventPassState => ({ premium: false, claimedFree: [], claimedPremium: [] });

/** A runtime's pass state, or an empty one. */
export function passStateOf(runtime: EventRuntime | undefined): EventPassState {
  return runtime?.pass ?? emptyPassState();
}

/**
 * A cycle's first runtime: each cycle currency at its start plus the mastery's head starts, and the cycle tree at
 * the ranks the mastery keeps. Persistent currencies are not on it (`EventMastery`).
 */
export function freshRuntime(
  def: EventDefinition,
  cycleStart: number,
  now = cycleStart,
  mastery?: EventMastery,
): EventRuntime {
  const currencies: EventRuntime["currencies"] = {};
  const regenAt: Record<string, number> = {};
  for (const c of def.currencies) {
    if (c.persistent) continue;
    currencies[c.id] = D(c.start);
    if (c.regen) regenAt[c.id] = now;
  }
  for (const h of masteryEffects(def, mastery, isHeadStart))
    if (currencies[h.currency]) currencies[h.currency] = (currencies[h.currency] ?? ZERO).add(h.amount);
  const upgrades: Record<string, number> = {};
  for (const k of masteryEffects(def, mastery, isKeep)) {
    const node = eventNodeById(def, k.node);
    if (node) upgrades[k.node] = Math.min(node.maxLevel, Math.max(upgrades[k.node] ?? 0, k.ranks));
  }
  return {
    cycleStart,
    currencies,
    regenAt,
    upgrades,
    milestonesClaimed: [],
    shopBought: {},
    stats: {},
    pass: emptyPassState(),
  };
}

/** Tiers reached (0..N) for a stat value. */
export function passTiersReached(pass: EventPassDefinition, value: number): number {
  let n = 0;
  for (const tier of pass.tiers) if (value >= tier.at) n++;
  return n;
}

/** Where the stat stands between the last tier reached and the next: for the track's bar. */
export function passProgress(
  pass: EventPassDefinition,
  value: number,
): { tier: number; into: number; needed: number } {
  const tier = passTiersReached(pass, value);
  const from = tier > 0 ? (pass.tiers[tier - 1]?.at ?? 0) : 0;
  const next = pass.tiers[tier];
  if (!next) return { tier, into: 0, needed: 0 };
  return { tier, into: Math.max(0, value - from), needed: next.at - from };
}

/** Why a tier's reward cannot be claimed, or null when it can. */
export function checkPassClaim(
  pass: EventPassDefinition,
  state: EventPassState,
  value: number,
  tier: number,
  lane: EventPassLane,
): "no-tier" | "not-reached" | "premium-required" | "claimed" | "no-reward" | null {
  const row = pass.tiers[tier - 1];
  if (!row) return "no-tier";
  if (value < row.at) return "not-reached";
  if (lane === "premium" && !state.premium) return "premium-required";
  if ((lane === "free" ? state.claimedFree : state.claimedPremium).includes(tier)) return "claimed";
  if (!(lane === "free" ? row.free : row.premium)) return "no-reward";
  return null;
}

/** Price of buying the next rank of an event node when `level` are owned. */
export const eventNodeCost = (node: EventNode, level: number) => rankCost(node, level);

/** Finds a cycle-tree node by id. */
export function eventNodeById<E extends EventEffect>(
  def: EventDefinition<E>,
  nodeId: string,
): EventNode<E> | undefined {
  return def.upgrades.find((n) => n.id === nodeId);
}

/** Whether a cycle-tree node can be bought: null, or the failure. */
export function checkEventNode(
  def: EventDefinition,
  runtime: EventRuntime,
  nodeId: string,
): EventFailure | null {
  const node = eventNodeById(def, nodeId);
  if (!node) return { code: "unknown" };
  return checkRank(node, runtime.upgrades, (currency) => runtime.currencies[currency]);
}

/** Buys one rank of a cycle-tree node: the new runtime, or the failure. */
export function buyEventNode(
  def: EventDefinition,
  runtime: EventRuntime,
  nodeId: string,
): EventRuntime | EventFailure {
  const failure = checkEventNode(def, runtime, nodeId);
  if (failure) return failure;
  const node = eventNodeById(def, nodeId);
  if (!node) return { code: "unknown" };
  const level = runtime.upgrades[nodeId] ?? 0;
  const currencies = { ...runtime.currencies };
  for (const c of rankCost(node, level))
    currencies[c.currency] = (currencies[c.currency] ?? ZERO).sub(c.amount);
  return { ...runtime, currencies, upgrades: { ...runtime.upgrades, [nodeId]: level + 1 } };
}

/** Whether a result is an `EventFailure`. */
export function isEventFailure<T extends object>(value: T | EventFailure): value is EventFailure {
  return "code" in value;
}

/** Whether the player already holds a reward outright; such an item reads as sold out. */
export type OwnsReward<R = unknown> = (reward: R) => boolean;

/** Whether a shop item can be bought: null, or the failure. */
export function checkEventShopItem<R>(
  def: EventDefinition<EventEffect, R>,
  runtime: EventRuntime,
  itemId: string,
  owns: OwnsReward<R> = () => false,
): EventFailure | null {
  const item = def.shop.find((i) => i.id === itemId);
  if (!item) return { code: "unknown" };
  if (item.limit !== undefined && (runtime.shopBought[itemId] ?? 0) >= item.limit)
    return { code: "sold-out" };
  if (owns(item.reward)) return { code: "sold-out" };
  const balance = runtime.currencies[item.cost.currency] ?? ZERO;
  const price = D(item.cost.amount);
  if (balance.lt(price)) return { code: "cannot-afford", currency: item.cost.currency, balance, price };
  return null;
}

/** Charges the item and records the purchase; the caller grants `item.reward`. */
export function buyEventShopItem<R>(
  def: EventDefinition<EventEffect, R>,
  runtime: EventRuntime,
  itemId: string,
  owns?: OwnsReward<R>,
): EventRuntime | EventFailure {
  const failure = checkEventShopItem(def, runtime, itemId, owns);
  if (failure) return failure;
  const item = def.shop.find((i) => i.id === itemId);
  if (!item) return { code: "unknown" };
  const currencies = {
    ...runtime.currencies,
    [item.cost.currency]: (runtime.currencies[item.cost.currency] ?? ZERO).sub(item.cost.amount),
  };
  return {
    ...runtime,
    currencies,
    shopBought: { ...runtime.shopBought, [itemId]: (runtime.shopBought[itemId] ?? 0) + 1 },
  };
}

/** Milestones whose threshold is met and which are not yet claimed, in definition order. */
export function dueMilestones<R>(
  def: EventDefinition<EventEffect, R>,
  runtime: EventRuntime,
): EventMilestone<R>[] {
  return def.milestones.filter(
    (m) => !runtime.milestonesClaimed.includes(m.id) && (runtime.stats[m.stat] ?? 0) >= m.threshold,
  );
}

/** How well a cycle went, read off its milestones: one cleared, half of them, all of them. */
export type CycleBand = "bronze" | "silver" | "gold";

/** Milestones the cycle cleared: claimed, or with the threshold met and the claim left on the table. */
function milestonesCleared(def: EventDefinition, runtime: EventRuntime): number {
  return def.milestones.filter(
    (m) => runtime.milestonesClaimed.includes(m.id) || (runtime.stats[m.stat] ?? 0) >= m.threshold,
  ).length;
}

/** The band a finished cycle earned: gold at every milestone, silver at half, bronze at one; null at none. */
export function cycleBand(def: EventDefinition, runtime: EventRuntime): CycleBand | null {
  const total = def.milestones.length;
  const cleared = milestonesCleared(def, runtime);
  if (total === 0 || cleared === 0) return null;
  if (cleared >= total) return "gold";
  return cleared * 2 >= total ? "silver" : "bronze";
}
