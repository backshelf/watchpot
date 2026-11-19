import type { Draft } from "immer";
import { D, Decimal, type DecimalSource, ZERO } from "../decimal";
import {
  applyReachedRule,
  defineFeature,
  type Feature,
  type FeatureApi,
  type FeatureSpec,
  type FeatureSteps,
  type InitialContext,
  type Migration,
  type Move,
  type NeedsOf,
  type ReachedRule,
  type ReachOf,
  type ReachShape,
  type ReachType,
  type ResetRule,
  type ResetRunContext,
  resetRuleOf,
} from "../feature";
import type { RngState } from "../rng";

/**
 * The prestige primitive: a feature that sits above the run. It owns the number of resets, every unit ever paid,
 * when the current run began, and the run's best reset pace; it holds the prestige currency itself unless `payInto`
 * names a wallet currency to credit instead. One action pays the gain and calls the store's `resetRun`. The game says
 * what the reset pays, when it may happen and what follows it; the rest of its prestige layer (a tree to spend on,
 * offers, a phase) is the feature's own extra state and actions.
 *
 * The feature carries `select` (read-only questions: what is held, what a reset pays, the pace at a moment), `def`
 * (its fixed configuration) and `draft` (the reset inside a recipe, under the action's name).
 */

/** The fields every prestige layer owns. */
export interface PrestigeCore {
  /** Resets so far; the first run has 0. */
  runs: number;
  /**
   * Every unit this layer has paid since its own state began: ever, for a layer nothing resets (the default), or
   * since the layer above last reset, for one whose `reset` rule a deeper reset reaches.
   */
  lifetime: Decimal;
  /**
   * The best single gain this layer has ever paid. It survives every reset except a full profile reset, even one
   * that starts this layer's own fields over and wipes its `lifetime` (a higher layer's reset), so a milestone
   * keyed on it cannot be farmed by spamming resets that pay next to nothing.
   */
  best: Decimal;
  /**
   * The ids of the milestones reached so far, in the order they were reached. Permanent: no reset takes one back.
   */
  milestones: readonly string[];
  /**
   * Game time this layer's run began: its last reset, or any deeper one (a `resetRun` at this layer's depth or more),
   * or the profile's start. Steps and selects read run length off it.
   */
  runStart: number;
  /** The best reset pace this run (orders of magnitude a second, `resetPace`); back to 0 when a run begins. */
  peak: number;
  /** Game time the pace was last read at: the end of the last pass. The derived `pace` is as of this moment. */
  paceAt: number;
}

/** The prestige currency, held on the layer's own slice: only when the layer does not pay into a wallet. */
export interface PrestigeHeld {
  /** Unspent prestige currency. */
  currency: Decimal;
}

/** What a prestige milestone can count. */
export const PRESTIGE_MILESTONE_ONS = ["best", "total", "runs", "seconds"] as const;

/**
 * What a milestone counts: `best` (the best single gain this layer has paid, the default), `total` (its `lifetime`),
 * `runs` (its reset count) or `seconds` (the longest run in the layer).
 */
export type PrestigeMilestoneOn = (typeof PRESTIGE_MILESTONE_ONS)[number];

/** A permanent unlock, reached the first time what it counts reaches `at`, and never lost. */
export interface PrestigeMilestoneDef {
  readonly id: string;
  /** The label a page shows (default: the id). */
  readonly name?: string;
  readonly text?: string;
  readonly at: DecimalSource;
  /**
   * What it counts (default: `best`). A count of resets can be farmed by spamming trivial resets; `best` cannot,
   * and `seconds` asks the run to last.
   */
  readonly on?: PrestigeMilestoneOn;
}

/**
 * The derived values every prestige layer serves on its slice, worked out from the state (never saved): the reset
 * pace as of `paceAt`, that pace as a share of this run's best, and whether the run is past its peak.
 */
