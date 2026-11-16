import type { Draft } from "immer";
import { type Feature, type FeatureApi, feature, type ResetRule } from "../feature";
import { nextInt, type RngState, seedRng } from "../rng";
import type { AnyVocab, Ladder, OddsTable } from "../vocab";
import { drawRarity, freshPity, type PityRule, type PityState, type PityTrigger } from "./kernel";

/**
 * The gacha primitive: a feature that owns a set of boxes' pity counters, one rng stream, the opens per box, the
 * free opens held per box and the last open. A box draws its rarity through the kernel, then `roll` (the post-draw
 * roll: a card from a catalogue, a gear piece's slot and substats) turns the rarity into an item on the same stream.
 * The primitive charges nothing: a game's paying action takes the price in its own recipe and calls `openDraft`.
 */

/** The post-draw roll: the item a pull of `rarity` gives, and the rng after it. */
export type GachaRoll<R extends string, B extends string, P> = (pull: {
  rarity: R;
  box: B;
  triggered: PityTrigger<R>;
  rng: RngState;
}) => [P, RngState];

/** One pull: the rarity, the pity floor that fired and the item rolled. */
export interface GachaPull<R extends string, P> {
  rarity: R;
  triggered: PityTrigger<R>;
  item: P;
}

/** One open: the box, the count, the free tokens used and its pulls. */
export interface GachaOpen<B extends string, R extends string, P> {
  box: B;
  count: number;
  /** Free opens spent, before any the caller paid for. */
  tokensUsed: number;
  pulls: GachaPull<R, P>[];
}

/** A gacha's saved state: pity per box, the rng, opens, free tokens and the last open. */
export interface GachaState<B extends string, R extends string, P> {
  pity: Record<B, PityState<R>>;
  rng: RngState;
  /** Opens per box, ever. */
  opened: Record<B, number>;
  /** Free opens held per box; an open spends them first. */
  tokens: Record<B, number>;
  lastOpen: GachaOpen<B, R, P> | null;
}

/** A gacha's actions: `open` and `grant`. */
export interface GachaActions<B extends string, R extends string, P> {
  /** Opens `count` of a box for free (tokens first, then nothing owed): a game that charges uses `openDraft`. */
  open(box: B, count?: number): GachaOpen<B, R, P>;
  /** Hands out free opens of a box. */
  grant(box: B, count: number): void;
}

/** The definition `gacha` takes: key, ladder, odds, pity, roll, reset and vocabulary. */
export interface GachaDef<K extends string, R extends string, B extends string, P> {
  readonly key: K;
  readonly ladder: Ladder<R>;
  /** Each box's odds table. Its keys are the boxes. */
  readonly odds: Readonly<Record<B, OddsTable<R>>>;
  /** Each box's guarantees. */
  readonly pity: Readonly<Record<B, PityRule<R>>>;
  /** The post-draw roll; without it a pull's item is its rarity. */
  readonly roll?: GachaRoll<R, B, P>;
  /** What a prestige reset does to it: kept whole by default, as pity is account-level. */
  readonly reset?: ResetRule<GachaState<B, R, P>>;
  /** The vocabulary the ladder came from, for `defineGame`'s check. */
  readonly vocab?: AnyVocab;
}

/** The feature, plus the draft helper a game's paying action opens with. */
export type GachaFeature<K extends string, R extends string, B extends string, P> = Feature<
  K,
  GachaState<B, R, P>,
  GachaActions<B, R, P>
> & {
  /** Draft helper: opens `count` of a box inside the caller's recipe (tokens first) and records it. */
  openDraft(draft: Draft<Record<K, GachaState<B, R, P>>>, box: B, count: number): GachaOpen<B, R, P>;
};

/**
 * `count` pulls in sequence from one box's table and rule, threading pity and rng: the rarity, then `roll`. Pure,
 * for a game that keeps its own state and calls the kernel itself.
 */
