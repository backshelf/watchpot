import { describe, expect, spyOn, test } from "bun:test";
import { render, renderHook, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { D } from "watchpot/core";
import {
  createRuntimeHooks,
  IdleStoreProvider,
  type RuntimeStore,
  useShallow,
  useTickNow,
} from "watchpot/react";

interface State {
  gold: ReturnType<typeof D>;
}

const state: State = { gold: D(21) };
const store = {
  getState: () => state,
  setState() {},
  subscribe: () => () => {},
} as unknown as RuntimeStore;

const { useGameState, useGameStore } = createRuntimeHooks<RuntimeStore & { getState(): State }>();

/** Reads a Decimal its selector computes, wrapped in `useShallow`. */
function Doubled() {
  const gold = useGameState(useShallow((s: State) => s.gold.mul(2)));
  return <p>{gold.toString()}</p>;
}

/** The same selector, unwrapped: a new Decimal on every call. */
function Unstable() {
  const gold = useGameState((s: State) => s.gold.mul(2));
  return <p>{gold.toString()}</p>;
}

describe("the selector trap", () => {
  test("a Decimal built by the selector is stable under useShallow, with no warning", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      render(
        <StrictMode>
          <IdleStoreProvider store={store}>
            <Doubled />
          </IdleStoreProvider>
        </StrictMode>,
      );
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test("an unstable selector is named in development, with the fix, before React's loop", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        render(
          <IdleStoreProvider store={store}>
            <Unstable />
          </IdleStoreProvider>,
        ),
      ).toThrow();
      const said = warn.mock.calls.map(([m]) => String(m));
      expect(said.filter((m) => m.includes("s.gold.mul(2)"))).toHaveLength(1);
      expect(said[0]).toContain("useShallow");
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  test("outside a provider, the error names the hook called and mountGame", () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useGameStore())).toThrow(/useGameStore.*mountGame/);
      expect(() => renderHook(() => useTickNow())).toThrow(/useTickNow.*mountGame/);
    } finally {
      error.mockRestore();
    }
  });
});
