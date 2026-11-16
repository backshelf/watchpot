import { D, type Decimal, type DecimalSource, ZERO } from "./decimal";
import {
  applyReachedRule,
  defineFeature,
  type Feature,
  type FeatureApi,
  type InitialContext,
  type ReachedRule,
  type ReachOf,
  type ReachShape,
  type ResetRule,
  resetRuleOf,
} from "./feature";
import type { AnyVocab, CurrencyOf } from "./vocab";

/**
 * Currencies: a feature holding a balance per currency of a vocabulary, as Decimals at the top of its state
 * (`s.wallet.gold`), with the totals the game names kept beside them. Each currency says how deep a reset must be to
 * wipe it (`depth`). Totals come in two kinds: this run's (`earnedThisRun`, `spentThisRun`), wiped with their
 * currency, and ever (`earnedEver`, `spentEver`), which no run reset touches. Credit ignores nothing-or-less, debit
 * refuses what the balance cannot cover, and both keep the totals. `select` (`balance`, `canAfford`) and `draft`
 * (`credit`, `debit`, `purse`) work inside any recipe or step, `def` holds the currencies and their depths, and the
 * actions `credit` and `debit` work from outside.
 *
 * ```ts
 * const wallet = defineCurrencies({
 *   key: "wallet",
 *   vocab: TOY,
 *   start: { gold: 30 },
 *   depth: { gems: "never" }, // gold goes with every reset; gems never do
 *   earnedThisRun: { gold: "goldThisRun" },
 *   earnedEver: { gold: "goldEver" },
 *   spentEver: { gems: "gemsSpent" },
 * });
 * ```
 */

/** A balance per currency. */
export type Balances<C extends string> = { [P in C]: Decimal };

/** The feature's state: the balances, the named totals, and the game's own fields from `extra`. */
export type CurrenciesState<C extends string, T extends string, X extends object> = Balances<C> & {
  [P in T]: Decimal;
} & X;

/** What a tree or a shop pays from: a balance per currency, and a debit that refuses what it cannot cover. */
export interface Purse<C extends string = string> {
  balance(currency: C): Decimal;
  debit(currency: C, amount: DecimalSource): boolean;
}

/** The actions every currencies feature has, from outside a recipe. */
export interface CurrencyActions<C extends string> {
  credit(currency: C, amount: DecimalSource): void;
  debit(currency: C, amount: DecimalSource): boolean;
}

/** Any draft holding the feature's state under its key. */
export type CurrencyDraft<K extends string> = { readonly [P in K]: object };

/** The read-only questions over state, for recipes, steps and callbacks. */
export interface CurrencySelect<K extends string, C extends string> {
  balance(state: CurrencyDraft<K>, currency: C): Decimal;
  canAfford(state: CurrencyDraft<K>, currency: C, amount: DecimalSource): boolean;
}

/** The fixed configuration of a currencies feature. */
export interface CurrencyDef<C extends string> {
  /** The vocabulary's currencies. */
  readonly currencies: readonly C[];
  /** Per currency, the shallowest reset that wipes it (`Infinity` for `"never"`). */
  readonly depth: { readonly [P in C]: number };
}

/** The helpers that take a draft first and change it, named like the actions they mirror. */
export interface CurrencyDraftHelpers<K extends string, C extends string> {
  /** Adds to a balance and to its `earned` totals; an amount of zero or less does nothing. */
  credit(draft: CurrencyDraft<K>, currency: C, amount: DecimalSource): void;
  /** Takes from a balance and adds to its `spent` totals, or refuses (false) when the balance is short. */
  debit(draft: CurrencyDraft<K>, currency: C, amount: DecimalSource): boolean;
  /** The draft's balances as a `Purse`, for `tree.buy`. */
  purse(draft: CurrencyDraft<K>): Purse<C>;
}

/** The three namespaces of a currencies feature; also what `CurrenciesDef.actions` receives as its second argument. */
export interface CurrencyHelpers<K extends string, C extends string> {
  readonly select: CurrencySelect<K, C>;
  readonly def: CurrencyDef<C>;
  readonly draft: CurrencyDraftHelpers<K, C>;
}

