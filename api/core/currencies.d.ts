import { type Decimal, type DecimalSource } from "./decimal";
import { type Feature, type FeatureApi, type ResetRule } from "./feature";
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
export type Balances<C extends string> = {
    [P in C]: Decimal;
};
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
export type CurrencyDraft<K extends string> = {
    readonly [P in K]: object;
};
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
export type CurrenciesFeature<K extends string, C extends string, S extends object, A extends object> = Feature<K, S, CurrencyActions<C> & A> & CurrencyHelpers<K, C> & {
    readonly currencies: readonly C[];
};
/** Per currency, the name of a field that keeps a total of it. */
export type TotalsMap<C extends string> = {
    readonly [P in C]?: string;
};
/** The field names a totals map declares. */
export type FieldOf<M> = Exclude<M[keyof M], undefined> & string;
/** The definition `currencies` takes: the key, the vocabulary, starting balances, totals and the game's extras. */
export interface CurrenciesDef<K extends string, V extends AnyVocab, E extends TotalsMap<CurrencyOf<V>>, P extends TotalsMap<CurrencyOf<V>>, X extends object, A extends object, G extends object> {
    /** The saved key. */
    readonly key: K;
    readonly vocab: V;
    /** Starting balances; every other currency starts at zero. */
    readonly start?: {
        readonly [C in CurrencyOf<V>]?: DecimalSource;
    };
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
export declare const RESERVED_CURRENCY_FIELDS: readonly string[];
/**
 * Declares a currencies feature over a vocabulary's currencies. Throws at definition on a total for a currency the
 * vocabulary lacks, a name in `RESERVED_CURRENCY_FIELDS`, or a field taken twice (by a currency, a total or an
 * extra: `extra` is called once here to claim its keys, so keep it pure); a game action named like a balance, a
 * total or `debit` throws when the game is defined (`defineGame` builds the actions once to check them).
 */
export declare function currencies<const K extends string, V extends AnyVocab, const E extends TotalsMap<CurrencyOf<V>> = Record<never, never>, const P extends TotalsMap<CurrencyOf<V>> = Record<never, never>, X extends object = Record<never, never>, A extends object = Record<never, never>, G extends object = Record<K, CurrenciesState<CurrencyOf<V>, FieldOf<E> | FieldOf<P>, X>>>(def: CurrenciesDef<K, V, E, P, X, A, G>): CurrenciesFeature<K, CurrencyOf<V>, CurrenciesState<CurrencyOf<V>, FieldOf<NoInfer<E>> | FieldOf<NoInfer<P>>, NoInfer<X>>, A>;
