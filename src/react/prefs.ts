import { useSyncExternalStore } from "react";
import type { Prefs } from "../core/prefs";

/** A prefs store's value in React: re-renders when it changes. With `select`, only when the selected part does. */
export function usePrefs<T extends object>(store: Prefs<T>): T;
export function usePrefs<T extends object, U>(store: Prefs<T>, select: (value: T) => U): U;
export function usePrefs<T extends object, U>(store: Prefs<T>, select?: (value: T) => U): T | U {
  const read = () => (select ? select(store.get()) : store.get());
  return useSyncExternalStore(store.subscribe, read, read);
}
