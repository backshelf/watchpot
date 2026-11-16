import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Reads design tokens (CSS custom properties) at runtime, so canvas and WebGL effects take their colours from
 * `tokens.css` like everything else. Pass the element the effect lives in to pick up the nearest `data-theme`;
 * without one, the document root is read. An empty string means the token is not defined there (CSS not
 * loaded, or a test without stylesheets): callers fall back to a CSS-only rendering rather than a literal colour.
 */
export function readToken(name: string, scope?: Element | null): string {
  return tokenReader(scope)(name);
}

/** `readToken` for many tokens at one scope: the scope's computed style is read once, each token from it. */
export function tokenReader(scope?: Element | null): (name: string) => string {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return () => "";
  const style = getComputedStyle(scope ?? document.documentElement);
  return (name) => longHex(style.getPropertyValue(name).trim());
}

/** `#fff` (the bundler shortens a token it can) back to `#ffffff`, so every reader sees six digits. */
export function longHex(value: string): string {
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i.exec(value);
  if (!m) return value;
  const [, r, g, b, a] = m;
  return `#${r}${r}${g}${g}${b}${b}${a ? `${a}${a}` : ""}`;
}

/** The five foil stops, in order, with undefined tokens dropped. */
export function readFoil(scope?: Element | null, read = tokenReader(scope)): string[] {
  return ["--foil-1", "--foil-2", "--foil-3", "--foil-4", "--foil-5"]
    .map((name) => read(name))
    .filter((value) => value !== "");
}

/** The theme an element's tokens resolve under: its nearest `data-theme`, or "" when nothing sets one. */
function themeOf(el: Element): string {
  return el.closest("[data-theme]")?.getAttribute("data-theme") ?? "";
}

/** The world laid over that theme: the nearest `data-world` (the game page's open tab), or "" outside one. */
function worldOf(el: Element): string {
  return el.closest("[data-world]")?.getAttribute("data-world") ?? "";
}

/** The colour scheme on <html> (`data-scheme`, Settings > Appearance), or "" before the shell sets one. */
function schemeOf(): string {
  return typeof document === "undefined" ? "" : (document.documentElement.getAttribute("data-scheme") ?? "");
}

/** What a read was made for: the theme, the world and the scheme together, since each changes the tokens. */
const scopeOf = (el: Element) => `${themeOf(el)}/${worldOf(el)}/${schemeOf()}`;

/**
 * `read(element)` at `ref`'s element while `live`, read again whenever the element's scope (its theme, its world
 * and the page's scheme) is not the one last read (checked on every commit) or that scope's `data-theme` or
 * `data-world`, or <html>'s `data-scheme`, changes. A read made once on mount keeps the old theme's colours when
 * an element moves under another theme, and one keyed by theme alone keeps one world's colours on every other
 * world. A shader or canvas reads its stops this way.
 */
export function useScopedRead<T>(
  ref: RefObject<Element | null>,
  live: boolean,
  read: (scope: Element) => T | null,
): T | null {
  const [value, setValue] = useState<T | null>(null);
  const readFor = useRef<string | null>(null);
  const check = useCallback(() => {
    const el = ref.current;
    if (!live || !el) {
      readFor.current = null;
      return;
    }
    const scope = scopeOf(el);
    if (scope === readFor.current) return;
    readFor.current = scope;
    setValue(read(el));
  }, [ref, live, read]);

  useLayoutEffect(check);
  useEffect(() => {
    const el = ref.current;
    const themeScope = el?.closest("[data-theme]") ?? document.documentElement;
    const worldScope = el?.closest("[data-world]") ?? null;
    if (!live || typeof MutationObserver === "undefined") return;
    const html = document.documentElement;
    const observer = new MutationObserver(check);
    const themeAttrs = ["data-theme", "data-world"];
    // <html> carries the scheme: watched with the theme when it is the theme scope, on its own otherwise.
    if (themeScope === html) themeAttrs.push("data-scheme");
    else observer.observe(html, { attributes: true, attributeFilter: ["data-scheme"] });
    observer.observe(themeScope, { attributes: true, attributeFilter: themeAttrs });
    if (worldScope && worldScope !== themeScope) {
      observer.observe(worldScope, { attributes: true, attributeFilter: ["data-world"] });
    }
    return () => observer.disconnect();
  }, [ref, live, check]);

  return value;
}

/**
 * Mixes two `#rrggbb` tokens in sRGB, `t` of the way from `a` to `b` (what `color-mix(in srgb, b t, a)` draws).
 * Anything else returns `a` unchanged: the token is the authority, and a guess would be a hard-coded colour.
 */
export function mixHex(a: string, b: string, t: number): string {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
  const ma = hex.exec(a);
  const mb = hex.exec(b);
  if (!ma || !mb) return a;
  const k = Math.min(1, Math.max(0, t));
  const channel = (i: number) => {
    const from = Number.parseInt(ma[i] ?? "0", 16);
    const to = Number.parseInt(mb[i] ?? "0", 16);
    return Math.round(from + (to - from) * k)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(1)}${channel(2)}${channel(3)}`;
}

/** Relative luminance of a `#rrggbb` (WCAG), for picking an ink against a ground. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const channel = (shift: number) => {
    const c = ((n >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}
