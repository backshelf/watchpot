import type { Draft } from "immer";
import { type CostCurve, costAt, costOfMany, maxAffordable } from "./cost";
import type { CurrenciesFeature, CurrencyDraft, Purse } from "./currencies";
import { D, type Decimal, type DecimalSource, ONE, ZERO } from "./decimal";
import {
  defineFeature,
  type Feature,
  type FeatureApi,
  type NeedsOf,
  type ReachOf,
  type ReachShape,
  type ResetRule,
} from "./feature";

/**
 * Recipes: crafting, inputs to outputs. A recipe takes amounts of some currencies and gives amounts of others, all
 * or nothing, as many times over as asked; a yield multiplier scales what it gives, and `costGrowth` (or a `CostCurve`
 * input) scales what each further craft takes by how many have already been crafted. The pure rules work over a
 * `Purse` that can also be credited; `defineCrafting({ key, wallet, list })` is a feature over a currencies feature, with
 * an optional timed queue: a recipe with `takesMs` makes one at a time on game time, so a queue finishes during an
 * absence.
 */

/** An amount per currency; a currency absent is none. */
export type Amounts<C extends string = string> = { readonly [P in C]?: DecimalSource };

/** What one input currency of a recipe charges: a flat amount, or a cost curve over how many have been crafted. */
export type RecipeInput = DecimalSource | CostCurve;

/** An input per currency; a currency absent is none. */
export type RecipeInputs<C extends string = string> = { readonly [P in C]?: RecipeInput };

/** How a recipe's flat inputs scale with each craft: one growth factor for all inputs, or per currency. */
export type RecipeGrowth<C extends string = string> = DecimalSource | { readonly [P in C]?: DecimalSource };

/** What a recipe takes and gives, per craft. */
export interface Recipe<C extends string = string> {
  readonly inputs: RecipeInputs<C>;
  readonly outputs: Amounts<C>;
  /**
   * What each further craft multiplies a flat input by (default 1: a flat price). A single number scales every flat
   * input; a record scales each currency at its own pace. Each scaled price is floored to a whole number, as in `tree`.
   */
  readonly costGrowth?: RecipeGrowth<C>;
}

/** A purse that can also be credited: what a craft pays from and pays into. */
export interface CraftPurse<C extends string = string> extends Purse<C> {
  credit(currency: C, amount: DecimalSource): void;
}

/** The entries of an amounts record above zero. */
function positive<C extends string>(amounts: Amounts<C>): [C, Decimal][] {
  const out: [C, Decimal][] = [];
  for (const [c, a] of Object.entries(amounts) as [C, DecimalSource | undefined][]) {
    if (a === undefined) continue;
    const d = D(a);
    if (d.gt(0)) out.push([c, d]);
  }
  return out;
}

const isCostCurve = (input: RecipeInput): input is CostCurve =>
  typeof input === "function" ||
  (typeof input === "object" && input !== null && "base" in input && "growth" in input);

const isGrowthRecord = <C extends string>(
  growth: RecipeGrowth<C>,
): growth is { readonly [P in C]?: DecimalSource } =>
  typeof growth === "object" && growth !== null && !("layer" in growth);

/** Each positive input of `recipe` as a `CostCurve` over how many have already been crafted. */
function inputCurves<C extends string>(recipe: Recipe<C>): [C, CostCurve][] {
  const out: [C, CostCurve][] = [];
  const rawGrowth = recipe.costGrowth;
  for (const [c, a] of Object.entries(recipe.inputs) as [C, RecipeInput | undefined][]) {
    if (a === undefined) continue;
    if (isCostCurve(a)) {
      if (typeof a === "function" || D(a.base).gt(0)) out.push([c, a]);
      continue;
    }
    const base = D(a);
    if (base.lte(0)) continue;
    if (rawGrowth === undefined) {
      out.push([c, { base, growth: ONE, round: "none" }]);
      continue;
    }
    const g = isGrowthRecord(rawGrowth) ? D(rawGrowth[c] ?? ONE) : D(rawGrowth);
    out.push([c, { base, growth: g, round: "floor" }]);
  }
  return out;
}

const timesOf = (times: number): number => (Number.isFinite(times) ? Math.max(0, Math.floor(times)) : 0);

