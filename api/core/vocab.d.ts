import type { DecimalSource } from "./decimal";
/**
 * Vocabularies: a game's currencies, stats and rarities, declared once as const tuples, and every engine type that
 * names one of them read off that declaration. The engine itself names none: a reward, a price, an odds table or a
 * pity ladder is generic over the game's words.
 *
 * ```ts
 * const TOY = vocab({ currencies: ["gold", "gems"], stats: ["gold.rate"], rarities: ["common", "rare"] } as const);
 * type Reward = RewardOf<typeof TOY, { kind: "chest"; count: number }>;
 * ```
 */
/**
 * An ordered rarity ladder, lowest first: what pity, odds and sorting walk. Its methods are declared as methods so
 * a ladder over a narrow union is still a `Ladder<string>` where the engine takes any.
 */
export interface Ladder<R extends string> {
    /** The rungs, lowest first: the tuple it was made from. */
    readonly ids: readonly R[];
    /** How many rungs. */
    readonly size: number;
    /** The rung's position, 0 for the lowest. */
    indexOf(rarity: R): number;
    /** The rung at a position, or undefined past either end. */
    at(index: number): R | undefined;
    /** The rung above, or undefined at the top. */
    next(rarity: R): R | undefined;
    /** This rung and every rung above it, lowest first. */
    atLeast(rarity: R): readonly R[];
    /** Whether `a` is `b` or above it. */
    isAtLeast(a: R, b: R): boolean;
    /** Negative when `a` is below `b`, 0 when equal, positive above: a sort comparator, lowest first. */
    compare(a: R, b: R): number;
    /** Whether a string (a saved value, a parsed id) is a rung. */
    has(value: string): value is R;
}
/** A ladder over the rungs given, lowest first. Throws on an empty list or a repeated rung. */
export declare function ladder<const R extends readonly string[]>(ids: R): Ladder<R[number]>;
/** A game's words: its currencies, its stat ids and its rarity ladder. */
export interface Vocab<C extends string, S extends string, R extends string> {
    readonly currencies: readonly C[];
    readonly stats: readonly S[];
    readonly rarities: Ladder<R>;
}
/** Any vocabulary, as the engine takes one. */
export type AnyVocab = Vocab<string, string, string>;
/**
 * Declares a vocabulary. Each list is a const tuple (write `as const`, or pass a `const` array); `stats` may also be
 * a record of ids (a game's `STAT = { gold: "game.gold", … } as const`), whose values are the ids. Throws on a
 * repeated currency, stat or rarity, naming it.
 */
export declare function vocab<const C extends readonly string[], const S extends readonly string[] | Readonly<Record<string, string>>, const R extends readonly string[]>(def: {
    readonly currencies: C;
    readonly stats: S;
    readonly rarities: R;
}): Vocab<C[number], StatIds<S>, R[number]>;
type StatIds<S> = S extends readonly string[] ? S[number] : S[keyof S] & string;
/** The vocabulary's currencies, as a union. */
export type CurrencyOf<V extends AnyVocab> = V["currencies"][number];
/** The vocabulary's stat ids, as a union. */
export type StatOf<V extends AnyVocab> = V["stats"][number];
/** The vocabulary's rarities, as a union. */
export type RarityOf<V extends AnyVocab> = V["rarities"]["ids"][number];
/** One currency reward per currency: `{ kind: "gold"; amount }`, `{ kind: "gems"; amount }`, … */
type CurrencyReward<C extends string> = C extends unknown ? {
    kind: C;
    amount: DecimalSource;
} : never;
/**
 * A reward: one `{ kind: <currency>; amount }` per currency of the vocabulary, plus the game's own kinds in `Extra`
 * (a chest, a card, a pass's XP). An `Extra` member whose `kind` is a currency replaces that currency's plain
 * member, so a game can give one currency's reward an extra field (`{ kind: "gold"; amount; minutes? }`).
 */
export type RewardOf<V extends AnyVocab, Extra extends {
    readonly kind: string;
} = never> = Exclude<CurrencyReward<CurrencyOf<V>>, {
    kind: Extra["kind"];
}> | Extra;
/**
 * A price: `{ currency; amount }` in one of the vocabulary's currencies, plus the game's own price shapes in
 * `Extra` (real money, an event's currency).
 */
export type PriceOf<V extends AnyVocab, Extra extends {
    readonly currency: string;
} = never> = {
    currency: CurrencyOf<V>;
    amount: DecimalSource;
} | Extra;
/** A rarity draw's weights, one per rung. */
export type OddsTable<R extends string> = Record<R, number>;
export {};
