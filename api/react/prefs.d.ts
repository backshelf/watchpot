import type { Prefs } from "../core/prefs";
/** A prefs store's value in React: re-renders when it changes. With `select`, only when the selected part does. */
export declare function usePrefs<T extends object>(store: Prefs<T>): T;
export declare function usePrefs<T extends object, U>(store: Prefs<T>, select: (value: T) => U): U;