/** What `times` crafts of `recipe` cost per input currency when `bought` have already been crafted. */
export function recipeCost<C extends string>(
  recipe: Recipe<C>,
  times = 1,
  bought = 0,
): Partial<Record<C, Decimal>> {
  const out: Partial<Record<C, Decimal>> = {};
  const n = timesOf(times);
  if (n <= 0) return out;
  for (const [c, curve] of inputCurves(recipe)) {
    const amount = n === 1 ? costAt(curve, bought) : costOfMany(curve, bought, n);
    if (amount.gt(0)) out[c] = amount;
  }
  return out;
}

/** Whether the purse covers every input of `times` crafts (at least one) when `bought` have already been crafted. */
export function canCraft<C extends string>(
  recipe: Recipe<C>,
  purse: Purse<C>,
  times = 1,
  bought = 0,
): boolean {
  const n = timesOf(times);
  if (n <= 0) return false;
  return inputCurves(recipe).every(([c, curve]) =>
    purse.balance(c).gte(n === 1 ? costAt(curve, bought) : costOfMany(curve, bought, n)),
  );
}

/**
 * How many crafts the purse covers when `bought` have already been crafted, `limit` at most: the fewest whole crafts
 * any input allows. A recipe that takes nothing is bounded by `limit` alone (0 without one).
 */
