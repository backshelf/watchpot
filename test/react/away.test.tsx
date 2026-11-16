import { describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { D } from "../../src/core/decimal";
import { type AwayReturn, awayGains, useAwayReport, watchAway } from "../../src/react/away";
import { IdleStoreProvider, type RuntimeStore } from "../../src/react/store";
import { freshStore } from "../../src/test/store";
import { toy } from "../core/toy";

type ToyState = ReturnType<ReturnType<typeof freshStore<typeof toy.features, object>>["store"]["getState"]>;

describe("watchAway", () => {
  test("hears a catch-up over the threshold, with the states either side, and nothing else", () => {
    const { store, clock } = freshStore(toy);
    const heard: AwayReturn<ToyState>[] = [];
    const off = watchAway<ToyState>(store as never, (a) => heard.push(a), { minMs: 30_000 });

    clock.advance(1000);
    store.getState().tick(1000, clock.now());
    clock.advance(10_000);
    store.getState().catchUp(clock.now());
    expect(heard).toHaveLength(0);

    clock.advance(120_000);
    store.getState().catchUp(clock.now());
    expect(heard).toHaveLength(1);
    expect(heard[0]?.ms).toBe(120_000);
    expect(heard[0]?.after).toBe(store.getState());
    expect(heard[0]?.before).not.toBe(heard[0]?.after);

    off();
    clock.advance(120_000);
    store.getState().catchUp(clock.now());
    expect(heard).toHaveLength(1);
  });

  test("a fresh profile's first catch-up is not a return", () => {
    const { store, clock } = freshStore(toy, { catchUp: false });
    const heard: unknown[] = [];
    watchAway<ToyState>(store as never, (a) => heard.push(a), { minMs: 1 });
    clock.advance(3_600_000);
    store.getState().catchUp(clock.now());
    expect(heard).toHaveLength(0);
  });

  test("settlePasses waits that many more changes and reports the state after them", () => {
    const { store, clock } = freshStore(toy);
    const heard: AwayReturn<ToyState>[] = [];
    watchAway<ToyState>(store as never, (a) => heard.push(a), { settlePasses: 1 });
    clock.advance(60_000);
    store.getState().catchUp(clock.now());
    expect(heard).toHaveLength(0);
    clock.advance(100);
    store.getState().tick(100, clock.now());
    expect(heard).toHaveLength(1);
    expect(heard[0]?.after).toBe(store.getState());
    expect(heard[0]?.ms).toBe(60_000);
  });
});

describe("awayGains", () => {
  test("lists what went up, in order, and leaves out what fell or stood", () => {
    const before = { a: D(1), b: D(5), c: D(2) };
    const after = { a: D("1e400"), b: D(1), c: D(2) };
    const gains = awayGains(before, after, { c: (s) => s.c, a: (s) => s.a, b: (s) => s.b });
    expect(gains.map((g) => g.id)).toEqual(["a"]);
    expect(gains[0]?.gain.gt("1e399")).toBe(true);
  });
});

function Slip() {
  const { report, dismiss } = useAwayReport<ToyState, string>((a) =>
    a.ms >= 600_000 ? `${a.ms / 1000}s` : null,
  );
  if (!report) return null;
  return (
    <button type="button" onClick={dismiss}>
      {report}
    </button>
  );
}

describe("useAwayReport", () => {
  test("holds the game's report of a return until dismissed, under StrictMode", () => {
    const { store, clock } = freshStore(toy);
    render(
      <StrictMode>
        <IdleStoreProvider store={store as unknown as RuntimeStore}>
          <Slip />
        </IdleStoreProvider>
      </StrictMode>,
    );
    act(() => {
      clock.advance(60_000);
      store.getState().catchUp(clock.now());
    });
    expect(screen.queryByRole("button")).toBeNull();
    act(() => {
      clock.advance(900_000);
      store.getState().catchUp(clock.now());
    });
    const slip = screen.getByRole("button", { name: "900s" });
    act(() => slip.click());
    expect(screen.queryByRole("button")).toBeNull();
  });
});
