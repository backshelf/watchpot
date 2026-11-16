import { D, type Decimal, type DecimalSource, ZERO } from "./decimal";
import { type Feature, type FeatureApi, feature, type ResetRule } from "./feature";
import type { AnyVocab, CurrencyOf } from "./vocab";

/**
 * Currencies: a feature holding a balance per currency of a vocabulary, as Decimals at the top of its state
 * (`s.wallet.gold`), with the lifetime totals the game names kept beside them. Credit ignores nothing-or-less, debit
 * refuses what the balance cannot cover, and both keep the totals. The draft helpers (`credit`, `debit`, `balance`,
 * `canAfford`, `purse`) work inside any recipe or step; the actions of the same names work from outside.
 *
 * ```ts
 * const wallet = currencies({
 *   key: "wallet",
 *   vocab: TOY,
 *   start: { gold: 30 },
 *   earned: { gold: "lifetimeGold" },
 *   spent: { gems: "gemsSpent" },
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

/** The draft helpers, for recipes and steps. */
export interface CurrencyHelpers<K extends string, C extends string> {
  /** Adds to a balance and to its `earned` total; an amount of zero or less does nothing. */
  credit(draft: CurrencyDraft<K>, currency: C, amount: DecimalSource): void;
  /** Takes from a balance and adds to its `spent` total, or refuses (false) when the balance is short. */
  debit(draft: CurrencyDraft<K>, currency: C, amount: DecimalSource): boolean;
  balance(draft: CurrencyDraft<K>, currency: C): Decimal;
  canAfford(draft: CurrencyDraft<K>, currency: C, amount: DecimalSource): boolean;
  /** The draft's balances as a `Purse`, for `tree.buy`. */
  purse(draft: CurrencyDraft<K>): Purse<C>;
}

/** A currencies feature: the feature, its vocabulary's currencies, and the draft helpers. */
export type CurrenciesFeature<
  K extends string,
  C extends string,
  S extends object,
  A extends object,
> = Feature<K, S, CurrencyActions<C> & A> & CurrencyHelpers<K, C> & { readonly currencies: readonly C[] };

/** Per currency, the name of a field that keeps a total of it. */
export type TotalsMap<C extends string> = { readonly [P in C]?: string };
/** The field names a totals map declares. */
export type FieldOf<M> = Exclude<M[keyof M], undefined> & string;

/** The definition `currencies` takes: the key, the vocabulary, starting balances, totals and the game's extras. */
export interface CurrenciesDef<
  K extends string,
  V extends AnyVocab,
  E extends TotalsMap<CurrencyOf<V>>,
  P extends TotalsMap<CurrencyOf<V>>,
  X extends object,
  A extends object,
  G extends object,
> {
  /** The saved key. */
  readonly key: K;
  readonly vocab: V;
  /** Starting balances; every other currency starts at zero. */
  readonly start?: { readonly [C in CurrencyOf<V>]?: DecimalSource };
  /** Per currency, the field that totals every credit of it (`{ gold: "lifetimeGold" }`). */
  readonly earned?: E;
  /** Per currency, the field that totals every debit of it (`{ gems: "gemsSpent" }`). */
  readonly spent?: P;
  /** The game's own fields beside the balances (a pouch per rarity); its own helpers keep them. */
  readonly extra?: () => X;
  readonly reset?: ResetRule<CurrenciesState<CurrencyOf<V>, FieldOf<E> | FieldOf<P>, X>>;
  /** The game's own actions, beside `credit` and `debit`, with the draft helpers to build them on. */
  readonly actions?: (api: FeatureApi<G>, helpers: CurrencyHelpers<K, CurrencyOf<V>>) => A;
}

/**
 * The names no currency, total, extra field or game action of a currencies feature may take: the slice's own
 * actions, which sit beside the balances, and the one key a plain object cannot hold as its own.
 */
export const RESERVED_CURRENCY_FIELDS: readonly string[] = ["credit", "debit", "__proto__"];

/**
 * Declares a currencies feature over a vocabulary's currencies. Throws at definition on a total for a currency the
 * vocabulary lacks, a name in `RESERVED_CURRENCY_FIELDS`, or a field taken twice (by a currency, a total or an
 * extra); a game action named like a balance, a total or `debit` throws when the store is built.
 */
export function currencies<
  const K extends string,
  V extends AnyVocab,
  const E extends TotalsMap<CurrencyOf<V>> = Record<never, never>,
  const P extends TotalsMap<CurrencyOf<V>> = Record<never, never>,
  X extends object = Record<never, never>,
  A extends object = Record<never, never>,
  G extends object = Record<K, CurrenciesState<CurrencyOf<V>, FieldOf<E> | FieldOf<P>, X>>,
