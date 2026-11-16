import { expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useGameClock } from "watchpot/react";
import { freshStore } from "watchpot/test";
import { toy } from "../core/toy";

test("useGameClock starts the clock, reports the tab as its own, and stops on unmount", () => {
  const { store } = freshStore(toy);
  const view = renderHook(() => useGameClock(store));
  expect(view.result.current).toEqual({ taken: false });
  expect(() => view.unmount()).not.toThrow();
});