export interface PrestigePaceValues {
  /** How fast a reset now would grow what it pays into, in orders of magnitude a second (`resetPace`). 0 when it pays nothing. */
  readonly pace: number;
  /**
   * The pace as a share of this run's best: 1 at the peak (or while the pace still rises past the peak on record),
   * falling toward 0 as the run slows. 0 when a reset pays nothing.
   */
  readonly peakShare: number;
  /** True once a reset pays and its pace has fallen under `pace.past` of this run's best: the moment to reset. */
  readonly pastPeak: boolean;
}

/** A layer's state: the core, the currency held on the slice unless it pays into a wallet, and its own fields. */
export type PrestigeState<W extends string, X extends object> = PrestigeCore &
  ([W] extends [never] ? PrestigeHeld : Record<never, never>) &
  X;

/** What `afterReset` is told: the gain paid, the game time the reset ran at, and the reset's number (from 1). */
export interface PrestigeResult {
  readonly gain: Decimal;
  readonly now: number;
  readonly run: number;
}

/** The reset action: pays the gain and resets the run at game time `now` (default: now). Returns whether it ran. */
export type PrestigeReset = (now?: number) => boolean;

/**
 * The wallet a layer may pay into: a `currencies` feature (anything with its `select`, `draft` and `def`). Its
 * currency must outlive the layer's own reset (`depth` above the layer's), or the next reset would wipe the payout.
 */
export interface PrestigeWallet<W extends string> extends FeatureSpec {
  readonly select: { balance(state: never, currency: W): Decimal };
  readonly draft: { credit(draft: never, currency: W, amount: DecimalSource): void };
  readonly def: { readonly currencies: readonly W[]; readonly depth: { readonly [P in W]: number } };
}

/**
 * How the layer reads "is it worth resetting yet". Every layer keeps the pace; this tunes it. The pace is
 * `resetPace(gain, kept, seconds into the run, floorS)`; the layer keeps this run's best in `peak` (a `settle` step
 * named `pace` raises it every pass) and the run is past its peak once the pace falls under `past` of that best.
 */
export interface PrestigePaceDef<G extends object> {
  /** The share of this run's best pace under which the run is past its peak (default 0.8): in (0, 1]. */
  readonly past?: number;
  /** The fewest seconds the pace divides by (default 1): before it the pace only rises, so nothing peaks early. */
  readonly floorS?: number;
  /**
   * What a reset grows (default: the layer's `lifetime`, every unit it has paid while its state lasts). A layer
   * whose payout is spent and should be measured against what is held reads the balance here instead.
   */
  readonly kept?: (state: Draft<G>) => Decimal;
}

/** The definition `prestige` takes: key, gain, the reset hooks, the pace, and the layer's own state, actions and steps. */
export interface PrestigeDef<
  K extends string,
  N extends string,
  W extends string,
  X extends object,
  A extends object,
  R extends ReachShape,
  G extends object,