export function maxCraftable<C extends string>(
  recipe: Recipe<C>,
  purse: Purse<C>,
  limit = Number.POSITIVE_INFINITY,
  bought = 0,
): number {
  const curves = inputCurves(recipe);
  if (curves.length === 0) return Number.isFinite(limit) ? timesOf(limit) : 0;
  let n = Number.isFinite(limit) ? timesOf(limit) : Number.MAX_SAFE_INTEGER;
  for (const [c, curve] of curves) n = Math.min(n, maxAffordable(curve, bought, purse.balance(c), n));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * Takes the inputs of `times` crafts from the purse, all or nothing: false, with nothing taken, when it is short (a
 * purse that refuses a debit the check passed, by a rule of its own, gets back what was already taken).
 */
export function payRecipe<C extends string>(
  recipe: Recipe<C>,
  purse: CraftPurse<C>,
  times = 1,
  bought = 0,
): boolean {
  const n = timesOf(times);
  if (!canCraft(recipe, purse, n, bought)) return false;
  const taken: [C, Decimal][] = [];
  for (const [c, curve] of inputCurves(recipe)) {
    const amount = n === 1 ? costAt(curve, bought) : costOfMany(curve, bought, n);
    if (!purse.debit(c, amount)) {
      for (const [back, b] of taken) purse.credit(back, b);
      return false;
    }
    taken.push([c, amount]);
  }
  return true;
}

/** Credits the outputs of `times` crafts, scaled by `yieldMult`. Returns what was made. */
export function giveRecipe<C extends string>(
  recipe: Recipe<C>,
  purse: Pick<CraftPurse<C>, "credit">,
  times = 1,
  yieldMult: DecimalSource = 1,
): Partial<Record<C, Decimal>> {
  const made: Partial<Record<C, Decimal>> = {};
  const n = timesOf(times);
  if (n <= 0) return made;
  for (const [c, a] of positive(recipe.outputs)) {
    const amount = a.mul(n).mul(yieldMult);
    purse.credit(c, amount);
    made[c] = amount;
  }
  return made;
}

/**
 * Crafts `times` over: takes every input (scaled from `bought`), gives every output scaled by `yieldMult`, and returns
 * what was made, or null (nothing touched) when the purse is short. Multi-input, multi-output, Decimal amounts.
 */
export function craft<C extends string>(
  recipe: Recipe<C>,
  purse: CraftPurse<C>,
  times = 1,
  yieldMult: DecimalSource = 1,
  bought = 0,
): Partial<Record<C, Decimal>> | null {
  if (!payRecipe(recipe, purse, times, bought)) return null;
  return giveRecipe(recipe, purse, times, yieldMult);
}

/** One recipe of a crafting feature. The game's own fields (a name, a line) ride along. */
export interface RecipeDef<C extends string, G> extends Recipe<C> {
  readonly id: string;
  /** Whether it can be crafted now. Default: always. */
  readonly unlocked?: (state: G) => boolean;
  /** The most crafts of this recipe that may ever be made (queued crafts included). Default: no limit. */
  readonly limit?: number | ((state: G) => number);
  /** The multiplier on its outputs, read when they are given (default 1). */
  readonly yield?: (state: G) => DecimalSource;
  /**
   * How long one craft takes: the inputs are paid at once and the outputs given one at a time on game time. A
   * function of the state is read at each pass (a queue that speeds up): the craft under way keeps the progress it
   * has made, and the rest runs at the new time from that pass on.
   */
  readonly takesMs?: number | ((state: G) => number);
}

/**
 * A timed recipe's crafts under way: how many were asked, how many are given, and when the first began. For a
 * recipe whose time reads the state, `msEach` is the time per craft the job was last worked at, and `startedAt` is
 * where the job would have begun had every craft taken that long.
 */
export interface CraftJob {
  recipe: string;
  times: number;
  done: number;
  startedAt: number;
  msEach?: number;
}

/** The feature's saved state. */
export interface CraftingState {
  /** Crafts given per recipe id. */
  made: Record<string, Decimal>;
  /** Timed recipes under way, one job per recipe. */
  queue: CraftJob[];
}

/** Called once per batch of crafts given (instant, or off the queue in one pass), with how many. */
export type OnCraft<C extends string, G> = (
  draft: Draft<G>,
  recipe: RecipeDef<C, G>,
  times: number,
  now: number,
) => void;

/** The feature's actions. */
export interface CraftingActions {
  /** Crafts `times` (default 1), all or nothing: given now, or queued for a timed recipe. */
  craft(id: string, times?: number): boolean;
  /** Crafts as many as the wallet covers. Returns how many. */
  craftMax(id: string): number;
}

/** A crafting list's read-only questions over state. */
export interface CraftingSelect<G, C extends string = string> {
  /** Whether it is unlocked now. */
  open(state: G, id: string): boolean;
  /** What the next `times` (default 1) crafts of `id` cost per input currency now. */
  cost(state: G, id: string, times?: number): Partial<Record<C, Decimal>>;
  /** How many the wallet covers now (0 when locked or at its limit). */
  craftable(state: G, id: string): number;
  /** A timed recipe's job, or null. */
  job(state: G, id: string): CraftJob | null;
  /** Ms until a timed recipe's next craft is given, or null when none is under way. */
  nextInMs(state: G, id: string, now: number): number | null;
}

/** The fixed configuration of a crafting feature: the recipes as given, and a recipe by id. */
export interface CraftingFixed<C extends string, G> {
  readonly list: readonly RecipeDef<C, G>[];
  /** A recipe by id. */
  recipe(id: string): RecipeDef<C, G> | undefined;
}

/**
 * The helpers that take a draft first and change it, named like the actions they mirror, for a step or a game's own
 * action. A timed craft starts at `now` (default the state's `gameNow()` when it carries one, else 0).
 */
export interface CraftingDraftHelpers {
  /** Crafts `times` (default 1) inside a recipe, all or nothing, as the action: false when locked or short. */
  craft(draft: object, id: string, times?: number, now?: number): boolean;
  /** Crafts as many as the wallet covers inside a recipe. Returns how many. */
  craftMax(draft: object, id: string, now?: number): number;
}

/** The three namespaces of a crafting feature. */
export interface CraftingHelpers<C extends string, G> {
  readonly select: CraftingSelect<G, C>;
  readonly def: CraftingFixed<C, G>;
  readonly draft: CraftingDraftHelpers;
}

/** A `crafting` feature: the feature plus `select`, `def` and `draft`. */
export type CraftingFeature<K extends string, C extends string, G> = Feature<
  K,
  CraftingState,
  CraftingActions
> &
  CraftingHelpers<C, G>;

/**
 * Crafting as a feature over a currencies feature. It saves `{ made, queue }` under `key`. An instant recipe takes and
 * gives in the action's recipe. A timed recipe (`takesMs`) takes its inputs at once and joins its recipe's job (a
 * second craft of it extends the job); the step `<key>.produce.queue` gives each craft as its time passes, one at a
 * time, over a tick and over an absence alike. `onCraft` hears every batch given. A prestige reset clears it unless
 * `reset` says otherwise. The callbacks read the whole game state (the feature's own slice, the wallet's and what
 * `reach` names), typed with no annotation.
 */
export function defineCrafting<
  const K extends string,
  WK extends string,
  C extends string,
  WS extends object,
  WA extends object,
  const R extends ReachShape = readonly [],
  G extends object = Record<K, CraftingState> & Record<WK, WS> & ReachOf<R>,
>(def: {
  readonly key: K;
  /** The features the callbacks read, as `feature`'s `reach`; the wallet is reached already. */
  readonly reach?: R | (() => R);
  readonly wallet: CurrenciesFeature<WK, C, WS, WA>;
  readonly list: readonly RecipeDef<C, G>[];
  readonly reset?: ResetRule<CraftingState>;
  /** Called once per batch of crafts given, instant or off the queue, inside the recipe that gives them. */
  readonly onCraft?: OnCraft<C, G>;
}): CraftingFeature<K, C, G> & { readonly needs?: NeedsOf<R> } {
  const { wallet } = def;
  const byId = new Map<string, RecipeDef<C, G>>();
  for (const r of def.list) {
    if (byId.has(r.id)) throw new Error(`crafting "${def.key}": the recipe "${r.id}" appears twice`);
    if (typeof r.takesMs === "number" && !(r.takesMs > 0))
      throw new Error(`crafting "${def.key}": the time of "${r.id}" must be above zero`);
    byId.set(r.id, r);
  }
  /** A timed recipe's time per craft now (a state read at or below zero, or not a number, gives at once). */
  const takes = (state: G, r: RecipeDef<C, G>): number => {
    const t = typeof r.takesMs === "function" ? r.takesMs(state) : (r.takesMs ?? 0);
    return Number.isNaN(t) ? 0 : Math.max(t, 0);
  };

  type Own = Record<K, CraftingState> & CurrencyDraft<WK>;
  const own = (state: unknown): CraftingState => (state as Record<K, CraftingState>)[def.key];
  const purseOf = (draft: unknown): CraftPurse<C> => {
    const d = draft as CurrencyDraft<WK>;
    return { ...wallet.draft.purse(d), credit: (c, amount) => wallet.draft.credit(d, c, amount) };
  };
  const open = (state: G, r: RecipeDef<C, G>): boolean => r.unlocked?.(state) ?? true;
  const yieldOf = (state: G, r: RecipeDef<C, G>): DecimalSource => r.yield?.(state) ?? 1;
  /** How many crafts of `id` have already been paid for: given (`made`) plus still under way on the queue. */
  const boughtOf = (state: unknown, id: string): number => {
    const s = own(state);
    const made = Math.floor(s.made[id]?.toNumber() ?? 0);
    const job = s.queue.find((j) => j.recipe === id);
    const queued = job ? Math.max(0, job.times - job.done) : 0;
    return Math.max(0, made + queued);
  };
  /** How many more crafts of `r` its `limit` allows when `bought` have already been paid for. */
  const leftOf = (state: G, r: RecipeDef<C, G>, bought: number): number => {
    if (r.limit === undefined) return Number.POSITIVE_INFINITY;
    const cap = typeof r.limit === "function" ? r.limit(state) : r.limit;
    if (!Number.isFinite(cap)) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.floor(cap) - bought);
  };
  /** Gives `n` crafts: the outputs, the count, and the hook. */
  const give = (draft: Draft<Own>, r: RecipeDef<C, G>, n: number, now: number): void => {
    const state = draft as unknown as G;
    giveRecipe(r, purseOf(draft), n, yieldOf(state, r));
    const s = own(draft);
    s.made[r.id] = (s.made[r.id] ?? ZERO).add(n);
    def.onCraft?.(draft as unknown as Draft<G>, r, n, now);
  };

  const select: CraftingSelect<G, C> = {
    open: (state, id) => {
      const r = byId.get(id);
      return r !== undefined && open(state, r);
    },
    cost: (state, id, times = 1) => {
      const r = byId.get(id);
      return r ? recipeCost(r, times, boughtOf(state, id)) : {};
    },
    craftable: (state, id) => {
      const r = byId.get(id);
      if (!r || !open(state, r)) return 0;
      const bought = boughtOf(state, id);
      const left = leftOf(state, r, bought);
      return left > 0
        ? maxCraftable(r, wallet.draft.purse(state as unknown as CurrencyDraft<WK>), left, bought)
        : 0;
    },
    job: (state, id) => own(state).queue.find((j) => j.recipe === id) ?? null,
    nextInMs: (state, id, now) => {
      const r = byId.get(id);
      const job = own(state).queue.find((j) => j.recipe === id);
      if (r?.takesMs === undefined || !job) return null;
      const each = job.msEach ?? takes(state, r);
      return Math.max(0, job.startedAt + (job.done + 1) * each - now);
    },
  };

  /** Crafts `n` inside a recipe at `now`: given at once, or queued. */
  const craftDraft = (draft: Draft<Own>, id: string, n: number, now: number): boolean => {
    const r = byId.get(id);
    const state = draft as unknown as G;
    if (!r || n <= 0 || !open(state, r)) return false;
    const bought = boughtOf(draft, id);
    if (n > leftOf(state, r, bought)) return false;
    if (!payRecipe(r, purseOf(draft), n, bought)) return false;
    if (r.takesMs === undefined) {
      give(draft, r, n, now);
      return true;
    }
    deliver(draft, now); // a job already done is closed before a new craft joins it
    const s = own(draft);
    const job = s.queue.find((j) => j.recipe === id);
    if (job) job.times += n;
    else
      s.queue.push({
        recipe: id,
        times: n,
        done: 0,
        startedAt: now,
        ...(typeof r.takesMs === "function" && { msEach: takes(state, r) }),
      });
    return true;
  };

  /**
   * Gives every timed craft whose time has passed by `now`. A time that reads the state runs the span since the last
   * pass at the time the job was last worked at, then re-anchors the job on this pass's time, its progress kept.
   */
  const deliver = (draft: Draft<Own>, now: number): void => {
    const s = own(draft);
    if (s.queue.length === 0) return;
    const state = draft as unknown as G;
    for (const job of s.queue) {
      const r = byId.get(job.recipe);
      if (r?.takesMs === undefined) {
        job.done = job.times; // a recipe this build no longer times: dropped below
        continue;
      }
      const timed = typeof r.takesMs === "function";
      const each = timed ? (job.msEach ?? takes(state, r)) : takes(state, r);
      const progress = each > 0 ? Math.max(0, now - job.startedAt) / each : Number.POSITIVE_INFINITY;
      const finished = Math.min(job.times, Math.floor(progress));
      const n = finished - job.done;
      if (n > 0) {
        give(draft, r, n, now);
        job.done = finished;
      }
      if (timed && job.done < job.times) {
        const next = takes(state, r);
        if (next !== each) job.startedAt = now - progress * next;
        job.msEach = next;
      }
    }
    s.queue = s.queue.filter((j) => j.done < j.times);
  };

  /** Crafts as many as the wallet covers inside a recipe. */
  const craftMaxDraft = (draft: Draft<Own>, id: string, now: number): number => {
    const r = byId.get(id);
    const state = draft as unknown as G;
    if (!r || !open(state, r)) return 0;
    const bought = boughtOf(draft, id);
    const left = leftOf(state, r, bought);
    const most = left > 0 ? maxCraftable(r, purseOf(draft), left, bought) : 0;
    return craftDraft(draft, id, most, now) ? most : 0;
  };

  const made = defineFeature<K, CraftingState, CraftingActions, ReachShape, Record<never, never>, Own>({
    reach: def.reach,
    key: def.key,
    initial: (): CraftingState => ({ made: {}, queue: [] }),
    reset: def.reset ?? "run",
    actions: (api: FeatureApi<Own>): CraftingActions => ({
      craft: (id, times = 1) => {
        let ok = false;
        const now = api.now();
        api.set((d) => {
          ok = craftDraft(d, id, Math.floor(times), now);
        });
        return ok;
      },
      craftMax: (id) => {
        let n = 0;
        const now = api.now();
        api.set((d) => {
          n = craftMaxDraft(d, id, now);
        });
        return n;
      },
    }),
    steps: {
      produce: {
        queue: { pass: "both", run: (d: Draft<Own>, ctx) => deliver(d, ctx.now) },
      },
    },
  });
  const clockOf = (state: unknown, now?: number): number =>
    now ?? (state as { gameNow?: () => number }).gameNow?.() ?? 0;
  const helpers: CraftingHelpers<C, G> = {
    select,
    def: { list: def.list, recipe: (id) => byId.get(id) },
    draft: {
      craft: (draft, id, times = 1, now) =>
        craftDraft(draft as Draft<Own>, id, timesOf(times), clockOf(draft, now)),
      craftMax: (draft, id, now) => craftMaxDraft(draft as Draft<Own>, id, clockOf(draft, now)),
    },
  };
  return Object.assign(made, helpers) as CraftingFeature<K, C, G> & { readonly needs?: NeedsOf<R> };
}
