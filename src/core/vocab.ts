import type { DecimalSource } from "./decimal";

/**
 * Vocabularies: a game's currencies, stats and rarities, declared once as const tuples, and every engine type that
 * names one of them read off that declaration. The engine itself names none: a reward, a price, an odds table or a
 * pity ladder is generic over the game's words.
 *
 * ```ts
 * const TOY = vocab({ currencies: ["gold", "gems"], stats: ["gold.rate"], rarities: ["common", "rare"] });
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
export function ladder<const R extends readonly string[]>(ids: R): Ladder<R[number]> {
  if (ids.length === 0) throw new Error("ladder: needs at least one rung");
  return rungs(ids);
}

/** The ladder over `ids`, which may be empty (a vocabulary with no rarities). Throws on a repeated rung. */
function rungs<const R extends readonly string[]>(ids: R): Ladder<R[number]> {
  type Rung = R[number];
  const index = new Map<string, number>();
  ids.forEach((id, i) => {
    if (index.has(id)) throw new Error(`ladder: "${id}" appears twice`);
    index.set(id, i);
  });
  const indexOf = (r: Rung): number => index.get(r) ?? -1;
  return {
    ids,
    size: ids.length,
    indexOf,
    at: (i) => (Number.isInteger(i) && i >= 0 ? ids[i] : undefined),
    next: (r) => {
      const i = indexOf(r);
      return i < 0 ? undefined : ids[i + 1];
    },
    atLeast: (r) => {
      const i = indexOf(r);
      return i < 0 ? [] : ids.slice(i);
    },
    isAtLeast: (a, b) => indexOf(a) >= indexOf(b),
    compare: (a, b) => indexOf(a) - indexOf(b),
    has: (value): value is Rung => index.has(value),
  };
}

/**
 * A game's words: its currencies, its stat ids and its rarity ladder. A vocabulary that declares no rarities has an
 * empty ladder (`size` 0), which a system that draws rarities refuses when it is defined.
 */
export interface Vocab<C extends string, S extends string, R extends string> {
  readonly currencies: readonly C[];
  readonly stats: readonly S[];
  readonly rarities: Ladder<R>;
}

/** Any vocabulary, as the engine takes one. */
export type AnyVocab = Vocab<string, string, string>;

/**
 * Declares a vocabulary. Each list keeps its literal words when written inline in the call; a list declared on its
 * own line first needs `as const` there. `stats` may also be a record of ids (a game's
 * `STAT = { gold: "game.gold", … } as const`), whose values are the ids. `stats` and `rarities` are optional: left
 * out, they are empty. Throws on a repeated currency, stat or rarity, naming it.
 */
export function vocab<
  const C extends readonly string[],
  const S extends readonly string[] | Readonly<Record<string, string>> = readonly [],
  const R extends readonly string[] = readonly [],
>(def: {
  readonly currencies: C;
  readonly stats?: S;
  readonly rarities?: R;
}): Vocab<C[number], StatIds<S>, R[number]> {
  const given = def.stats ?? [];
  const stats = (Array.isArray(given) ? given : Object.values(given)) as readonly StatIds<S>[];
  unique("currency", def.currencies);
  unique("stat", stats);
  return {
    currencies: def.currencies,
    stats,
    rarities: rungs(def.rarities ?? ([] as readonly string[] as R)),
  };
}

type StatIds<S> = S extends readonly string[] ? S[number] : S[keyof S] & string;

function unique(what: string, ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`vocab: the ${what} "${id}" appears twice`);
    seen.add(id);
  }
}

/** The vocabulary's currencies, as a union. */
export type CurrencyOf<V extends AnyVocab> = V["currencies"][number];
/** The vocabulary's stat ids, as a union. */
export type StatOf<V extends AnyVocab> = V["stats"][number];
/** The vocabulary's rarities, as a union. */
export type RarityOf<V extends AnyVocab> = V["rarities"]["ids"][number];

/** One currency reward per currency: `{ kind: "gold"; amount }`, `{ kind: "gems"; amount }`, … */
type CurrencyReward<C extends string> = C extends unknown ? { kind: C; amount: DecimalSource } : never;

/**
 * A reward: one `{ kind: <currency>; amount }` per currency of the vocabulary, plus the game's own kinds in `Extra`
 * (a chest, a card, a pass's XP). An `Extra` member whose `kind` is a currency replaces that currency's plain
 * member, so a game can give one currency's reward an extra field (`{ kind: "gold"; amount; minutes? }`).
 */
export type RewardOf<V extends AnyVocab, Extra extends { readonly kind: string } = never> =
  | Exclude<CurrencyReward<CurrencyOf<V>>, { kind: Extra["kind"] }>
  | Extra;

/**
 * A price: `{ currency; amount }` in one of the vocabulary's currencies, plus the game's own price shapes in
 * `Extra` (real money, an event's currency).
 */
export type PriceOf<V extends AnyVocab, Extra extends { readonly currency: string } = never> =
  | { currency: CurrencyOf<V>; amount: DecimalSource }
  | Extra;

/** A rarity draw's weights, one per rung. */
export type OddsTable<R extends string> = Record<R, number>;