> {
  /** The saved key. */
  readonly key: K;
  /** The reset action's name on the feature, and the reset's name under `draft` (default `"reset"`). */
  readonly action?: N;
  /**
   * The features the callbacks read or write (`gain`, the hooks, `kept`, `actions`, `steps`): a list, a function
   * returning one, or `reach<{ key: State }>()`, as `FeatureDef.reach`. A `payInto` wallet is reached on its own.
   */
  readonly reach?: R | (() => R);
  /**
   * Where a reset pays: a wallet and one of its currencies. The reset credits it there (through the wallet's
   * `draft.credit`, so its totals count it) after the run is reset, and the layer keeps no `currency` of its own.
   * Left out, the layer holds the currency on its slice. `select.held` reads it either way.
   */
  readonly payInto?: { readonly wallet: PrestigeWallet<W>; readonly currency: NoInfer<W> };
  /** The feature's own fields beside the core. */
  readonly initial?: (ctx: InitialContext) => X;
  /** What a reset pays now. Pure: the preview, the reset and the pace all read it. */
  readonly gain: (draft: Draft<G>) => Decimal;
  /**
   * Whether the reset may happen. It sees the draft inside the reset's recipe and may settle it first (the write
   * stands even when it refuses). Default: the gain is above zero.
   */
  readonly canReset?: (draft: Draft<G>) => boolean;
  /** Writes after the check and before the gain is read (end what the gain should count), at game time `now`. */
  readonly beforeReset?: (draft: Draft<G>, now: number) => void;
  /** Writes after the run is reset, the gain paid and `runs` counted (a phase, a record of what was paid). */
  readonly afterReset?: (draft: Draft<G>, result: PrestigeResult) => void;
  /** Tunes the reset pace (see `PrestigePaceDef`); every layer keeps one. */
  readonly pace?: PrestigePaceDef<G>;
  /**
   * Permanent unlocks, reached the first time what one counts reaches its `at`; no reset takes one back. Checked
   * after every reset and in the layer's `settle.pace` step, so a `seconds` milestone lands while the run waits.
   * `select.reached(state, id)` answers whether one is reached.
   */
  readonly milestones?: readonly PrestigeMilestoneDef[];
  /**
   * What a reset is worth to the sim's auto-player now, in the unit of its objective (at or below 0 it is never
   * taken). A reset does not raise the objective at once, so the auto-player cannot work this out itself: with
   * `worth` the layer declares one free move, `<key>.<action>`, that presses the reset; without it the layer
   * declares no move and the auto-player never resets. `(s) => (s.rebirth.pastPeak ? 1 : 0)` resets on the pace.
   */
  readonly worth?: (state: G) => number;
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
   * above it says `{ depth: 2 }`, so the higher layer's reset starts it over. Whatever the rule, a reset at this
   * layer's `depth` or deeper starts its run: `runStart` lands on the reset's time and `peak` on 0.
   */
  readonly reset?: ResetRule<PrestigeState<W, X>>;
  /** The feature's own actions beside the reset; `reset` is the reset action, to wrap or call. */
  readonly actions?: (api: FeatureApi<G>, reset: PrestigeReset) => A;
  /** The feature's own steps. The `settle` phase's step named `pace` is the layer's own. */
  readonly steps?: FeatureSteps<G>;
  readonly transient?: readonly (keyof X & string)[];
  readonly migrations?: Readonly<Record<number, Migration>>;
  readonly merge?: (merged: PrestigeState<W, X>, fresh: PrestigeState<W, X>) => PrestigeState<W, X>;
}

/** What the draft reset needs from the recipe it runs in: the game time, and the run reset (a step's `ctx.resetRun`). */
export interface PrestigeDraftContext {
  readonly now: number;
  resetRun(draft: object, ctx?: ResetRunContext): void;
  /** The reset's rng; left out, the reset draws its own default. */
  readonly rng?: RngState;
}

/** The read-only questions over a game state that holds the layer (and the wallet it pays into). */
export interface PrestigeSelect<G extends object> {
  /** The prestige currency held: the wallet's balance under `payInto`, else the layer's own `currency`. */
  held(state: G): Decimal;
  /** What a reset would pay now. */
  gain(state: G): Decimal;
  /** Seconds into this layer's run at game time `now`. */
  runSeconds(state: G, now: number): number;
  /** The reset pace at game time `now`, for a page that redraws between passes (the derived `pace` is as of `paceAt`). */
  pace(state: G, now: number): number;
  /** Whether the layer has reached the milestone `id`. Permanent: once true, it stays true. */
  reached(state: G, id: string): boolean;
}

/** A layer's fixed configuration. */
export interface PrestigeConfig<N extends string, W extends string> {
  /** The reset action's name. */
  readonly action: N;
  /** How deep its reset reaches. */
  readonly depth: number;
  /** The pace's tuning, defaults filled in. */
  readonly pace: { readonly past: number; readonly floorS: number };
  /** The wallet key and currency it pays into, or null when it holds its own. */
  readonly payInto: { readonly wallet: string; readonly currency: W } | null;
}

/** The draft reset, under the action's name: the same checks, gain, run reset and hooks as the action. */
export type PrestigeDraftHelpers<N extends string> = {
  readonly [P in N]: (draft: object, ctx: PrestigeDraftContext) => boolean;
};

