/**
 * Confetti presets by rung, on canvas-confetti. The rule is one loud thing: five presets climb with the rung's
 * height (`tierStep(tier, 5)`), so the lowest rung gets nothing, the next a polite puff, and the storm is kept for
 * the top; on a five-rung ladder each rung has its own. Colours are read from the tokens at fire time (the rung's
 * hue is `--rarity-<id>`), so the same call in another theme comes out in its colours. Nothing fires while motion is
 * reduced (the OS or the in-game setting, `prefersReducedMotion`), and every shot still passes
 * `disableForReducedMotion`.
 */
import confetti, { type Options } from "canvas-confetti";
import { prefersReducedMotion } from "./motion";
import { type RarityTier, tierStep, tierToken } from "./rarity";
import { readFoil, readToken } from "./tokens";

/** One call to canvas-confetti, `delay` ms after the preset starts. */
export interface Shot {
  delay: number;
  options: Options;
}

/** The token colours a preset draws from. An empty string means the token was not found. */
export interface ConfettiColors {
  paper: string;
  /** The rung's own hue. */
  hue: string;
  muted: string;
  foil: string[];
}

/** Options for a confetti burst: where it starts, the canvas to draw on and the element whose theme it reads. */
export interface FireOptions {
  /** Where the burst starts, as fractions of the canvas (default: the middle, a little low). */
  origin?: { x: number; y: number };
  /** Draw on this canvas instead of the full-window one (for example inside the game tab frame). */
  canvas?: HTMLCanvasElement;
  /** Read the colours from this element's theme instead of the document root. */
  scope?: Element | null;
}

/** Reads the colours the presets use from the tokens: `--paper`, the rung's hue, `--ink-muted`, the foil stops. */
export function readConfettiColors(tier: RarityTier | null, scope?: Element | null): ConfettiColors {
  return {
    paper: readToken("--paper", scope),
    hue: tier ? readToken(tierToken(tier), scope) : "",
    muted: readToken("--ink-muted", scope),
    foil: readFoil(scope),
  };
}

const CENTRE = { x: 0.5, y: 0.6 };

const present = (colors: string[]): string[] => colors.filter((c) => c !== "");

/**
 * The shots for a rung: none, a puff of paper, a burst in its hue, a rain of its hue and the gold stop, a storm of
 * every foil stop. Pure: no canvas, no timers. Empty when the preset is none or its colours are missing.
 */
export function confettiShots(
  tier: RarityTier,
  colors: ConfettiColors,
  origin: { x: number; y: number } = CENTRE,
): Shot[] {
  switch (tierStep(tier, 5)) {
    case 0:
      return [];
    case 1: {
      const palette = present([colors.paper]);
      if (palette.length === 0) return [];
      return [
        {
          delay: 0,
          options: {
            particleCount: 16,
            spread: 55,
            startVelocity: 16,
            gravity: 0.7,
            decay: 0.88,
            scalar: 0.6,
            ticks: 80,
            shapes: ["square"],
            colors: palette,
            origin,
          },
        },
      ];
    }
    case 2: {
      const palette = present([colors.hue, colors.hue, colors.hue, colors.paper]);
      if (palette.length === 0) return [];
      return [
        {
          delay: 0,
          options: {
            particleCount: 60,
            spread: 70,
            startVelocity: 32,
            gravity: 0.9,
            decay: 0.9,
            scalar: 0.8,
            ticks: 140,
            shapes: ["square"],
            colors: palette,
            origin,
          },
        },
      ];
    }
    case 3: {
      const palette = present([colors.hue, colors.hue, colors.foil[1] ?? "", colors.paper]);
      if (palette.length === 0) return [];
      // Rain, not a burst: six falls across the top over ~900ms, slow and heavy.
      return [0.15, 0.85, 0.35, 0.65, 0.5, 0.25].map((x, i) => ({
        delay: i * 150,
        options: {
          particleCount: 14,
          angle: 270,
          spread: 40,
          startVelocity: 6,
          gravity: 0.55,
          decay: 0.95,
          drift: 0,
          scalar: 0.85,
          ticks: 280,
          shapes: ["square"],
          colors: palette,
          origin: { x, y: -0.05 },
        },
      }));
    }
    default: {
      const palette = present(colors.foil);
      if (palette.length === 0) return [];
      const storm: Shot[] = [
        {
          delay: 0,
          options: {
            particleCount: 90,
            spread: 360,
            startVelocity: 30,
            gravity: 0.6,
            decay: 0.91,
            scalar: 0.9,
            ticks: 220,
            shapes: ["square", "circle"],
            colors: palette,
            origin,
          },
        },
      ];
      // Then both bottom corners fire inward, five times over a second.
      for (let i = 0; i < 5; i++) {
        for (const side of [0, 1] as const) {
          storm.push({
            delay: 120 + i * 200,
            options: {
              particleCount: 26,
              angle: side === 0 ? 60 : 120,
              spread: 55,
              startVelocity: 55,
              gravity: 0.9,
              decay: 0.92,
              scalar: 0.9,
              ticks: 220,
              shapes: ["square", "circle"],
              colors: palette,
              origin: { x: side, y: 0.95 },
            },
          });
        }
      }
      return storm;
    }
  }
}

/** One grey square (`--ink-muted`), popped a little way up, falling flat: the sad confetti. Pure, like `confettiShots`. */
export function centsShots(colors: ConfettiColors, origin: { x: number; y: number } = CENTRE): Shot[] {
  if (colors.muted === "") return [];
  return [
    {
      delay: 0,
      options: {
        particleCount: 1,
        angle: 90,
        spread: 0,
        startVelocity: 9,
        gravity: 1.1,
        decay: 0.94,
        scalar: 1.1,
        ticks: 90,
        flat: true,
        shapes: ["square"],
        colors: [colors.muted],
        origin,
      },
    },
  ];
}

const scoped = new WeakMap<HTMLCanvasElement, ReturnType<typeof confetti.create>>();

function fire(shots: Shot[], canvas?: HTMLCanvasElement): void {
  if (prefersReducedMotion()) return;
  let shoot: (options: Options) => unknown = confetti;
  if (canvas) {
    let instance = scoped.get(canvas);
    if (!instance) {
      instance = confetti.create(canvas, { resize: true, disableForReducedMotion: true });
      scoped.set(canvas, instance);
    }
    shoot = instance;
  }
  for (const { delay, options } of shots) {
    const go = () => void shoot({ ...options, disableForReducedMotion: true });
    if (delay === 0) go();
    else setTimeout(go, delay);
  }
}

/** Fires the rung's preset (the lowest does nothing). */
export function burst(tier: RarityTier, options: FireOptions = {}): void {
  fire(confettiShots(tier, readConfettiColors(tier, options.scope), options.origin), options.canvas);
}

/** Fires the single sad grey square. */
export function cents(options: FireOptions = {}): void {
  fire(centsShots(readConfettiColors(null, options.scope), options.origin), options.canvas);
}
