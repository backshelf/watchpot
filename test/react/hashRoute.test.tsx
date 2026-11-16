import { afterEach, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { useHashRoute } from "watchpot/react";

afterEach(() => {
  location.hash = "";
});

/** Moves the hash and tells the page, as the address bar and the back button do. */
function moveHash(route: string) {
  act(() => {
    location.hash = route;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

test("follows the hash without its #, opens and closes, under StrictMode", () => {
  const view = renderHook(() => useHashRoute(), { wrapper: StrictMode });
  expect(view.result.current[0]).toBe("");
  moveHash("dev");
  expect(view.result.current[0]).toBe("dev");
  act(() => {
    view.result.current[1]("");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(view.result.current[0]).toBe("");
  view.unmount();
});
