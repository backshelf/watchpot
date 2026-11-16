import { describe, expect, test } from "bun:test";
import { adoptBranch, branchStore, nextInt, seedRng } from "watchpot/core";
import { OFFLINE_RATE, T0, toy, toyStore } from "./toy";

describe("branches", () => {
  test("a branch starts as the store stands and plays on without touching it", () => {
    const { store } = toyStore();
    store.getState().catchUp(T0);
    store.getState().wallet.earn(90);
    const branch = branchStore(toy, store, { now: () => T0 });
    expect(branch.getState().wallet.gold.eq(100)).toBe(true);
    expect(branch.getState().clock.lastSeen).toBe(T0);

    branch.getState().catchUp(T0 + 60_000);
    expect(branch.getState().wallet.gold.eq(100 + 60 * OFFLINE_RATE)).toBe(true);
    expect(store.getState().wallet.gold.eq(100)).toBe(true);
    expect(store.getState().clock.lastSeen).toBe(T0);
  });

  test("branches cut from one state part once they are given different draws", () => {
    const { store } = toyStore();
    store.getState().catchUp(T0);
    const gains = [0, 1, 2].map((i) => {
      const branch = branchStore(toy, store, { now: () => T0 });
      const [found] = nextInt(seedRng(`find:${i}`), 1000);
      branch.getState().wallet.earn(found);
      return branch.getState().wallet.gold.toNumber();
    });
    expect(new Set(gains).size).toBe(3);
    expect(store.getState().wallet.gold.eq(10)).toBe(true);
  });

  test("adopting a branch puts its saved state in the store, as a profile swap seen now", () => {
    const { store, backend } = toyStore();
    store.getState().catchUp(T0);
    const branch = branchStore(toy, store, { now: () => T0 });
    branch.getState().catchUp(T0 + 60_000);
    branch.getState().wallet.earn(5);
    const swaps = store.profileSwaps();

    adoptBranch(store, branch, T0 + 90_000);
    const s = store.getState();
    expect(s.wallet.gold.eq(10 + 60 * OFFLINE_RATE + 5)).toBe(true);
    // A transient field is not carried over, and the clock lands on the moment of adoption.
    expect(s.wallet.flash).toBeNull();
    expect(s.clock.lastSeen).toBe(T0 + 90_000);
    expect(store.profileSwaps()).toBe(swaps + 1);
    // The catch-up that follows credits nothing for the time the branch already played.
    s.catchUp(T0 + 90_000);
    expect(store.getState().wallet.gold.eq(10 + 60 * OFFLINE_RATE + 5)).toBe(true);
    expect(backend.getItem("toy.save")).not.toBeNull();
  });

  test("a store the engine did not make cannot adopt", () => {
    const { store } = toyStore();
    const branch = branchStore(toy, store, { now: () => T0 });
    expect(() => adoptBranch({ getState: () => store.getState() }, branch)).toThrow("createIdleStore");
  });
});
