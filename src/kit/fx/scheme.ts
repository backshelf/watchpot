/**
 * The game tab's colour scheme, the one place it reaches the page: `data-scheme` on <html>, which the token blocks
 * key on (`tokens.css`: the dark scheme overlays the game's theme blocks). The settings
 * slice owns the preference; the shell hands it here, as it hands the motion setting to `setReducedMotion`.
 */

/** Settings > Appearance. "system" follows the OS's `prefers-color-scheme`, live. */
export type SchemePreference = "system" | "light" | "dark";
/** A resolved colour scheme: `light` or `dark`. */
export type Scheme = "light" | "dark";

const QUERY = "(prefers-color-scheme: dark)";

function darkQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(QUERY);
}

/** The scheme a preference comes to, given what the OS asks for. Pure. */
export function resolveScheme(pref: SchemePreference, osDark: boolean): Scheme {
  if (pref === "system") return osDark ? "dark" : "light";
  return pref;
}

/**
 * Writes the preference's scheme to `data-scheme` on <html> now and, while it is "system", again whenever the OS
 * changes its mind. Returns the undo: the listener goes and the attribute with it.
 */
export function applyColorScheme(pref: SchemePreference): () => void {
  if (typeof document === "undefined") return () => {};
  const root = document.documentElement;
  const mq = pref === "system" ? darkQuery() : null;
  const write = () => {
    root.dataset.scheme = resolveScheme(pref, mq?.matches ?? false);
  };
  write();
  mq?.addEventListener?.("change", write);
  return () => {
    mq?.removeEventListener?.("change", write);
    delete root.dataset.scheme;
  };
}
