import { describe, expect, test } from "bun:test";
import {
  type CurrencyOf,
  checkRank,
  D,
  defineGame,
  feature,
  type GameVocab,
  type GraphNode,
  ladder,
  type OddsTable,
  type PriceOf,
  type RarityOf,
  type RewardOf,
  rankCost,
  type StatOf,
  vocab,
  type Yield,
} from "watchpot/core";

/** A toy game's words, the way a game declares them. */
const TOY = vocab({
  currencies: ["gold", "gems"],
  stats: { speed: "toy.speed", luck: "toy.luck" },
  rarities: ["common", "rare", "epic"],
} as const);

type ToyReward = RewardOf<
  typeof TOY,
  { kind: "chest"; count: number } | { kind: "gold"; amount: number; bonus?: true }
>;
type ToyPrice = PriceOf<typeof TOY, { currency: "cents"; amount: number }>;

describe("a vocabulary types the engine's words", () => {
  test("its unions are read off the declaration", () => {
    const c: CurrencyOf<typeof TOY>[] = ["gold", "gems"];
    const s: StatOf<typeof TOY>[] = ["toy.speed", "toy.luck"];
    const r: RarityOf<typeof TOY>[] = ["common", "epic"];
    // @ts-expect-error not a currency of the toy
    const notCurrency: CurrencyOf<typeof TOY> = "keys";
    // @ts-expect-error a stat's key is not its id
    const notStat: StatOf<typeof TOY> = "speed";
    // @ts-expect-error not a rung
    const notRarity: RarityOf<typeof TOY> = "mythic";
    expect([c, s, r, notCurrency, notStat, notRarity]).toHaveLength(6);
    expect(TOY.currencies).toEqual(["gold", "gems"]);
    expect(TOY.stats).toEqual(["toy.speed", "toy.luck"]);
  });

  test("a reward is one plain kind per currency plus the game's own, which may replace a currency's", () => {
    const rewards: ToyReward[] = [
      { kind: "gems", amount: 5 },
      { kind: "gold", amount: 3, bonus: true },
      { kind: "chest", count: 2 },
    ];
    // @ts-expect-error not a kind of the toy
    const unknownKind: ToyReward = { kind: "keys", amount: 1 };
    // @ts-expect-error the game's chest needs its count
    const chestWithoutCount: ToyReward = { kind: "chest" };
    // @ts-expect-error the game's gold replaced the plain one, whose amount took any DecimalSource
    const stringGold: ToyReward = { kind: "gold", amount: "3" };
    const gold = rewards.find((r) => r.kind === "gold");
    // Narrowed to the game's gold, so its extra field reads without a cast.
    expect(gold?.kind === "gold" && gold.bonus).toBe(true);
    expect([unknownKind, chestWithoutCount, stringGold]).toHaveLength(3);
  });

  test("a vocabulary with no extras rewards its currencies only", () => {
    const plain: RewardOf<typeof TOY> = { kind: "gold", amount: D(1) };
    // @ts-expect-error no chest without the game's extras
    const chest: RewardOf<typeof TOY> = { kind: "chest", count: 1 };
    expect([plain, chest]).toHaveLength(2);
  });

  test("a price charges a currency of the vocabulary or one of the game's own shapes", () => {
    const prices: ToyPrice[] = [
      { currency: "gems", amount: 10 },
      { currency: "cents", amount: 199 },
    ];
    // @ts-expect-error not a currency of the toy
    const keys: ToyPrice = { currency: "keys", amount: 1 };
    expect([...prices, keys]).toHaveLength(3);
  });

  test("an odds table needs every rung, and a tree prices in the vocabulary's currencies", () => {
    const odds: OddsTable<RarityOf<typeof TOY>> = { common: 80, rare: 15, epic: 5 };
    // @ts-expect-error the epic rung is missing
    const short: OddsTable<RarityOf<typeof TOY>> = { common: 80, rare: 20 };
    const node: GraphNode<never, CurrencyOf<typeof TOY>> = {
      id: "a",
      name: "A",
      line: "",
      cost: [{ currency: "gems", amount: 2 }],
      maxLevel: 3,
      requires: [],
      effects: [],
    };
    const price = rankCost(node, 1);
    const currency: CurrencyOf<typeof TOY> | undefined = price[0]?.currency;
    expect(currency).toBe("gems");
    expect(checkRank(node, {}, (c) => (c === "gems" ? D(1) : undefined))).toMatchObject({
      code: "cannot-afford",
      currency: "gems",
    });
    const fuel: Yield<"stage-clear" | "boss-clear"> = { on: "stage-clear", per: 1 };
    // @ts-expect-error not one of the game's actions
    const badFuel: Yield<"stage-clear"> = { on: "keypress", per: 1 };
    expect([odds, short, fuel, badFuel]).toHaveLength(4);
  });

  test("a repeated word is refused, naming it", () => {
    expect(() => vocab({ currencies: ["gold", "gold"], stats: [], rarities: ["common"] })).toThrow(/"gold"/);
    expect(() => vocab({ currencies: [], stats: { a: "x", b: "x" }, rarities: ["common"] })).toThrow(/"x"/);
    expect(() => vocab({ currencies: [], stats: [], rarities: ["common", "common"] })).toThrow(/"common"/);
    expect(() => ladder([])).toThrow();
  });
});