>(
  def: CurrenciesDef<K, V, E, P, X, A, G>,
): CurrenciesFeature<
  K,
  CurrencyOf<V>,
  CurrenciesState<CurrencyOf<V>, FieldOf<NoInfer<E>> | FieldOf<NoInfer<P>>, NoInfer<X>>,
  A
> {
  type C = CurrencyOf<V>;
  type S = CurrenciesState<C, FieldOf<E> | FieldOf<P>, X>;
  const ids: readonly C[] = def.vocab.currencies;
  const earned = fieldsOf<C>(def.earned);
  const spent = fieldsOf<C>(def.spent);
  for (const c of [...earned.keys(), ...spent.keys()])
    if (!ids.includes(c))
      throw new Error(`currencies "${def.key}": "${c}" is not a currency of the vocabulary`);
  // The actions sit beside the balances in the slice, so their names are taken too, and an object's own
  // `__proto__` cannot be a field at all.
  const taken = new Set<string>();
  const claim = (field: string, what: string): void => {
    if (RESERVED_CURRENCY_FIELDS.includes(field))
      throw new Error(
        `currencies "${def.key}": ${what} "${field}" collides with the wallet's own "${field}" (reserved: ${RESERVED_CURRENCY_FIELDS.join(", ")}); name it something else`,
      );
    if (taken.has(field)) throw new Error(`currencies "${def.key}": ${what} "${field}" is taken twice`);
    taken.add(field);
  };
  for (const c of ids) claim(c, "the currency");
  for (const field of [...earned.values(), ...spent.values()]) claim(field, "the total");
  /** The fields a slice holds: the balances and totals, then the game's extras, each claimed once. */
  const fields = new Set(taken);

  const initial = (): S => {
    const s: Record<string, unknown> = {};
    for (const c of ids) s[c] = D(def.start?.[c] ?? 0);
    for (const f of [...earned.values(), ...spent.values()]) s[f] = ZERO;
    const extra = def.extra?.() ?? {};
    for (const k of Object.keys(extra)) {
      if (RESERVED_CURRENCY_FIELDS.includes(k) || fields.has(k))
        throw new Error(
          `currencies "${def.key}": the extra field "${k}" collides with a balance, a total or an action`,
        );
    }
    return Object.assign(s, extra) as S;
  };

  const slice = (draft: CurrencyDraft<K>): Record<string, Decimal> =>
    draft[def.key] as Record<string, Decimal>;
  const balance = (draft: CurrencyDraft<K>, c: C): Decimal => slice(draft)[c] ?? ZERO;
  const credit = (draft: CurrencyDraft<K>, c: C, amount: DecimalSource): void => {
    const a = D(amount);
    if (a.lte(0)) return;
    const s = slice(draft);
    s[c] = balance(draft, c).add(a);
    const total = earned.get(c);
    if (total) s[total] = (s[total] ?? ZERO).add(a);
  };
  const debit = (draft: CurrencyDraft<K>, c: C, amount: DecimalSource): boolean => {
    const a = D(amount);
    // A negative debit would credit and shrink the spent total: refused, like a short balance.
    if (a.lt(0) || balance(draft, c).lt(a)) return false;
    const s = slice(draft);
    s[c] = balance(draft, c).sub(a);
    const total = spent.get(c);
    if (total) s[total] = (s[total] ?? ZERO).add(a);
    return true;
  };
  const helpers: CurrencyHelpers<K, C> = {
    credit,
    debit,
    balance,
    canAfford: (draft, c, amount) => balance(draft, c).gte(amount),
    purse: (draft) => ({ balance: (c) => balance(draft, c), debit: (c, amount) => debit(draft, c, amount) }),
  };

  const made = feature<K, S, CurrencyActions<C> & A, readonly [], G>({
    key: def.key,
    initial,
    reset: def.reset,
    vocab: def.vocab,
    actions: (api) => {
      const self = (draft: unknown) => draft as CurrencyDraft<K>;
      const own: CurrencyActions<C> = {
        credit: (c, amount) => api.set((s) => credit(self(s), c, amount)),
        debit: (c, amount) => {
          let ok = false;
          api.set((s) => {
            ok = debit(self(s), c, amount);
          });
          return ok;
        },
      };
      const theirs = def.actions?.(api, helpers) ?? {};
      for (const k of Object.keys(theirs))
        if (RESERVED_CURRENCY_FIELDS.includes(k) || fields.has(k))
          throw new Error(
            `currencies "${def.key}": the action "${k}" collides with a balance, a total or an action`,
          );
      return { ...own, ...theirs } as CurrencyActions<C> & A;
    },
  });
  return Object.assign(made, helpers, { currencies: ids });
}

function fieldsOf<C extends string>(map: { readonly [P in C]?: string } | undefined): Map<C, string> {
  const out = new Map<C, string>();
  for (const [c, field] of Object.entries(map ?? {}) as [C, string | undefined][])
    if (field) out.set(c, field);
  return out;
}
