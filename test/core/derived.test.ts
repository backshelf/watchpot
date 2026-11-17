import { describe, expect, test } from "bun:test";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineFeature,
  defineGame,
  flushSave,
  reach,
} from "watchpot/core";

const save = { key: "derived.save", version: 1 } as const;
const at = (storage = createGameStorage(createMemoryBackend())) => ({ now: () => 1000, storage });

/** Counts how often each derived value is worked out. */
const runs = { perSecond: 0, doubled: 0, label: 0 };
const reset = () => {
  runs.perSecond = 0;
  runs.doubled = 0;
  runs.label = 0;
};

const stove = defineFeature({
  key: "stove",
  initial: () => ({ burners: 0, paid: 0 }),
  derived: {
    perSecond: (s) => {
      runs.perSecond += 1;
      return s.stove.burners * 2;
    },
  },
  actions: (api) => ({
    buy: () =>
      api.set((s) => {
        s.stove.burners += 1;
      }),
    pay: () =>
      api.set((s) => {
        s.stove.paid += 1;
      }),
    buyAndRead: () =>
      api.set((s) => {
        s.stove.burners += 1;
        return s.stove.perSecond;
      }),
  }),
  steps: {
    produce: {
      burn: {
        pass: "tick",
        run: (s, ctx) => {
          s.stove.paid += (s.stove.perSecond * ctx.dtMs) / 1000;
        },
      },
    },
  },
});

const lid = defineFeature({
  key: "lid",
  reach: () => [stove],
  initial: () => ({ on: false }),
  derived: {
    doubled: (s) => {
      runs.doubled += 1;
      return s.lid.on ? s.stove.perSecond * 2 : s.stove.perSecond;
    },
  },
  actions: (api) => ({
    toggle: () =>
      api.set((s) => {
        s.lid.on = !s.lid.on;
      }),
  }),
});

const sign = defineFeature({
  key: "sign",
  initial: () => ({ text: "hot" }),
  derived: {
    label: (s) => {
      runs.label += 1;
      return s.sign.text.toUpperCase();
    },
  },
  actions: (api) => ({
    write: (text: string) =>
      api.set((s) => {
        s.sign.text = text;
      }),
  }),
});

const game = defineGame({ id: "derived", save, features: [stove, lid, sign] });

describe("derived values", () => {
  test("are on the state from the start, typed by what they return", () => {
    const store = createIdleStore(game, at());
    const perSecond: number = store.getState().stove.perSecond;
    const label: string = store.getState().sign.label;
    expect(perSecond).toBe(0);
    expect(label).toBe("HOT");
    expect(store.getState().lid.doubled).toBe(0);
  });

  test("follow an action, through a value that reads another", () => {
    const store = createIdleStore(game, at());
    store.getState().stove.buy();
    expect(store.getState().stove.perSecond).toBe(2);
    expect(store.getState().lid.doubled).toBe(2);
    store.getState().lid.toggle();
    expect(store.getState().lid.doubled).toBe(4);
  });

  test("only what could have changed is worked out again", () => {
    const store = createIdleStore(game, at());
    reset();
    store.getState().sign.write("warm");
    expect(runs).toEqual({ perSecond: 0, doubled: 0, label: 1 });
    reset();
    store.getState().lid.toggle();
    expect(runs).toEqual({ perSecond: 0, doubled: 1, label: 0 });
    reset();
    store.getState().stove.buy();
    expect(runs).toEqual({ perSecond: 1, doubled: 1, label: 0 });
  });

  test("a value that comes out the same does not disturb what reads it", () => {
    const store = createIdleStore(game, at());
    store.getState().stove.buy();
    reset();
    // The stove's slice is written, but its rate comes out the same: the lid's value is left alone.
    store.getState().stove.pay();
    expect(runs.perSecond).toBe(1);
    expect(runs.doubled).toBe(0);
  });

  test("a step reads the value as the steps before it left it", () => {
    const store = createIdleStore(game, at());
    store.getState().stove.buy();
    store.getState().tick(1000, 2000);
    expect(store.getState().stove.paid).toBe(2);
  });

  test("a recipe reads the value as of its start, and the state after has the new one", () => {
    const store = createIdleStore(game, at());
    expect(store.getState().stove.buyAndRead()).toBe(0);
    expect(store.getState().stove.perSecond).toBe(2);
  });

  test("are never saved, and are worked out again on load", async () => {
    const backend = createMemoryBackend();
    const first = createIdleStore(game, at(createGameStorage(backend)));
    first.getState().stove.buy();
    first.getState().stove.buy();
    const json = first.getState().exportProfile();
    expect(json).not.toContain("perSecond");
    expect(json).not.toContain("doubled");
    flushSave(first);
    const second = createIdleStore(game, at(createGameStorage(backend)));
    await second.hydrated;
    expect(second.getState().stove.burners).toBe(2);
    expect(second.getState().stove.perSecond).toBe(4);
    const third = createIdleStore(game, at());
    third.getState().importProfile(json);
    expect(third.getState().lid.doubled).toBe(4);
  });

  test("follow a profile reset and a run reset", () => {
    const store = createIdleStore(game, at());
    store.getState().stove.buy();
    store.getState().resetRun();
    expect(store.getState().stove.perSecond).toBe(0);
    store.getState().stove.buy();
    store.getState().resetProfile();
    expect(store.getState().lid.doubled).toBe(0);
  });

  test("cannot be written", () => {
    const cheat = defineFeature({
      key: "cheat",
      reach: () => [stove],
      initial: () => ({}),
      actions: (api) => ({
        set: () =>
          api.set((s) => {
            (s.stove as { perSecond: number }).perSecond = 99;
          }),
      }),
    });
    const cheating = createIdleStore(defineGame({ id: "cheat", save, features: [stove, cheat] }), at());
    expect(() => cheating.getState().cheat.set()).toThrow("derived value");
  });

  test("two values that read each other are refused, naming the loop", () => {
    const a = defineFeature({
      key: "a",
      reach: reach<{ b: { y: number } }>(),
      initial: () => ({}),
      derived: { x: (s): number => s.b.y + 1 },
    });
    const b = defineFeature({
      key: "b",
      reach: () => [a],
      initial: () => ({}),
      derived: { y: (s): number => s.a.x + 1 },
    });
    expect(() => createIdleStore(defineGame({ id: "loop", save, features: [a, b] }), at())).toThrow(
      /loop: a\.x → b\.y → a\.x/,
    );
  });

  test("a write that goes round the recipes is caught up with", () => {
    const store = createIdleStore(game, at());
    store.setState((s) => {
      s.stove.burners = 5;
    });
    expect(store.getState().stove.perSecond).toBe(10);
    expect(store.getState().lid.doubled).toBe(10);
  });

  test("a derived value named like a field or an action is refused", () => {
    const clash = defineFeature({ key: "clash", initial: () => ({ n: 1 }), derived: { n: () => 2 } });
    expect(() => defineGame({ id: "clash", save, features: [clash] })).toThrow("derived value `n`");
  });
});
