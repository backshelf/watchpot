import { describe, expect, test } from "bun:test";
import { createMemoryBackend, createPaceClock, createRamp, prefs, readPrefs } from "watchpot/core";

const VIEW = { quality: "high", brightness: 1, grain: true };

describe("prefs", () => {
  test("a patch is saved under the key and read back by the next store", () => {
    const backend = createMemoryBackend();
    const view = prefs({ key: "toy.view", initial: VIEW, backend });
    view.set({ brightness: 1.2 });
    expect(view.get()).toEqual({ quality: "high", brightness: 1.2, grain: true });
    expect(prefs({ key: "toy.view", initial: VIEW, backend }).get().brightness).toBe(1.2);
  });

  test("listeners hear each change; the value is the same object until one", () => {
    const view = prefs({ key: "toy.view", initial: VIEW, backend: null });
    let heard = 0;
    const off = view.subscribe(() => heard++);
    const before = view.get();
    expect(view.get()).toBe(before);
    view.set({ grain: false });
    expect(heard).toBe(1);
    expect(view.get()).not.toBe(before);
    off();
    view.set({ grain: true });
    expect(heard).toBe(1);
  });

  test("a stored value this build does not accept reads as the default", () => {
    const backend = createMemoryBackend();
    backend.setItem("toy.view", "{ not json");
    expect(prefs({ key: "toy.view", initial: VIEW, backend }).get()).toEqual(VIEW);
    backend.setItem("toy.view", JSON.stringify({ quality: 4, brightness: "loud", extra: 1 }));
    expect(prefs({ key: "toy.view", initial: VIEW, backend }).get()).toEqual(VIEW);
    expect(readPrefs({ brightness: Number.NaN }, VIEW)).toEqual(VIEW);
  });

  test("a stored text that is not JSON reaches the game's read as the string it is", () => {
    const backend = createMemoryBackend();
    backend.setItem("toy.view", "low");
    const view = prefs({
      key: "toy.view",
      initial: VIEW,
      backend,
      read: (raw, initial) =>
        typeof raw === "string" ? { ...initial, quality: raw } : readPrefs(raw, initial),
    });
    expect(view.get().quality).toBe("low");
    view.set({ grain: false });
    expect(JSON.parse(backend.getItem("toy.view") ?? "{}")).toEqual({
      ...VIEW,
      quality: "low",
      grain: false,
    });
  });

  test("the game's read cleans every value on its way in", () => {
    const view = prefs({
      key: "toy.view",
      initial: VIEW,
      backend: null,
      read: (raw, initial) => {
        const v = readPrefs(raw, initial);
        return { ...v, brightness: Math.min(1.4, Math.max(0.6, v.brightness)) };
      },
    });
    view.set({ brightness: 9 });
    expect(view.get().brightness).toBe(1.4);
  });

  test("an override shows for this load and is never saved", () => {
    const backend = createMemoryBackend();
    const view = prefs({ key: "toy.view", initial: VIEW, backend, override: { quality: "low" } });
    expect(view.get().quality).toBe("low");
    view.set({ grain: false });
    expect(view.get().quality).toBe("low");
    expect(JSON.parse(backend.getItem("toy.view") ?? "{}").quality).toBe("high");
  });

  test("an override lets go of a key the player sets, and of every key on a reset", () => {
    const backend = createMemoryBackend();
    const made = () =>
      prefs({ key: "toy.view", initial: VIEW, backend, override: { quality: "low", grain: false } });
    const view = made();
    view.set({ quality: "medium" });
    expect(view.get()).toEqual({ quality: "medium", brightness: 1, grain: false });
    expect(JSON.parse(backend.getItem("toy.view") ?? "{}")).toEqual({ ...VIEW, quality: "medium" });
    view.reset();
    expect(view.get()).toEqual(VIEW);
    expect(made().get()).toEqual({ ...VIEW, quality: "low", grain: false });
  });
});

describe("createPaceClock", () => {
  test("runs at real time until slowed, and holds at a scale of 0", () => {
    let real = 0;
    const clock = createPaceClock(() => real);
    real = 2;
    expect(clock.now()).toBe(2);
    clock.setScale(0.5);
    real = 4;
    expect(clock.now()).toBe(3);
    clock.setScale(0);
    real = 10;
    expect(clock.now()).toBe(3);
    expect(clock.real()).toBe(10);
  });

  test("a ramp is integrated exactly: reading often or once gives the same time", () => {
    let real = 0;
    const once = createPaceClock(() => real);
    const often = createPaceClock(() => real);
    once.setScale(0, 2);
    often.setScale(0, 2);
    for (real = 0; real < 3; real += 0.01) often.now();
    real = 3;
    // The scale falls from 1 to 0 over two seconds: one second of scaled time, then nothing.
    expect(once.now()).toBeCloseTo(1, 9);
    expect(often.now()).toBeCloseTo(once.now(), 9);
    expect(once.scale).toBe(0);
  });
});

describe("createRamp", () => {
  test("eases from where it is to the target, at rest at both ends", () => {
    const ramp = createRamp(0);
    ramp.set(10, 100, 4);
    expect(ramp.at(100)).toBe(0);
    expect(ramp.at(102)).toBeCloseTo(5);
    expect(ramp.at(104)).toBe(10);
    expect(ramp.at(999)).toBe(10);
    expect(ramp.at(101)).toBeLessThan(2.5); // slow out of the start
    ramp.set(0, 102, 0);
    expect(ramp.at(102)).toBe(0);
    expect(ramp.target).toBe(0);
  });
});
