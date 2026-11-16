import { describe, expect, test } from "bun:test";
import { createMemoryBackend } from "watchpot/core";
import { fixtureSave, freshStore, T0, testClock } from "watchpot/test";
import { regular, toy } from "../core/toy";

/** The test kit: a clock moved by hand, a store over any game, a save made by play. */

describe("testClock", () => {
  test("frozen at its start until moved; set and advance move it", () => {
    const clock = testClock(1000);
    expect(clock.now()).toBe(1000);
    expect(clock.advance(500)).toBe(1500);
    clock.set(10);
    expect(clock.now()).toBe(10);
  });

  test("follows another clock, shifted by its moves", () => {
    let wall = 100;
    const clock = testClock(() => wall);
    wall = 200;
    expect(clock.now()).toBe(200);
    clock.advance(50);
    wall = 300;
    expect(clock.now()).toBe(350);
  });
});

describe("freshStore", () => {
  test("caught up at T0 on its clock, saving straight through to a memory backend", () => {
    const { store, backend, clock } = freshStore(toy);
    expect(store.getState().clock.createdAt).toBe(T0);
    store.getState().wallet.earn(5);
    expect(backend.getItem("toy.save")).not.toBeNull();
    store.getState().tick(1000, clock.advance(1000));
    expect(store.getState().clock.lastSeen).toBe(T0 + 1000);
    expect(store.getState().gameNow()).toBe(T0 + 1000);
  });

  test("not caught up when asked; reloads from a backend; loads a save handed to it", () => {
    const { store, backend } = freshStore(toy, { catchUp: false });
    expect(store.getState().clock.createdAt).toBe(0);
    store.getState().wallet.earn(32);
    expect(freshStore(toy, { backend }).store.getState().wallet.gold.eq(42)).toBe(true);
    const save = backend.getItem("toy.save") ?? "";
    const other = freshStore(toy, { save, backend: createMemoryBackend(), name: "elsewhere" });
    expect(other.store.getState().wallet.gold.eq(42)).toBe(true);
    expect(other.backend.getItem("toy.save")).toBeNull();
  });

  test("seeded stores draw alike", () => {
    const a = freshStore(toy, { seed: "s" }).store.getState().generator.rng;
    expect(freshStore(toy, { seed: "s" }).store.getState().generator.rng).toEqual(a);
  });
});

describe("fixtureSave", () => {
  test("the same persona makes the same save, and it loads progressed", () => {
    const save = fixtureSave(toy, regular);
    expect(fixtureSave(toy, regular)).toBe(save);
    const { store } = freshStore(toy, { save, catchUp: false });
    expect(store.getState().prestige.runs).toBe(1);
    expect(store.getState().generator.owned).toBeGreaterThan(1);
  });
});