/** A layer's three namespaces. */
export interface PrestigeHelpers<N extends string, W extends string, G extends object> {
  readonly select: PrestigeSelect<G>;
  readonly def: PrestigeConfig<N, W>;
  readonly draft: PrestigeDraftHelpers<N>;
}

/** A prestige layer: the feature (its derived pace values included) plus `select`, `def` and `draft`. */
export type PrestigeFeature<
  K extends string,
  N extends string,
  W extends string,
  X extends object,
  A extends object,
  R extends ReachShape,
  G extends object,
> = Feature<K, PrestigeState<W, X>, Record<N, PrestigeReset> & A, NeedsOf<R>, PrestigePaceValues> &
  PrestigeHelpers<N, W, G>;

/** The name of the layer's own `settle` step. */
const PACE_STEP = "pace";
const runLabelOf = (run: number): string => `run${run}`;

/**
 * Declares a prestige layer. Its state is `PrestigeCore` (plus `currency` unless it pays into a wallet) plus the
 * extras `initial` returns; its slice also serves `pace`, `peakShare` and `pastPeak`. The reset, inside one recipe:
 * `canReset`, `beforeReset`, the gain added to `lifetime` (and `best` raised to it), the store's `resetRun` at `now`
 * with the rng `runLabel(runs + 1)`, the gain credited to the `payInto` wallet, `runs` counted, the milestones
 * reached, `afterReset`. Throws at definition when `payInto` names a currency the wallet lacks or one the layer's own
 * reset would wipe, when `pace.past` is outside (0, 1], when a milestone id repeats, counts an unknown `on` or asks
 * for an `at` not above 0, or when the game's steps take the `settle.pace` name.
 */
export function definePrestige<
  const K extends string,
  X extends object = Record<never, never>,
  A extends object = Record<never, never>,
  const N extends string = "reset",
  W extends string = never,
  const R extends ReachShape = readonly [],
  G extends object = Record<K, PrestigeState<W, X> & PrestigePaceValues> & ReachOf<R>,
