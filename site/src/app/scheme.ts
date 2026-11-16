// The page's two prints of one drawing: the blueline (light) and the blueprint (dark). The reader's choice is kept in
// this browser; without one the system's scheme is followed (the inline script in each page sets it before paint).
import { useSyncExternalStore } from "react";

export type Scheme = "light" | "dark";

const KEY = "watchpot.site.scheme";
const listeners = new Set<() => void>();

const read = (): Scheme => (document.documentElement.dataset.scheme === "dark" ? "dark" : "light");

export function setScheme(scheme: Scheme) {
  document.documentElement.dataset.scheme = scheme;
  try {
    localStorage.setItem(KEY, scheme);
  } catch {
    // A browser that refuses storage still switches for this visit.
  }
  for (const wake of listeners) wake();
}

export const toggleScheme = () => setScheme(read() === "dark" ? "light" : "dark");

/** What each scheme is called on the switch: the name of the print the page would become. */
export const schemeName = (scheme: Scheme) => (scheme === "dark" ? "Blueprint" : "Blueline");

export function useScheme(): Scheme {
  return useSyncExternalStore(
    (wake) => {
      listeners.add(wake);
      return () => listeners.delete(wake);
    },
    read,
    () => "light",
  );
}

/** Follows the system while the reader has not chosen. */
export function followSystem() {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    let chosen: string | null = null;
    try {
      chosen = localStorage.getItem(KEY);
    } catch {
      chosen = null;
    }
    if (chosen === "light" || chosen === "dark") return;
    document.documentElement.dataset.scheme = media.matches ? "dark" : "light";
    for (const wake of listeners) wake();
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
