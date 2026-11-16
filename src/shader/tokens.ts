// A shader's palette from the game's design tokens: CSS custom properties read at the canvas's scope as colours,
// read again when that scope's theme, scheme or classes change.
import { type RefObject, useLayoutEffect, useState } from "react";

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

let probe: CanvasRenderingContext2D | null | undefined;

/** A 1x1 2D context that turns any CSS colour into sRGB bytes; null where there is none (a test DOM). */
function probeContext(): CanvasRenderingContext2D | null {
  if (probe !== undefined) return probe;
  probe = null;
  if (typeof document === "undefined") return probe;
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  probe = c.getContext("2d", { willReadFrequently: true });
  return probe;
}

const byte = (n: number) =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, "0");

/**
 * Any CSS colour as `#rrggbbaa` (`#abc`, `rgb()`, `hsl()`, `oklch()`, a name): hex is read directly, anything else
 * is painted to a 1x1 canvas and read back, so every colour space the browser knows lands in sRGB. Null for an empty
 * or unknown value, or for a non-hex value where there is no canvas.
 */
export function parseColour(value: string): string | null {
  const v = value.trim();
  const hex = HEX.exec(v)?.[1];
  if (hex) {
    const long = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    return `#${(long.length === 6 ? `${long}ff` : long).toLowerCase()}`;
  }
  if (
    v === "" ||
    (typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports("color", v))
  )
    return null;
  const ctx = probeContext();
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${byte(r)}${byte(g)}${byte(b)}${byte(a)}`;
}

/** Reads `names` (custom properties, `--x`) at `el` as colours; null if any is not a colour there. */
export function readTokens<N extends string>(el: Element, names: readonly N[]): Record<N, string> | null {
  if (typeof getComputedStyle !== "function") return null;
  const style = getComputedStyle(el);
  const out = {} as Record<N, string>;
  for (const name of names) {
    const colour = parseColour(style.getPropertyValue(name));
    if (colour === null) return null;
    out[name] = colour;
  }
  return out;
}

const same = (a: Record<string, string> | null, b: Record<string, string> | null) =>
  a === b || (a !== null && b !== null && Object.keys(a).every((k) => a[k] === b[k]));

/**
 * The colour tokens `names` at `ref`'s element, as `#rrggbbaa` strings a shader's uniforms take directly; null
 * until every one reads as a colour (no stylesheet: show the still). Read again when `data-theme`, `data-scheme`,
 * `class` or `style` changes on the element or any ancestor, and when the system colour scheme flips.
 */
export function useShaderTokens<N extends string>(
  ref: RefObject<Element | null>,
  names: readonly N[],
): Record<N, string> | null {
  const [value, setValue] = useState<Record<N, string> | null>(null);
  const key = names.join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `names` by value
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const next = readTokens(el, names);
      setValue((was) => (same(was, next) ? was : next));
    };
    read();
    const cleanups: (() => void)[] = [];
    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(read);
      // Each ancestor alone, attributes only: a subtree watch would wake on every class change in the game.
      for (let at: Element | null = el; at; at = at.parentElement)
        observer.observe(at, {
          attributes: true,
          attributeFilter: ["data-theme", "data-scheme", "class", "style"],
        });
      cleanups.push(() => observer.disconnect());
    }
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", read);
      cleanups.push(() => mq.removeEventListener("change", read));
    }
    return () => {
      for (const c of cleanups) c();
    };
  }, [ref, key]);
  return value;
}
