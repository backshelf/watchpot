import { type RefObject } from "react";
/**
 * Reads design tokens (CSS custom properties) at runtime, so canvas and WebGL effects take their colours from
 * `tokens.css` like everything else. Pass the element the effect lives in to pick up the nearest `data-theme`;
 * without one, the document root is read. An empty string means the token is not defined there (CSS not
 * loaded, or a test without stylesheets): callers fall back to a CSS-only rendering rather than a literal colour.
 */
export declare function readToken(name: string, scope?: Element | null): string;
/** `readToken` for many tokens at one scope: the scope's computed style is read once, each token from it. */
export declare function tokenReader(scope?: Element | null): (name: string) => string;
/** `#fff` (the bundler shortens a token it can) back to `#ffffff`, so every reader sees six digits. */
export declare function longHex(value: string): string;
/** The five foil stops, in order, with undefined tokens dropped. */
export declare function readFoil(scope?: Element | null, read?: (name: string) => string): string[];
/**
 * `read(element)` at `ref`'s element while `live`, read again whenever the element's scope (its theme, its world
 * and the page's scheme) is not the one last read (checked on every commit) or that scope's `data-theme` or
 * `data-world`, or <html>'s `data-scheme`, changes. A read made once on mount keeps the old theme's colours when
 * an element moves under another theme, and one keyed by theme alone keeps one world's colours on every other
 * world. A shader or canvas reads its stops this way.
 */
export declare function useScopedRead<T>(ref: RefObject<Element | null>, live: boolean, read: (scope: Element) => T | null): T | null;
/**
 * Mixes two `#rrggbb` tokens in sRGB, `t` of the way from `a` to `b` (what `color-mix(in srgb, b t, a)` draws).
 * Anything else returns `a` unchanged: the token is the authority, and a guess would be a hard-coded colour.
 */
export declare function mixHex(a: string, b: string, t: number): string;
/** Relative luminance of a `#rrggbb` (WCAG), for picking an ink against a ground. */
export declare function luminance(hex: string): number;