/** A currencies feature: the feature plus `select`, `def` and `draft`. */
export type CurrenciesFeature<
  K extends string,
  C extends string,
  S extends object,
  A extends object,
> = Feature<K, S, CurrencyActions<C> & A> & CurrencyHelpers<K, C>;

/** Per currency, the name of a field that keeps a total of it. */
export type TotalsMap<C extends string> = { readonly [P in C]?: string };
/** The field names a totals map declares. */
export type FieldOf<M> = Exclude<M[keyof M], undefined> & string;

/** How deep a reset must be to wipe a currency: a depth (1 is every reset), or `"never"`. */
export type CurrencyDepth = number | "never";

/** The definition `currencies` takes: the key, the vocabulary, starting balances, depths, totals and the game's extras. */
export interface CurrenciesDef<
  K extends string,
  V extends AnyVocab,
  E extends TotalsMap<CurrencyOf<V>>,
  EE extends TotalsMap<CurrencyOf<V>>,
  P extends TotalsMap<CurrencyOf<V>>,
  PE extends TotalsMap<CurrencyOf<V>>,
  X extends object,
  A extends object,
  R extends ReachShape,
  G extends object,
> {
  /** The saved key. */
  readonly key: K;
  readonly vocab: V;
  /** The features the game's `actions` read or write, as `FeatureDef.reach`. */
  readonly reach?: R | (() => R);
  /** Starting balances; every other currency starts at zero. A wiped currency goes back to its start. */
  readonly start?: { readonly [C in CurrencyOf<V>]?: DecimalSource };
  /**
   * Per currency, the shallowest reset that wipes it back to its start (default 1: every reset). A prestige
   * currency held here says `"never"`, or the depth of the layer above its own (`{ shards: 2 }`). Its this-run
   * totals go with it; its ever totals stay.
   */
  readonly depth?: { readonly [C in CurrencyOf<V>]?: CurrencyDepth };
  /**
   * Per currency, the field totalling every credit since the currency was last wiped (`{ gold: "goldThisRun" }`):
   * it goes back to zero with the currency.
   */
  readonly earnedThisRun?: E;
  /** Per currency, the field totalling every credit ever (`{ gold: "goldEver" }`): no run reset touches it. */
  readonly earnedEver?: EE;
  /** Per currency, the field totalling every debit since the currency was last wiped. */
  readonly spentThisRun?: P;
  /** Per currency, the field totalling every debit ever (`{ gems: "gemsSpent" }`). */
  readonly spentEver?: PE;
  /** The game's own fields beside the balances (a pouch per rarity); its own helpers keep them. */
  readonly extra?: () => X;
  /** What a run reset does to the `extra` fields (default `"run"`); the balances and totals follow `depth`. */
  readonly reset?: ResetRule<X>;
  /** The game's own actions, beside `credit` and `debit`, with `{ select, def, draft }` to build them on. */
  readonly actions?: (api: FeatureApi<G>, helpers: CurrencyHelpers<K, CurrencyOf<V>>) => A;
}

/**
 * The names no currency, total, extra field or game action of a currencies feature may take: the slice's own
 * actions, which sit beside the balances, and the one key a plain object cannot hold as its own.
 */
export const RESERVED_CURRENCY_FIELDS: readonly string[] = ["credit", "debit", "__proto__"];

/** Every total field the four maps declare. */
export type TotalsOf<E, EE, P, PE> = FieldOf<E> | FieldOf<EE> | FieldOf<P> | FieldOf<PE>;

/**
 * Declares a currencies feature over a vocabulary's currencies. Throws at definition on a total or a depth for a
 * currency the vocabulary lacks, a depth under 1, a name in `RESERVED_CURRENCY_FIELDS`, or a field taken twice (by a
 * currency, a total or an extra: `extra` is called once here to claim its keys, so keep it pure); a game action named
 * like a balance, a total or `debit` throws when the game is defined (`defineGame` builds the actions once to check
 * them).
 */
