import type { Draft } from "immer";
import { Decimal, type DecimalSource, ZERO } from "../decimal";
import {
  type Feature,
  type FeatureApi,
  type FeatureSpec,
  type FeatureSteps,
  feature,
  type InitialContext,
  type Migration,
  type ResetRule,
  type ResetRunContext,
  type StateOf,
} from "../feature";
import type { RngState } from "../rng";

/**
 * The prestige primitive: a feature that sits above the run. It owns the prestige currency, the lifetime record
 * (every unit ever paid) and the number of resets, and one action that pays the gain and calls the store's
 * `resetRun`. The game says what the reset pays, when it may happen and what follows it; the rest of its
 * prestige layer (a tree to spend on, offers, a phase) is the feature's own extra state and actions.
 */

/** The fields the primitive owns. Never reset: the layer is above the run. */
export interface PrestigeCore {
  /** Resets so far; the first run has 0. */
  runs: number;
  /** Unspent prestige currency. */
  currency: Decimal;
  /** Every unit ever paid. */
  lifetime: Decimal;
}

/** What `afterReset` is told: the gain paid, the game time the reset ran at, and the reset's number (from 1). */
export interface PrestigeResult {
  readonly gain: Decimal;
  readonly now: number;
  readonly run: number;
}

/** The reset action: pays the gain and resets the run at game time `now` (default: now). Returns whether it ran. */
export type PrestigeReset = (now?: number) => boolean;

/** The definition `prestige` takes: key, gain, the reset hooks, and the layer's own state, actions and steps. */
export interface PrestigeDef<
  K extends string,
  N extends string,
  X extends object,
  A extends object,
  R extends readonly FeatureSpec[],
  G extends object,
> {
  /** The saved key. */
  readonly key: K;
  /** The reset action's name on the feature (default `"reset"`). */
  readonly action?: N;
  readonly reach?: R;
  /** The feature's own fields beside `runs`, `currency` and `lifetime`. */
  readonly initial?: (ctx: InitialContext) => X;
  /** What a reset pays now. Pure: the preview and the reset both read it. */
  readonly gain: (draft: Draft<G>) => Decimal;
  /**
   * Whether the reset may happen. It sees the draft inside the reset's recipe and may settle it first (the write
   * stands even when it refuses). Default: the gain is above zero.
   */
  readonly canReset?: (draft: Draft<G>) => boolean;
  /** Writes after the check and before the gain is read (end what the gain should count), at game time `now`. */
  readonly beforeReset?: (draft: Draft<G>, now: number) => void;
  /** Writes after the run is reset and `runs` counted (a phase, a record of what was paid). */
  readonly afterReset?: (draft: Draft<G>, result: PrestigeResult) => void;
  /**
   * The rng label of reset number `run` (from 1), so a seeded store's runs draw the same on every load.
   * Default: `run<n>`.
   */
  readonly runLabel?: (run: number) => string;
  /**
   * How deep the reset reaches (default 1). A layer above another resets at depth 2: it also resets every feature
   * whose rule says `{ depth: 2 }`, the layer beneath it among them.
   */
  readonly depth?: number;
  /**
   * What a reset does to this layer's own state (default `"never"`: a layer is above the run). A layer with another
   * above it says `{ depth: 2 }`, so the higher layer's reset starts it over.
   */
  readonly reset?: ResetRule<PrestigeCore & X>;
  /** The feature's own actions beside the reset; `reset` is the reset action, to wrap or call. */
  readonly actions?: (api: FeatureApi<G>, reset: PrestigeReset) => A;
  readonly steps?: FeatureSteps<G>;
  readonly transient?: readonly (keyof X & string)[];
  readonly migrations?: Readonly<Record<number, Migration>>;
  readonly merge?: (merged: PrestigeCore & X, fresh: PrestigeCore & X) => PrestigeCore & X;
}

/** What the draft helper needs from the recipe it runs in: the game time, and the run reset (a step's `ctx.resetRun`). */
export interface PrestigeDraftContext {
  readonly now: number;
  resetRun(draft: object, ctx?: ResetRunContext): void;
  /** The reset's rng; left out, the reset draws its own default. */
  readonly rng?: RngState;
}

/** A prestige layer's draft helper. */
export interface PrestigeHelpers {
  /**
   * The reset inside a recipe or a step (an autobuyer that resets for the player): the same checks, gain, run reset
   * and hooks as the action. Returns whether it ran.
   */
  resetDraft(draft: object, ctx: PrestigeDraftContext): boolean;
}

const runLabelOf = (run: number): string => `run${run}`;

/**
 * Declares a prestige layer. Its state is `PrestigeCore` plus the extras `initial` returns; its actions are the
 * reset under `action`'s name plus its own. The reset, inside one recipe: `canReset`, `beforeReset`, the gain
 * added to `currency` and `lifetime`, the store's `resetRun` at `now` with the rng `runLabel(runs + 1)`, `runs`
 * counted, `afterReset`.
 */