describe("the ladder", () => {
  const L = TOY.rarities;

  test("keeps the declared order, lowest first", () => {
    expect(L.ids).toEqual(["common", "rare", "epic"]);
    expect(L.size).toBe(3);
    expect(L.ids.map((r) => L.indexOf(r))).toEqual([0, 1, 2]);
    expect([L.at(0), L.at(2), L.at(3), L.at(-1), L.at(0.5)]).toEqual([
      "common",
      "epic",
      undefined,
      undefined,
      undefined,
    ]);
  });

  test("next steps up one rung and stops at the top", () => {
    expect(L.next("common")).toBe("rare");
    expect(L.next("rare")).toBe("epic");
    expect(L.next("epic")).toBeUndefined();
  });

  test("atLeast is a rung and everything above it", () => {
    expect(L.atLeast("common")).toEqual(L.ids);
    expect(L.atLeast("rare")).toEqual(["rare", "epic"]);
    expect(L.atLeast("epic")).toEqual(["epic"]);
    for (const a of L.ids) for (const b of L.ids) expect(L.isAtLeast(a, b)).toBe(L.atLeast(b).includes(a));
  });

  test("compare sorts lowest first and has guards a parsed string", () => {
    expect(["epic", "common", "rare", "common"].filter(L.has).sort(L.compare)).toEqual([
      "common",
      "common",
      "rare",
      "epic",
    ]);
    expect(L.has("mythic")).toBe(false);
  });
});

describe("a game's vocabulary", () => {
  const wallet = feature({ key: "wallet", initial: () => ({ gold: D(0) }), vocab: TOY });

  test("defineGame carries it and types it back", () => {
    const game = defineGame({
      id: "toy",
      save: { key: "toy.save", version: 1 },
      features: [wallet],
      vocab: TOY,
    });
    expect(game.vocab).toBe(TOY);
    const gems: CurrencyOf<GameVocab<typeof game>> = "gems";
    // @ts-expect-error not a currency of the game
    const keys: CurrencyOf<GameVocab<typeof game>> = "keys";
    expect([gems, keys]).toHaveLength(2);
  });

  test("a game with none has an undefined vocabulary", () => {
    const plain = feature({ key: "plain", initial: () => ({}) });
    const game = defineGame({ id: "plain", save: { key: "p", version: 1 }, features: [plain] });
    const none: undefined = game.vocab;
    expect(none).toBeUndefined();
  });

  test("a feature built over another vocabulary, or over one the game lacks, is refused", () => {
    const other = vocab({ currencies: ["gold", "gems"], stats: [], rarities: ["common"] });
    const save = { key: "toy.save", version: 1 };
    expect(() => defineGame({ id: "toy", save, features: [wallet], vocab: other })).toThrow(/"wallet"/);
    expect(() => defineGame({ id: "toy", save, features: [wallet] })).toThrow(/"wallet"/);
  });
});
