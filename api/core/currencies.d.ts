import { type Decimal, type DecimalSource } from "./decimal";
import { type Feature, type FeatureApi, type ReachOf, type ReachShape, type ResetRule } from "./feature";
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
    readonly depth: {
        readonly [P in C]: number;
    };
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
export type CurrenciesFeature<K extends string, C extends string, S extends object, A extends object> = Feature<K, S, CurrencyActions<C> & A> & CurrencyHelpers<K, C>;
/** Per currency, the name of a field that keeps a total of it. */
export type TotalsMap<C extends string> = {
    readonly [P in C]?: string;
};
/** The field names a totals map declares. */
export type FieldOf<M> = Exclude<M[keyof M], undefined> & string;
/** How deep a reset must be to wipe a currency: a depth (1 is every reset), or `"never"`. */
export type CurrencyDepth = number | "never";
/** The definition `currencies` takes: the key, the vocabulary, starting balances, depths, totals and the game's extras. */
export interface CurrenciesDef<K extends string, V extends AnyVocab, E extends TotalsMap<CurrencyOf<V>>, EE extends TotalsMap<CurrencyOf<V>>, P extends TotalsMap<CurrencyOf<V>>, PE extends TotalsMap<CurrencyOf<V>>, X extends object, A extends object, R extends ReachShape, G extends object> {
    /** The saved key. */
    readonly key: K;
    readonly vocab: V;
    /** The features the game's `actions` read or write, as `FeatureDef.reach`. */
    readonly reach?: R | (() => R);
    /** Starting balances; every other currency starts at zero. A wiped currency goes back to its start. */
    readonly start?: {
        readonly [C in CurrencyOf<V>]?: DecimalSource;
    };
    /**
     * Per currency, the shallowest reset that wipes it back to its start (default 1: every reset). A prestige
     * currency held here says `"never"`, or the depth of the layer above its own (`{ shards: 2 }`). Its this-run
     * totals go with it; its ever totals stay.
     */
    readonly depth?: {
        readonly [C in CurrencyOf<V>]?: CurrencyDepth;
    };
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
export declare const RESERVED_CURRENCY_FIELDS: readonly string[];
/** Every total field the four maps declare. */
export type TotalsOf<E, EE, P, PE> = FieldOf<E> | FieldOf<EE> | FieldOf<P> | FieldOf<PE>;
/**
 * Declares a currencies feature over a vocabulary's currencies. Throws at definition on a total or a depth for a
 * currency the vocabulary lacks, a depth under 1, a name in `RESERVED_CURRENCY_FIELDS`, or a field taken twice (by a
 * currency, a total or an extra: `extra` is called once here to claim its keys, so keep it pure); a game action named
 * like a balance, a total or `debit` throws when the game is defined (`defineGame` builds the actions once to check
 * them).
 */
export declare function defineCurrencies<const K extends string, V extends AnyVocab, const E extends TotalsMap<CurrencyOf<V>> = Record<never, never>, const EE extends TotalsMap<CurrencyOf<V>> = Record<never, never>, const P extends TotalsMap<CurrencyOf<V>> = Record<never, never>, const PE extends TotalsMap<CurrencyOf<V>> = Record<never, never>, X extends object = Record<never, never>, A extends object = Record<never, never>, const R extends ReachShape = readonly [], G extends object = Record<K, CurrenciesState<CurrencyOf<V>, TotalsOf<E, EE, P, PE>, X>> & ReachOf<R>>(def: CurrenciesDef<K, V, E, EE, P, PE, X, A, R, G>): CurrenciesFeature<K, CurrencyOf<V>, CurrenciesState<CurrencyOf<V>, TotalsOf<NoInfer<E>, NoInfer<EE>, NoInfer<P>, NoInfer<PE>>, NoInfer<X>>, A>;
