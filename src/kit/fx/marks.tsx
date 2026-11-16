import { type CSSProperties, useEffect, useState } from "react";
import { middleOf } from "./gesture";
import { prefersReducedMotion } from "./motion";

/**
 * Marks at a point: a press answered where it landed (a ring, a scatter of dots, a figure lifting off). A mark is a
 * short-lived element placed straight into one layer (no React render), animated by the Web Animations API on
 * transform and opacity only, removed by a timer when its run ends (so a hidden tab still cleans up), never more
 * than `max` at once, and its element reused. Its look is the game's: a class, `[data-mark="<kind>"]`, `--step`
 * (how far up a streak) and `--n` (a counter for variety, 0..15).
 */

/** The properties a mark may animate: the compositor's own, so a hundred marks never lay out the page. */
const ANIMATED = new Set([
  "offset",
  "easing",
  "composite",
  "transform",
  "opacity",
  "translate",
  "scale",
  "rotate",
]);

/** `keyframes` with every property but transform, opacity, translate, scale and rotate taken out. Pure. */
export function compositorOnly(keyframes: readonly Keyframe[]): Keyframe[] {
  return keyframes.map(
    (k) => Object.fromEntries(Object.entries(k).filter(([p]) => ANIMATED.has(p))) as Keyframe,
  );
}

/**
 * The default mark's run: it pops up from 60% and rises as it fades; under reduced motion it only fades in place.
 * The mark is centred on its point by `translate(-50%, -50%)` in every frame.
 */
export function markKeyframes(reduced: boolean): Keyframe[] {
  const at = "translate(-50%, -50%)";
  return reduced
    ? [
        { transform: at, opacity: 0 },
        { transform: at, opacity: 1, offset: 0.2 },
        { transform: at, opacity: 0 },
      ]
    : [
        { transform: `${at} translateY(0) scale(0.6)`, opacity: 0 },
        { transform: `${at} translateY(-6px) scale(1.08)`, opacity: 1, offset: 0.18 },
        { transform: `${at} translateY(-24px) scale(1)`, opacity: 0 },
      ];
}

/** How a mark runs: keyframes (or a function of reduced motion), duration and easing. */
export interface MarkRun {
  /** The run's keyframes, or a function of reduced motion; null leaves the animation to the game's CSS. */
  keyframes?: readonly Keyframe[] | ((reduced: boolean) => readonly Keyframe[] | null) | null;
  /** Default 600 (half under reduced motion). */
  duration?: number;
  /** Default `cubic-bezier(0.2, 0.8, 0.2, 1)`. */
  easing?: string;
}

/** One mark: its kind, its step up a streak, a word to print, its own class, and its run. */
export interface MarkOptions extends MarkRun {
  /** Written as `data-mark`. */
  kind?: string;
  /** Written as `--step`. Default 0. */
  step?: number;
  /** The mark's text (a figure lifting off: `×12`). */
  text?: string;
  /** A class beside the layer's mark class. */
  className?: string;
  /** Custom properties of its own (`{ "--tilt": "4deg" }`), for the game's CSS. */
  vars?: Readonly<Record<`--${string}`, string | number>>;
}

/** Options of `createMarks`: the cap, every mark's class and default run, and the gates. */
export interface MarksOptions extends MarkRun {
  /** The most marks at once; the oldest goes first. Default 18. */
  max?: number;
  /** Every mark's class. */
  className?: string;
  /** How long a mark the game's CSS animates lives, ms. Default 1600. */
  lifetime?: number;
  /** Default `prefersReducedMotion`. */
  reduced?: () => boolean;
  /** No mark is made while this holds. Default: the document is hidden. */
  hidden?: () => boolean;
}

/** What `createMarks` returns. */
export interface Marks {
  /** The layer marks go into (the `MarkLayer` attaches itself); returns the detach. */
  attach(layer: HTMLElement): () => void;
  /** Leaves a mark at a client point (px). Null when nothing is attached or the page is hidden. */
  at(x: number, y: number, options?: MarkOptions): HTMLElement | null;
  /** Leaves a mark at an element's middle. */
  on(el: Element, options?: MarkOptions): HTMLElement | null;
  /** Removes every mark. */
  clear(): void;
  /** How many marks are up. */
  live(): number;
}