export function defineCurrencies<
  const K extends string,
  V extends AnyVocab,
  const E extends TotalsMap<CurrencyOf<V>> = Record<never, never>,
  const EE extends TotalsMap<CurrencyOf<V>> = Record<never, never>,
  const P extends TotalsMap<CurrencyOf<V>> = Record<never, never>,
  const PE extends TotalsMap<CurrencyOf<V>> = Record<never, never>,
  X extends object = Record<never, never>,
  A extends object = Record<never, never>,
  const R extends ReachShape = readonly [],
  G extends object = Record<K, CurrenciesState<CurrencyOf<V>, TotalsOf<E, EE, P, PE>, X>> & ReachOf<R>,
>(
  def: CurrenciesDef<K, V, E, EE, P, PE, X, A, R, G>,
): CurrenciesFeature<
  K,
  CurrencyOf<V>,
  CurrenciesState<CurrencyOf<V>, TotalsOf<NoInfer<E>, NoInfer<EE>, NoInfer<P>, NoInfer<PE>>, NoInfer<X>>,
  A
> {
  type C = CurrencyOf<V>;
  type S = CurrenciesState<C, TotalsOf<E, EE, P, PE>, X>;
  const ids: readonly C[] = def.vocab.currencies;
  const earnedRun = fieldsOf<C>(def.earnedThisRun);
  const earnedEver = fieldsOf<C>(def.earnedEver);
  const spentRun = fieldsOf<C>(def.spentThisRun);
  const spentEver = fieldsOf<C>(def.spentEver);
  const maps = [earnedRun, earnedEver, spentRun, spentEver];
  const known = (c: string, what: string): void => {
    if (!ids.includes(c as C))
      throw new Error(`currencies "${def.key}": ${what} "${c}" is not a currency of the vocabulary`);
  };
  for (const m of maps) for (const c of m.keys()) known(c, "the total's currency");
  for (const c of Object.keys(def.depth ?? {})) known(c, "the depth's currency");
  const depths = {} as { [P in C]: number };
  for (const c of ids) {
    const d: CurrencyDepth = def.depth?.[c] ?? 1;
    const n = d === "never" ? Number.POSITIVE_INFINITY : d;
    if (!(n >= 1))
      throw new Error(`currencies "${def.key}": the depth of "${c}" must be 1 or more, or "never"; got ${d}`);
    depths[c] = n;
  }
  // The actions sit beside the balances in the slice, so their names are taken too, and an object's own
  // `__proto__` cannot be a field at all. `taken` ends as every field a slice holds: balances, totals and extras.
  const taken = new Set<string>();
  const claim = (field: string, what: string): void => {
    if (RESERVED_CURRENCY_FIELDS.includes(field))
      throw new Error(
        `currencies "${def.key}": ${what} "${field}" collides with the wallet's own "${field}" (reserved: ${RESERVED_CURRENCY_FIELDS.join(", ")}); name it something else`,
      );
    if (taken.has(field))
      throw new Error(
        `currencies "${def.key}": ${what} "${field}" is already taken by a balance, a total or an extra field`,
      );
    taken.add(field);
  };
  for (const c of ids) claim(c, "the currency");
  for (const m of maps) for (const field of m.values()) claim(field, "the total");
  const extraKeys = Object.keys(def.extra?.() ?? {});
  for (const field of extraKeys) claim(field, "the extra field");

  const initial = (): S => {
    const s: Record<string, unknown> = {};
    for (const c of ids) s[c] = D(def.start?.[c] ?? 0);
    for (const m of maps) for (const f of m.values()) s[f] = ZERO;
    return Object.assign(s, def.extra?.()) as S;
  };

  const slice = (draft: CurrencyDraft<K>): Record<string, Decimal> =>
    draft[def.key] as Record<string, Decimal>;
  const balance = (draft: CurrencyDraft<K>, c: C): Decimal => slice(draft)[c] ?? ZERO;
  const bump = (s: Record<string, Decimal>, field: string | undefined, a: Decimal): void => {
    if (field) s[field] = (s[field] ?? ZERO).add(a);
  };
  const credit = (draft: CurrencyDraft<K>, c: C, amount: DecimalSource): void => {
    const a = D(amount);
    if (a.lte(0)) return;
    const s = slice(draft);
    s[c] = balance(draft, c).add(a);
    bump(s, earnedRun.get(c), a);
    bump(s, earnedEver.get(c), a);
  };
  const debit = (draft: CurrencyDraft<K>, c: C, amount: DecimalSource): boolean => {
    const a = D(amount);
    // A negative debit would credit and shrink the spent totals: refused, like a short balance.
    if (a.lt(0) || balance(draft, c).lt(a)) return false;
    const s = slice(draft);
    s[c] = balance(draft, c).sub(a);
    bump(s, spentRun.get(c), a);
    bump(s, spentEver.get(c), a);
    return true;
  };
  const helpers: CurrencyHelpers<K, C> = {
    select: { balance, canAfford: (state, c, amount) => balance(state, c).gte(amount) },
    def: { currencies: ids, depth: depths },
    draft: {
      credit,
      debit,
      purse: (draft) => ({
        balance: (c) => balance(draft, c),
        debit: (c, amount) => debit(draft, c, amount),
      }),
    },
  };

  // One rule for the whole slice: each currency and its this-run totals by the currency's depth, the extra fields by
  // `reset`, the ever totals never.
  const extras = resetRuleOf((def.reset ?? "run") as Parameters<typeof resetRuleOf>[0]);
  const extrasDepth = extraKeys.length > 0 ? extras.depth : Number.POSITIVE_INFINITY;
  const shallowest = Math.min(extrasDepth, ...ids.map((c) => depths[c]));
  const pick = (s: object): X =>
    Object.fromEntries(extraKeys.map((k) => [k, (s as Record<string, unknown>)[k]])) as X;
  const reset: ResetRule<S> = Number.isFinite(shallowest)
    ? {
        depth: shallowest,
        rule: (before: S, fresh: S, ctx: InitialContext): S => {
          const at = ctx.depth ?? 1;
          const out: Record<string, unknown> = { ...before };
          const start = fresh as Record<string, unknown>;
          for (const c of ids) {
            if (at < depths[c]) continue;
            out[c] = start[c];
            for (const m of [earnedRun, spentRun]) {
              const f = m.get(c);
              if (f) out[f] = start[f];
            }
          }
          if (at >= extrasDepth)
            Object.assign(
              out,
              applyReachedRule(extras.rule as ReachedRule<X>, pick(before), pick(fresh), ctx),
            );
          return out as S;
        },
      }
    : "never";

  const made = defineFeature<K, S, CurrencyActions<C> & A, R, Record<never, never>, G>({
    key: def.key,
    reach: def.reach,
    initial,
    reset,
    vocab: def.vocab,
    actions: (api) => {
      const self = (draft: unknown) => draft as CurrencyDraft<K>;
      const own: CurrencyActions<C> = {
        credit: (c, amount) => api.set((s) => credit(self(s), c, amount)),
        debit: (c, amount) => api.set((s) => debit(self(s), c, amount)),
      };
      const theirs = def.actions?.(api, helpers) ?? {};
      for (const k of Object.keys(theirs))
        if (RESERVED_CURRENCY_FIELDS.includes(k) || taken.has(k))
          throw new Error(
            `currencies "${def.key}": the action "${k}" collides with a balance, a total or an action`,
          );
      return { ...own, ...theirs } as CurrencyActions<C> & A;
    },
  });
  return Object.assign(made, helpers) as unknown as CurrenciesFeature<
    K,
    C,
    CurrenciesState<C, TotalsOf<NoInfer<E>, NoInfer<EE>, NoInfer<P>, NoInfer<PE>>, NoInfer<X>>,
    A
  >;
}

function fieldsOf<C extends string>(map: { readonly [P in C]?: string } | undefined): Map<C, string> {
  const out = new Map<C, string>();
  for (const [c, field] of Object.entries(map ?? {}) as [C, string | undefined][])
    if (field) out.set(c, field);
  return out;
}
