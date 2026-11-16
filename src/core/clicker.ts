import type { Draft } from "immer";
import type { CurrenciesFeature, CurrencyDraft } from "./currencies";
import { D, type Decimal, type DecimalSource, ZERO } from "./decimal";
import { type Feature, type FeatureApi, feature, type Move, type ResetRule } from "./feature";
import type { CallbackContext } from "./gauge";
import { nextFloat, type RngState, seedRng } from "./rng";

/**
 * The clicker: a press pays a currency. What one press pays is the game's (`power`, often a base plus a share of
 * income per second, `clickShare`); on top of it a press may crit (rolled on the feature's own saved rng stream, so a
 * reload cannot reroll it) and may ride a combo, a streak multiplier that grows while presses land close together
 * and falls back to 1 after a pause. `maxPerSecond` drops presses past a cap, against an auto-clicker. Every time is
 * game time.
 */

/** A crit: the chance a press crits (0 to 1) and what a crit multiplies it by. */
export interface ClickCrit {
  readonly chance: number;
  readonly mult: DecimalSource;
}

/** A combo: each press within `windowMs` of the last adds `step` to the multiplier, up to `max`; after it, 1 again. */
export interface ClickCombo {
  readonly windowMs: number;
  readonly step: number;
  readonly max: number;
}

/** The clicker's saved state. */
export interface ClickerState {
  /** Presses paid, ever. */
  clicks: number;
  /** What presses paid, ever. */
  earned: Decimal;
  /** The most one press paid, ever. */
  best: Decimal;
  /** Crits, ever. */
  crits: number;
  /** Presses paid this run. */
  runClicks: number;
  /** What presses paid this run. */
  runEarned: Decimal;
  /** The combo multiplier the last press paid at (1 without a combo). */
  combo: number;
  /** Game time of the last press paid (0 for none). */
  lastAt: number;
  /** The crit stream. */
  rng: RngState;
  /** The start of the current one-second window, for `maxPerSecond`. */
  windowAt: number;
  /** Presses paid inside the current window. */
  windowCount: number;
}

/** What one press paid: the amount, whether it crit, and the combo multiplier it paid at. */
export interface ClickResult {
  readonly amount: Decimal;
  readonly crit: boolean;
  readonly combo: number;
}

/** The clicker's actions. */
export interface ClickerActions {
  /** One press at game time now: what it paid, or null when the rate cap dropped it. */
  click(): ClickResult | null;
}

/** "A base plus a share of income per second": `base + perSecond × share`. */
export function clickShare(base: DecimalSource, perSecond: DecimalSource, share: number): Decimal {
  return D(base).add(D(perSecond).mul(share));
}

/** The combo a press at `now` would pay at: one step up inside the window, else 1. */
export function comboAt(
  state: Pick<ClickerState, "combo" | "lastAt">,
  now: number,
  combo?: ClickCombo,
): number {
  if (!combo) return 1;
  const inside = state.lastAt > 0 && now - state.lastAt <= combo.windowMs;
  return inside ? Math.min(combo.max, state.combo + combo.step) : 1;
}

/** The combo shown at `now`: the last press's, until its window runs out. */
export function comboShown(
  state: Pick<ClickerState, "combo" | "lastAt">,
  now: number,
  combo?: ClickCombo,
): number {
  if (!combo) return 1;
  return state.lastAt > 0 && now - state.lastAt <= combo.windowMs ? state.combo : 1;
}

/** A `clicker` feature, carrying its combo rule as `.combo` and its draft helper as `.press`. */
export type ClickerFeature<K extends string> = Feature<K, ClickerState, ClickerActions> & {
  readonly combo: ClickCombo | undefined;
  /** Draft helper: one press at `now` inside a recipe, paid to the wallet. Null when the rate cap dropped it. */
  press(draft: object, now: number): ClickResult | null;
};

/** The definition `clicker` takes. */
export interface ClickerDef<
  K extends string,
  WK extends string,
  C extends string,
  WS extends object,
  WA extends object,
  G extends object,
