import { describe, expect, test } from "bun:test";
import { createGameStorage, createIdleStore, createMemoryBackend, defineGame, feature } from "watchpot/core";

const at = () => ({ now: () => 0, storage: createGameStorage(createMemoryBackend()) });
const save = { key: "layers", version: 1 } as const;

describe("derived values in layers", () => {
  test("a later layer reads the ones before it, with no annotation", () => {
    const stove = feature({
      key: "stove",
      initial: () => ({ burners: 2, bubbles: 30 }),
      derived: [
        { price: (s) => 10 * (s.stove.burners + 1) },
        { canBuy: (s) => s.stove.bubbles >= s.stove.price },
        { label: (s) => (s.stove.canBuy ? `buy for ${s.stove.price}` : "wait") },
      ],
      actions: (api) => ({
        buy: () =>
          api.set((s) => {
            if (!s.stove.canBuy) return false;
            s.stove.bubbles -= s.stove.price;
            s.stove.burners += 1;
            return true;
          }),
      }),
    });
    const store = createIdleStore(defineGame({ id: "l", save, features: [stove] }), at());
    const price: number = store.getState().stove.price;
    const canBuy: boolean = store.getState().stove.canBuy;
    const label: string = store.getState().stove.label;
    expect([price, canBuy, label]).toEqual([30, true, "buy for 30"]);
    expect(store.getState().stove.buy()).toBe(true);
    expect(store.getState().stove.label).toBe("wait");
  });

  test("an earlier layer does not see a later one", () => {
    feature({
      key: "pan",
      initial: () => ({ n: 1 }),
      derived: [
        // @ts-expect-error `later` is declared in the next layer
        { early: (s) => s.pan.later },
        { later: (s) => s.pan.n + 1 },
      ],
    });
  });

  test("a name in two layers is refused", () => {
    expect(() =>
      feature({ key: "x", initial: () => ({ n: 1 }), derived: [{ a: () => 1 }, { a: () => 2 }] as never }),
    ).toThrow("two layers");
  });
});