/** A pool of marks for one layer; module level, so a handler anywhere can leave one. */
export function createMarks(options: MarksOptions = {}): Marks {
  const max = Math.max(1, Math.floor(options.max ?? 18));
  const lifetime = options.lifetime ?? 1600;
  const reduced = options.reduced ?? prefersReducedMotion;
  const hidden = options.hidden ?? (() => typeof document !== "undefined" && document.hidden);
  let layer: HTMLElement | null = null;
  const up: { el: HTMLElement; timer: ReturnType<typeof setTimeout> }[] = [];
  const pool: HTMLElement[] = [];
  let n = 0;

  const remove = (el: HTMLElement) => {
    const i = up.findIndex((m) => m.el === el);
    if (i < 0) return;
    const [mark] = up.splice(i, 1);
    if (mark) clearTimeout(mark.timer);
    for (const a of el.getAnimations?.() ?? []) a.cancel();
    el.remove();
    if (pool.length < max) pool.push(el);
  };

  const at = (x: number, y: number, o: MarkOptions = {}): HTMLElement | null => {
    if (!layer || hidden()) return null;
    while (up.length >= max) {
      const oldest = up[0];
      if (!oldest) break;
      remove(oldest.el);
    }
    const el = pool.pop() ?? layer.ownerDocument.createElement("i");
    const box = layer.getBoundingClientRect();
    const cls = [options.className, o.className].filter(Boolean).join(" ");
    if (cls) el.className = cls;
    else el.removeAttribute("class");
    el.setAttribute("aria-hidden", "true");
    if (o.kind !== undefined) el.dataset.mark = o.kind;
    else el.setAttribute("data-mark", "");
    el.textContent = o.text ?? "";
    // A pooled element starts clean: no custom property of the last mark carries over.
    el.removeAttribute("style");
    for (const [name, value] of Object.entries(o.vars ?? {})) el.style.setProperty(name, String(value));
    el.style.position = "absolute";
    el.style.left = `${Math.round(x - box.left)}px`;
    el.style.top = `${Math.round(y - box.top)}px`;
    el.style.pointerEvents = "none";
    el.style.setProperty("--step", String(o.step ?? 0));
    el.style.setProperty("--n", String(n++ % 16));
    layer.appendChild(el);

    const still = reduced();
    const run =
      o.keyframes !== undefined
        ? o.keyframes
        : options.keyframes !== undefined
          ? options.keyframes
          : markKeyframes;
    const frames = typeof run === "function" ? run(still) : run;
    let life = lifetime;
    if (frames && typeof el.animate === "function") {
      const base = o.duration ?? options.duration ?? 600;
      const duration = still ? base / 2 : base;
      el.animate(compositorOnly(frames), {
        duration,
        easing: o.easing ?? options.easing ?? "cubic-bezier(0.2, 0.8, 0.2, 1)",
        fill: "both",
      });
      life = duration;
    }
    up.push({ el, timer: setTimeout(() => remove(el), life) });
    return el;
  };

  return {
    attach(next) {
      layer = next;
      return () => {
        if (layer !== next) return;
        for (const m of [...up]) remove(m.el);
        layer = null;
      };
    },
    at,
    on(el, o) {
      const p = middleOf(el);
      return at(p.x, p.y, o);
    },
    clear() {
      for (const m of [...up]) remove(m.el);
    },
    live: () => up.length,
  };
}

/** Props of `MarkLayer`: the marks it holds, and its class and style (its stacking order is the game's). */
export interface MarkLayerProps {
  marks: Marks;
  className?: string;
  style?: CSSProperties;
}

const LAYER_STYLE: CSSProperties = { position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" };

/** The layer a `Marks` draws into: over the viewport by default, never taking the pointer, hidden from assistive tech. */
export function MarkLayer({ marks, className, style }: MarkLayerProps) {
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  useEffect(() => (layer ? marks.attach(layer) : undefined), [marks, layer]);
  return (
    <div
      ref={setLayer}
      className={className}
      style={{ ...LAYER_STYLE, ...style }}
      aria-hidden="true"
      data-mark-layer=""
    />
  );
}

/** Options of `kick`. */
export interface KickOptions {
  /** A second kick on the same element and name within this is skipped, ms. Default 160. */
  gapMs?: number;
  now?: () => number;
}

const kicked = new WeakMap<Element, Map<string, number>>();

/**
 * Restarts a CSS animation on `el`: `data-<name>` flips between `a` and `b`, so a keyframe keyed on each value starts
 * over even while the last is running (a balance's pill kicking as a payout lands). At most once per `gapMs` per
 * element and name; true when it kicked.
 */
export function kick(el: Element | null, name = "bump", options: KickOptions = {}): boolean {
  if (!el) return false;
  const t = (options.now ?? (() => performance.now()))();
  const byName = kicked.get(el) ?? new Map<string, number>();
  kicked.set(el, byName);
  if (t - (byName.get(name) ?? Number.NEGATIVE_INFINITY) < (options.gapMs ?? 160)) return false;
  byName.set(name, t);
  const attr = `data-${name}`;
  el.setAttribute(attr, el.getAttribute(attr) === "a" ? "b" : "a");
  return true;
}