>(def: PrestigeDef<K, N, W, X, A, R, G>): PrestigeFeature<K, N, W, X, A, R, G> {
  type S = PrestigeState<W, X>;
  const name = (def.action ?? "reset") as N;
  const label = def.runLabel ?? runLabelOf;
  const depth = def.depth ?? 1;
  const past = def.pace?.past ?? 0.8;
  const floorS = def.pace?.floorS ?? 1;
  const pay = def.payInto;
  if (!(past > 0 && past <= 1))
    throw new Error(`prestige "${def.key}": pace.past must be in (0, 1]; got ${past}`);
  if (pay) {
    if (!pay.wallet.def.currencies.includes(pay.currency))
      throw new Error(
        `prestige "${def.key}": the wallet "${pay.wallet.key}" has no currency "${pay.currency}"`,
      );
    const wiped = pay.wallet.def.depth[pay.currency];
    if (wiped <= depth)
      throw new Error(
        `prestige "${def.key}": "${pay.currency}" is wiped by a reset of depth ${wiped}, so this layer's own reset (depth ${depth}) would take back what it paid; give it depth: { ${pay.currency}: ${depth + 1} } or "never" in the wallet`,
      );
  }
  if (def.steps?.settle && PACE_STEP in def.steps.settle)
    throw new Error(
      `prestige "${def.key}": the settle step "${PACE_STEP}" is the layer's own; name yours otherwise`,
    );
  const milestoneIds = new Set<string>();
  for (const m of def.milestones ?? []) {
    if (milestoneIds.has(m.id))
      throw new Error(`prestige "${def.key}": the milestone "${m.id}" is declared twice`);
    milestoneIds.add(m.id);
    if (m.on !== undefined && !(PRESTIGE_MILESTONE_ONS as readonly string[]).includes(m.on))
      throw new Error(`prestige "${def.key}": the milestone "${m.id}" counts an unknown "${String(m.on)}"`);
    if (!D(m.at).gt(0))
      throw new Error(
        `prestige "${def.key}": the milestone "${m.id}" needs an at above 0; got ${String(m.at)}`,
      );
  }

  type Slice = PrestigeCore & Partial<PrestigeHeld>;
  const layer = (s: object): Slice => (s as Record<string, Slice>)[def.key] as Slice;
  const asG = (s: object) => s as Draft<G>;
  const canReset = def.canReset ?? ((s: Draft<G>) => def.gain(s).gt(0));
  const kept = def.pace?.kept ?? ((s: Draft<G>) => layer(s).lifetime);
  const held = (s: object): Decimal =>
    pay ? pay.wallet.select.balance(s as never, pay.currency) : (layer(s).currency ?? ZERO);
  const runSeconds = (s: object, now: number): number => Math.max(0, (now - layer(s).runStart) / 1000);
  const paceAt = (s: object, now: number): number =>
    resetPace(def.gain(asG(s)), kept(asG(s)), runSeconds(s, now), floorS);

  /**
   * Marks every milestone `s` has reached now, the seconds of the run it was reached in handed in. A milestone is
   * reached once: it joins `milestones` and no reset takes it back.
   */
  const reach = (s: Draft<G>, seconds: number) => {
    const p = layer(s);
    for (const m of def.milestones ?? []) {
      if (p.milestones.includes(m.id)) continue;
      const on = m.on ?? "best";
      const have =
        on === "runs" ? D(p.runs) : on === "seconds" ? D(seconds) : on === "total" ? p.lifetime : p.best;
      if (have.lt(m.at)) continue;
      p.milestones = [...p.milestones, m.id];
    }
  };

  /** The reset inside a recipe: the checks, the gain, the run reset, the payout, the count and the hooks. */
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
    // Read before the run resets: a `seconds` milestone reached by the run that ends here counts it.
    const seconds = runSeconds(s, now);
    p.lifetime = p.lifetime.add(gain);
    if (gain.gt(p.best)) p.best = gain;
    if (!pay) p.currency = (p.currency ?? ZERO).add(gain);
    resetRun(s, { now, rng: rng(p.runs + 1), depth });
    // After the run is reset: a wallet currency the reset reaches would otherwise lose the payout at once.
    if (pay) pay.wallet.draft.credit(s as never, pay.currency, gain);
    const q = layer(s);
    q.runs += 1;
    reach(s, seconds);
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

  // The layer's rule, wrapped: the game's rule (default "never") for its own fields, and a run start whenever a reset
  // reaches this layer's depth, whether this layer pressed it or one deeper did.
  const own = resetRuleOf((def.reset ?? "never") as FeatureSpec["reset"]);
  const reset: ResetRule<S> = {
    depth: Math.min(depth, own.depth),
    rule: (before, fresh, ctx) => {
      const at = ctx.depth ?? 1;
      // best and milestones survive every reset but a profile reset, even one that starts this layer's own fields
      // over: keep them whatever the game's rule makes of the rest.
      const reached =
        at >= own.depth
          ? {
              ...applyReachedRule(own.rule as ReachedRule<S>, before, fresh, ctx),
              best: before.best,
              milestones: before.milestones,
            }
          : before;
      return at >= depth
        ? {
            ...reached,
            runStart: ctx.now,
            peak: 0,
            paceAt: ctx.now,
          }
        : reached;
    },
  };

  const settle = {
    ...(def.steps?.settle ?? {}),
    [PACE_STEP]: {
      run: (d: Draft<G>, ctx: { now: number }) => {
        const pace = paceAt(d, ctx.now);
        const p = layer(d);
        p.paceAt = ctx.now;
        if (pace > p.peak) p.peak = pace;
        reach(d, runSeconds(d, ctx.now));
      },
    },
  };

  const derived = {
    pace: (s: object): number => paceAt(s, layer(s).paceAt),
    peakShare: (s: object): number => {
      const pace = (s as Record<string, PrestigePaceValues>)[def.key]?.pace ?? 0;
      const peak = layer(s).peak;
      if (!(pace > 0)) return 0;
      return peak > 0 ? Math.min(1, pace / peak) : 1;
    },
    pastPeak: (s: object): boolean => {
      const v = (s as Record<string, PrestigePaceValues>)[def.key];
      return (v?.pace ?? 0) > 0 && (v?.peakShare ?? 1) < past;
    },
  };

  /** The auto-player's one move when the game gives `worth`: the reset, through the store's own action. */
  const resetMove = (state: G): Move<G> => ({
    id: `${def.key}.${name}`,
    worth: () => def.worth?.(state) ?? 0,
    apply: (store) => {
      const actions = (store.getState() as Record<string, Record<string, PrestigeReset>>)[def.key];
      return actions?.[name]?.() ?? false;
    },
  });

  const reachOf = (): ReachShape => {
    const given: ReachShape | undefined = typeof def.reach === "function" ? def.reach() : def.reach;
    const list: readonly (FeatureSpec | ReachType<object>)[] =
      given === undefined ? [] : Array.isArray(given) ? given : [given as ReachType<object>];
    return pay ? [...list, pay.wallet] : list;
  };

  const made = defineFeature<K, S, Record<N, PrestigeReset> & A, ReachShape, PrestigePaceValues, G>({
    key: def.key,
    reach: reachOf,
    initial: (ctx) =>
      ({
        runs: 0,
        lifetime: ZERO,
        best: ZERO,
        milestones: [],
        runStart: ctx.now,
        peak: 0,
        paceAt: ctx.now,
        ...(pay ? {} : { currency: ZERO }),
        ...(def.initial?.(ctx) ?? ({} as X)),
      }) as S,
    derived: derived as never,
    transient: def.transient,
    actions,
    steps: { ...(def.steps ?? {}), settle } as FeatureSteps<G>,
    reset,
    migrations: def.migrations,
    merge: (merged, fresh) => {
      const out = def.merge?.(merged, fresh) ?? merged;
      // A save from before `best` and `milestones` existed has neither, and the best gain ever paid is not in what
      // it does keep: 0 is honest, and so is no milestone reached. A game's own merge may drop them too.
      return {
        ...out,
        best: out.best ?? fresh.best,
        milestones: out.milestones ?? fresh.milestones,
      };
    },
    // Declared over `G`; the store hands it the game's state, which holds the layer's actions as well.
    moves: def.worth ? (((state: G) => [resetMove(state)]) as never) : undefined,
  });

  const helpers: PrestigeHelpers<N, W, G> = {
    select: {
      held: (s) => held(s),
      gain: (s) => def.gain(asG(s)),
      runSeconds: (s, now) => runSeconds(s, now),
      pace: (s, now) => paceAt(s, now),
      reached: (s, id) => layer(s).milestones.includes(id),
    },
    def: {
      action: name,
      depth,
      pace: { past, floorS },
      payInto: pay ? { wallet: pay.wallet.key, currency: pay.currency } : null,
    },
    draft: {
      [name]: (draft: object, ctx: PrestigeDraftContext) =>
        run(draft as Draft<G>, ctx.now, ctx.resetRun, () => ctx.rng),
    } as PrestigeDraftHelpers<N>,
  };
  return Object.assign(made, helpers) as unknown as PrestigeFeature<K, N, W, X, A, R, G>;
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
 * now?" on both sides: every `prestige` keeps its best since the last reset and serves `pastPeak` off it (see
 * `PrestigePaceDef`). `floorS` is the least seconds counted (default 1): before it the pace only rises, so nothing
 * peaks in its first moments.
 */
export function resetPace(gain: Decimal, kept: Decimal, seconds: number, floorS = 1): number {
  if (gain.lte(0)) return 0;
  const ratio = gain.div(Decimal.max(kept, 1));
  // Under a billionth, `1 + ratio` rounds to one: log10(1 + r) is r / ln 10 there.
  const orders = ratio.lt(1e-9) ? ratio.toNumber() / Math.LN10 : ratio.add(1).log10().toNumber();
  return orders / Math.max(seconds, floorS, 1e-3);
}