> {
  /** The saved key. */
  readonly key: K;
  /** The currencies feature a press pays into. */
  readonly wallet: CurrenciesFeature<WK, C, WS, WA>;
  readonly currency: C;
  /** What one press pays before a crit and the combo, read off the whole game state at the press's game time. */
  readonly power: (state: G, ctx: CallbackContext) => DecimalSource;
  /** The crit, read off the whole game state at the press's game time. None without it. */
  readonly crit?: (state: G, ctx: CallbackContext) => ClickCrit;
  readonly combo?: ClickCombo;
  /** The most presses paid in one second of game time; the rest are dropped. No cap without it. */
  readonly maxPerSecond?: number;
  /** Runs in the same recipe as a press pays. */
  readonly onClick?: (draft: Draft<G>, result: ClickResult, now: number) => void;
  /** Default: a run reset clears the run counters and the combo, and keeps the lifetime totals and the stream. */
  readonly reset?: ResetRule<ClickerState>;
}

/**
 * A press that pays as a feature. It saves `ClickerState` under `key`, and its action `click()` pays `power(state)`
 * × the combo × the crit's `mult` (on a crit) into `wallet`. No steps. Its auto-player move is a free `click` worth `power`
 * that goes through once per look (it refuses a second press at the same game time), so the sim's look
 * cadence is the click rate. The callbacks read the whole game state, so annotate one of them.
 */
export function clicker<
  const K extends string,
  WK extends string,
  C extends string,
  WS extends object,
  WA extends object,
  G extends object = object,
>(def: ClickerDef<K, WK, C, WS, WA, G>): ClickerFeature<K> {
  type Own = Record<K, ClickerState> & CurrencyDraft<WK>;
  const own = (state: unknown): ClickerState => (state as Record<K, ClickerState>)[def.key];

  const press = (draft: object, now: number): ClickResult | null => {
    const s = own(draft);
    const state = draft as unknown as G;
    if (def.maxPerSecond !== undefined) {
      if (now - s.windowAt >= 1000 || now < s.windowAt) {
        s.windowAt = now;
        s.windowCount = 0;
      }
      if (s.windowCount >= def.maxPerSecond) return null;
      s.windowCount += 1;
    }
    const combo = comboAt(s, now, def.combo);
    let crit = false;
    const at: CallbackContext = { now };
    let amount = D(def.power(state, at)).mul(combo);
    const rule = def.crit?.(state, at);
    if (rule && rule.chance > 0) {
      const [roll, next] = nextFloat(s.rng);
      s.rng = next;
      crit = roll < rule.chance;
      if (crit) amount = amount.mul(rule.mult);
    }
    def.wallet.credit(draft as CurrencyDraft<WK>, def.currency, amount);
    s.clicks += 1;
    s.runClicks += 1;
    if (crit) s.crits += 1;
    s.earned = s.earned.add(amount);
    s.runEarned = s.runEarned.add(amount);
    if (amount.gt(s.best)) s.best = amount;
    s.combo = combo;
    s.lastAt = now;
    const result: ClickResult = { amount, crit, combo };
    def.onClick?.(draft as Draft<G>, result, now);
    return result;
  };

  const made = feature<K, ClickerState, ClickerActions, readonly [], Own>({
    key: def.key,
    initial: (ctx): ClickerState => ({
      clicks: 0,
      earned: ZERO,
      best: ZERO,
      crits: 0,
      runClicks: 0,
      runEarned: ZERO,
      combo: 1,
      lastAt: 0,
      rng: seedRng(`${ctx.rng.join(".")}:${def.key}`),
      windowAt: 0,
      windowCount: 0,
    }),
    reset:
      def.reset ??
      ((before, fresh) => ({
        ...fresh,
        clicks: before.clicks,
        earned: before.earned,
        best: before.best,
        crits: before.crits,
        rng: before.rng,
      })),
    actions: (api: FeatureApi<Own>): ClickerActions => ({
      click: () => {
        let result: ClickResult | null = null;
        const now = api.now();
        api.set((d) => {
          result = press(d, now);
        });
        return result;
      },
    }),
    moves: (s) => {
      const now = (s as { gameNow?: () => number }).gameNow?.() ?? 0;
      const worth = D(def.power(s as unknown as G, { now })).toNumber();
      const move: Move<typeof s> = {
        id: `${def.key}:click`,
        value: () => (Number.isFinite(worth) ? worth : Number.MAX_VALUE),
        apply: (store) => {
          const live = store.getState() as unknown as { gameNow?: () => number };
          if (own(live).lastAt > 0 && own(live).lastAt === live.gameNow?.()) return false;
          return (store.getState() as Record<K, ClickerActions>)[def.key].click() !== null;
        },
      };
      return [move];
    },
  });
  return Object.assign(made, { combo: def.combo, press });
}