export function prestige<
  const K extends string,
  X extends object = Record<never, never>,
  A extends object = Record<never, never>,
  const N extends string = "reset",
  const R extends readonly FeatureSpec[] = readonly [],
  G extends object = Record<K, PrestigeCore & X> & StateOf<R>,
>(
  def: PrestigeDef<K, N, X, A, R, G>,
): Feature<K, PrestigeCore & X, Record<N, PrestigeReset> & A> & PrestigeHelpers {
  const name = (def.action ?? "reset") as N;
  const label = def.runLabel ?? runLabelOf;
  const layer = (s: Draft<G>): PrestigeCore => (s as Record<string, PrestigeCore>)[def.key] as PrestigeCore;
  const canReset = def.canReset ?? ((s: Draft<G>) => def.gain(s).gt(0));

  /** The reset inside a recipe: the checks, the gain, the run reset, the count and the hooks. */
  const run = (
    s: Draft<G>,
    now: number,
    resetRun: PrestigeDraftContext["resetRun"],
    rng: (run: number) => RngState | undefined,
  ): boolean => {
    if (!canReset(s)) return false;
    def.beforeReset?.(s, now);
    const gain = def.gain(s);
    const p = layer(s);
    p.currency = p.currency.add(gain);
    p.lifetime = p.lifetime.add(gain);
    resetRun(s, { now, rng: rng(p.runs + 1), depth: def.depth });
    const q = layer(s);
    q.runs += 1;
    def.afterReset?.(s, { gain, now, run: q.runs });
    return true;
  };

  const actions = (api: FeatureApi<G>): Record<N, PrestigeReset> & A => {
    const reset: PrestigeReset = (now = api.now()) => {
      let ran = false;
      api.set((s) => {
        ran = run(
          s,
          now,
          (d, c) => api.resetRun(d as Draft<G>, c),
          (n) => api.rng(label(n)),
        );
      });
      return ran;
    };
    const own = def.actions?.(api, reset) ?? ({} as A);
    return { [name]: reset, ...own } as Record<N, PrestigeReset> & A;
  };

  const made = feature<K, PrestigeCore & X, Record<N, PrestigeReset> & A, R, Record<never, never>, G>({
    key: def.key,
    reach: def.reach,
    initial: (ctx) => ({ runs: 0, currency: ZERO, lifetime: ZERO, ...(def.initial?.(ctx) ?? ({} as X)) }),
    transient: def.transient,
    actions,
    steps: def.steps,
    reset: def.reset ?? "never",
    migrations: def.migrations,
    merge: def.merge,
  });
  const helpers: PrestigeHelpers = {
    resetDraft: (draft, ctx) => run(draft as Draft<G>, ctx.now, ctx.resetRun, () => ctx.rng),
  };
  return Object.assign(made, helpers);
}

/** The standing multiplier lifetime currency gives: `1 + k × lifetime ^ exp`. Exactly 1 with nothing earned. */
export function lifetimeMultiplier(lifetime: Decimal, t: { k: number; exp: number }): number {
  const n = Math.max(0, lifetime.toNumber());
  if (!(n > 0)) return 1;
  return 1 + t.k * n ** t.exp;
}

/**
 * The usual prestige curve: `floor(k × (amount / per) ^ exp × mult)`, never negative. `per` is the amount that
 * pays `k`; an `exp` below 1 makes each further `per` worth a little less.
 */
export function powerGain(
  amount: Decimal,
  t: { k: number; exp: number; per: DecimalSource; mult?: DecimalSource },
): Decimal {
  const units = Decimal.max(0, amount.div(t.per));
  return Decimal.max(
    0,
    units
      .pow(t.exp)
      .mul(t.k)
      .mul(Decimal.max(0, t.mult ?? 1))
      .floor(),
  );
}

/**
 * How fast a reset would grow what it pays into, in orders of magnitude a second:
 * `log10(1 + gain / kept) / seconds`. While the gain is small beside what is kept this is the gain a second (over
 * `kept × ln 10`), so its peak is the best rate; while the gain dwarfs what is kept it is the leap a second, so a
 * reset worth many times everything held is taken once it stops leaping rather than sat in. One figure for "reset
 * now?" on both sides: track its best since the last reset and reset when it falls to a share of that. `floorS` is
 * the least seconds counted (default 1): before it the pace only rises, so nothing peaks in its first moments.
 */
export function resetPace(gain: Decimal, kept: Decimal, seconds: number, floorS = 1): number {
  if (gain.lte(0)) return 0;
  const ratio = gain.div(Decimal.max(kept, 1));
  // Under a billionth, `1 + ratio` rounds to one: log10(1 + r) is r / ln 10 there.
  const orders = ratio.lt(1e-9) ? ratio.toNumber() / Math.LN10 : ratio.add(1).log10().toNumber();
  return orders / Math.max(seconds, floorS, 1e-3);
}