export function drawMany<R extends string, B extends string, P>(
  ladder: Ladder<R>,
  box: B,
  odds: OddsTable<R>,
  rule: PityRule<R>,
  pity: PityState<R>,
  rng: RngState,
  count: number,
  roll: GachaRoll<R, B, P>,
): { pulls: GachaPull<R, P>[]; pity: PityState<R>; rng: RngState } {
  const pulls: GachaPull<R, P>[] = [];
  let p = pity;
  let state = rng;
  for (let i = 0; i < Math.max(0, Math.floor(count)); i++) {
    const draw = drawRarity(ladder, state, odds, p, rule);
    const [item, next] = roll({ rarity: draw.rarity, box, triggered: draw.triggered, rng: draw.rng });
    pulls.push({ rarity: draw.rarity, triggered: draw.triggered, item });
    p = draw.pity;
    state = next;
  }
  return { pulls, pity: p, rng: state };
}

/** A post-draw roll that picks evenly among the catalogue's entries of the drawn rarity (any entry when none). */
export function catalogueRoll<R extends string, T extends { readonly rarity: R }>(
  catalogue: readonly T[],
): GachaRoll<R, string, T> {
  return ({ rarity, rng }) => {
    const matching = catalogue.filter((c) => c.rarity === rarity);
    const pool = matching.length > 0 ? matching : catalogue;
    const [i, next] = nextInt(rng, pool.length);
    const item = pool[i];
    if (item === undefined) throw new Error("catalogueRoll: the catalogue is empty");
    return [item, next];
  };
}

const perBox = <B extends string, T>(boxes: readonly B[], make: (box: B) => T): Record<B, T> =>
  Object.fromEntries(boxes.map((b) => [b, make(b)])) as Record<B, T>;

/** Declares a gacha. Its rng stream is seeded from the profile's first draws and its key, so a seeded store replays it. */
export function gacha<const K extends string, R extends string, B extends string, P = R>(
  def: GachaDef<K, R, B, P>,
): GachaFeature<K, R, B, P> {
  const boxes = Object.keys(def.odds) as B[];
  const roll: GachaRoll<R, B, P> = def.roll ?? (({ rarity, rng }) => [rarity as unknown as P, rng]);

  type State = GachaState<B, R, P>;
  /** The gacha's own state in a draft of any game that holds it. */
  const sliceOf = (draft: Draft<Record<K, State>>): State => (draft as Record<K, State>)[def.key];
  const openDraft = (draft: Draft<Record<K, State>>, box: B, count: number): GachaOpen<B, R, P> => {
    const s = sliceOf(draft);
    const n = Math.max(0, Math.floor(count));
    const tokensUsed = Math.min(s.tokens[box], n);
    const drawn = drawMany(def.ladder, box, def.odds[box], def.pity[box], s.pity[box], s.rng, n, roll);
    const open: GachaOpen<B, R, P> = { box, count: n, tokensUsed, pulls: drawn.pulls };
    s.tokens[box] -= tokensUsed;
    s.pity[box] = drawn.pity;
    s.rng = [...drawn.rng];
    s.opened[box] += n;
    s.lastOpen = open;
    return open;
  };

  const made = feature({
    key: def.key,
    vocab: def.vocab,
    initial: (ctx): State => ({
      pity: perBox(boxes, (b) => freshPity(def.pity[b])),
      rng: seedRng(`${ctx.rng.join(".")}:${def.key}`),
      opened: perBox(boxes, () => 0),
      tokens: perBox(boxes, () => 0),
      lastOpen: null,
    }),
    reset: def.reset ?? "never",
    actions: (api: FeatureApi<Record<K, State>>): GachaActions<B, R, P> => ({
      open: (box, count = 1) => {
        let result: GachaOpen<B, R, P> = { box, count: 0, tokensUsed: 0, pulls: [] };
        api.set((d) => {
          result = openDraft(d, box, count);
        });
        return result;
      },
      grant: (box, count) =>
        api.set((d) => {
          const s = sliceOf(d);
          s.tokens[box] += Math.max(0, Math.floor(count));
        }),
    }),
  });
  return Object.assign(made, { openDraft });
}
