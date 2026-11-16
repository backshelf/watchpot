import type { Draft } from "immer";
import type { CurrenciesFeature, CurrencyDraft, Purse } from "./currencies";
import { D, type Decimal, type DecimalSource, ZERO } from "./decimal";
import {
  type Feature,
  type FeatureApi,
  feature,
  type NeedsOf,
  type ReachOf,
  type ReachShape,
  type ResetRule,
} from "./feature";

/**
 * Recipes: crafting, inputs to outputs. A recipe takes amounts of some currencies and gives amounts of others, all
 * or nothing, as many times over as asked; a yield multiplier scales what it gives. The pure rules work over a
 * `Purse` that can also be credited; `crafting({ key, wallet, list })` is a feature over a currencies feature, with
 * an optional timed queue: a recipe with `takesMs` makes one at a time on game time, so a queue finishes during an
 * absence.
 */

/** An amount per currency; a currency absent is none. */
export type Amounts<C extends string = string> = { readonly [P in C]?: DecimalSource };

/** What a recipe takes and gives, per craft. */
export interface Recipe<C extends string = string> {
  readonly inputs: Amounts<C>;
  readonly outputs: Amounts<C>;
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

const timesOf = (times: number): number => (Number.isFinite(times) ? Math.max(0, Math.floor(times)) : 0);

/** Whether the purse covers every input of `times` crafts (at least one). */
export function canCraft<C extends string>(recipe: Recipe<C>, purse: Purse<C>, times = 1): boolean {
  const n = timesOf(times);
  if (n <= 0) return false;
  return positive(recipe.inputs).every(([c, a]) => purse.balance(c).gte(a.mul(n)));
}

/**
 * How many crafts the purse covers, `limit` at most: the fewest whole crafts any input allows. A recipe that takes
 * nothing is bounded by `limit` alone (0 without one).
 */
export function maxCraftable<C extends string>(
  recipe: Recipe<C>,
  purse: Purse<C>,
  limit = Number.POSITIVE_INFINITY,
): number {
  const inputs = positive(recipe.inputs);
  if (inputs.length === 0) return Number.isFinite(limit) ? timesOf(limit) : 0;
  let n = Number.isFinite(limit) ? timesOf(limit) : Number.MAX_SAFE_INTEGER;
  for (const [c, a] of inputs) n = Math.min(n, purse.balance(c).div(a).floor().toNumber());
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * Takes the inputs of `times` crafts from the purse, all or nothing: false, with nothing taken, when it is short (a
 * purse that refuses a debit the check passed, by a rule of its own, gets back what was already taken).
 */
export function payRecipe<C extends string>(recipe: Recipe<C>, purse: CraftPurse<C>, times = 1): boolean {
  const n = timesOf(times);
  if (!canCraft(recipe, purse, n)) return false;
  const taken: [C, Decimal][] = [];
  for (const [c, a] of positive(recipe.inputs)) {
    const amount = a.mul(n);
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
 * Crafts `times` over: takes every input, gives every output scaled by `yieldMult`, and returns what was made, or
 * null (nothing touched) when the purse is short. Multi-input, multi-output, Decimal amounts.
 */
export function craft<C extends string>(
  recipe: Recipe<C>,
  purse: CraftPurse<C>,
  times = 1,
  yieldMult: DecimalSource = 1,
): Partial<Record<C, Decimal>> | null {
  if (!payRecipe(recipe, purse, times)) return null;
  return giveRecipe(recipe, purse, times, yieldMult);
}

/** One recipe of a crafting feature. The game's own fields (a name, a line) ride along. */
export interface RecipeDef<C extends string, G> extends Recipe<C> {
  readonly id: string;
  /** Whether it can be crafted now. Default: always. */
  readonly unlocked?: (state: G) => boolean;
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
export interface CraftingSelect<G> {
  /** Whether it is unlocked now. */
  open(state: G, id: string): boolean;
  /** How many the wallet covers now (0 when locked). */
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
  readonly select: CraftingSelect<G>;
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
export function crafting<
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
  /** Gives `n` crafts: the outputs, the count, and the hook. */
  const give = (draft: Draft<Own>, r: RecipeDef<C, G>, n: number, now: number): void => {
    const state = draft as unknown as G;
    giveRecipe(r, purseOf(draft), n, yieldOf(state, r));
    const s = own(draft);
    s.made[r.id] = (s.made[r.id] ?? ZERO).add(n);
    def.onCraft?.(draft as unknown as Draft<G>, r, n, now);
  };

  const select: CraftingSelect<G> = {
    open: (state, id) => {
      const r = byId.get(id);
      return r !== undefined && open(state, r);
    },
    craftable: (state, id) => {
      const r = byId.get(id);
      return r && open(state, r)
        ? maxCraftable(r, wallet.draft.purse(state as unknown as CurrencyDraft<WK>))
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
    if (!payRecipe(r, purseOf(draft), n)) return false;
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
    if (!r || !open(draft as unknown as G, r)) return 0;
    const most = maxCraftable(r, purseOf(draft));
    return craftDraft(draft, id, most, now) ? most : 0;
  };

  const made = feature<K, CraftingState, CraftingActions, ReachShape, Record<never, never>, Own>({
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
