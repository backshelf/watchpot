// The page's context: its data from the build, the game host, the controls' values, and (while the build draws the
// page) the glossary and a list of the words it used.
import { createContext, use, useCallback, useRef, useSyncExternalStore } from "react";
import type { GameHost, Snapshot } from "./host";
import type { PageData, PageDef, TermData } from "./page";
import type { ParamValue } from "./run";

export interface Guide {
  page: PageDef;
  data: PageData;
  host: GameHost;
  params: Record<string, ParamValue>;
  setParam: (name: string, value: ParamValue) => void;
  /** At build time only: every glossary entry, and the ids the page used (the build ships only those). */
  glossary?: Record<string, TermData>;
  used?: Set<string>;
}

export const GuideContext = createContext<Guide | null>(null);

export function useGuide(): Guide {
  const guide = use(GuideContext);
  if (!guide) throw new Error("a guide component is outside its page");
  return guide;
}

/** The whole snapshot: the game's state and the host's facts. The build's fresh state while the page hydrates. */
export function useSnapshot(): Snapshot {
  const { host } = useGuide();
  return useSyncExternalStore(host.subscribe, host.snapshot, () => host.initial);
}

/**
 * The example's exports, for a panel that reads its helpers: `useExample<typeof import("…/simmer/game")>()` types
 * them without importing the example (a type-only import runs nothing). Fresh after every rebuild.
 */
export function useExample<T = Record<string, unknown>>(): T {
  const { host } = useGuide();
  useSnapshot();
  return host.exports() as T;
}

/**
 * One value out of the game's state, re-read on every change. `select` should return a string, a number or a
 * boolean (a new object on every call would redraw forever); format a Decimal with `fmt(...).text` inside it.
 */
export function useView<T>(select: (state: Record<string, unknown>) => T): T {
  const { host } = useGuide();
  const last = useRef<{ state: unknown; select: unknown; value: T } | null>(null);
  const read = useCallback(
    (snap: Snapshot) => {
      const prior = last.current;
      if (prior && prior.state === snap.state && prior.select === select) return prior.value;
      const fresh = select(snap.state);
      const value = prior && Object.is(prior.value, fresh) ? prior.value : fresh;
      last.current = { state: snap.state, select, value };
      return value;
    },
    [select],
  );
  return useSyncExternalStore(
    host.subscribe,
    () => read(host.snapshot()),
    () => read(host.initial),
  );
}
