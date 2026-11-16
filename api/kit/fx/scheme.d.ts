/**
 * The game tab's colour scheme, the one place it reaches the page: `data-scheme` on <html>, which the token blocks
 * key on (`tokens.css`: the dark scheme overlays the game's theme blocks). The settings
 * slice owns the preference; the shell hands it here, as it hands the motion setting to `setReducedMotion`.
 */
/** Settings > Appearance. "system" follows the OS's `prefers-color-scheme`, live. */
export type SchemePreference = "system" | "light" | "dark";
/** A resolved colour scheme: `light` or `dark`. */
export type Scheme = "light" | "dark";
/** The scheme a preference comes to, given what the OS asks for. Pure. */
export declare function resolveScheme(pref: SchemePreference, osDark: boolean): Scheme;
/**
 * Writes the preference's scheme to `data-scheme` on <html> now and, while it is "system", again whenever the OS
 * changes its mind. Returns the undo: the listener goes and the attribute with it.
 */
export declare function applyColorScheme(pref: SchemePreference): () => void;
