import { useEffect, useRef } from "react";

/**
 * The browser tab's title, shared by the events that write it. Each takes a claim under its own id; the latest
 * claim shows, and when the last one is released the page's own title comes back. Without one owner, two hooks
 * that each save and restore the title can put back each other's words.
 */
const claims = new Map<string, string>();
let pageTitle: string | null = null;

function show(): void {
  const titles = [...claims.values()];
  document.title = titles[titles.length - 1] ?? pageTitle ?? document.title;
}

/** Sets `owner`'s title. A claim already held keeps its place; a new one goes on top. */
export function claimTabTitle(owner: string, title: string): void {
  if (pageTitle === null) pageTitle = document.title;
  claims.set(owner, title);
  show();
}

/** Drops `owner`'s claim: the claim under it shows, or the page's own title once none is left. */
export function releaseTabTitle(owner: string): void {
  if (!claims.delete(owner)) return;
  show();
  if (claims.size === 0) pageTitle = null;
}

/** Options of `useAwayTitle`. */
export interface AwayTitleOptions {
  /** How long each title shows before the next, ms. Default 20 000. */
  everyMs?: number;
  /** The claim's owner id (`claimTabTitle`). Default "away". */
  owner?: string;
  /** False leaves the tab's title alone. Default true. */
  enabled?: boolean;
}

/**
 * While the tab is hidden, the browser tab shows `titles` in turn (the game's own words: what it says to a player
 * who has looked away), and the page's own title comes back on the return. `titles` may be a function, called each
 * time the tab hides, so the words can be made from the state at that moment. Nothing is claimed while it is empty.
 */
export function useAwayTitle(
  titles: readonly string[] | (() => readonly string[]),
  options: AwayTitleOptions = {},
): void {
  const { everyMs = 20_000, owner = "away", enabled = true } = options;
  const latest = useRef(titles);
  latest.current = titles;
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
      releaseTabTitle(owner);
    };
    const change = () => {
      stop();
      if (!document.hidden) return;
      const source = latest.current;
      const list = typeof source === "function" ? source() : source;
      if (list.length === 0) return;
      let at = 0;
      claimTabTitle(owner, list[0] as string);
      timer = setInterval(
        () => {
          at = (at + 1) % list.length;
          claimTabTitle(owner, list[at] as string);
        },
        Math.max(1000, everyMs),
      );
    };
    document.addEventListener("visibilitychange", change);
    change();
    return () => {
      document.removeEventListener("visibilitychange", change);
      stop();
    };
  }, [everyMs, owner, enabled]);
}
