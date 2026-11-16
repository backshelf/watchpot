// The guide, chapter 11 (docs/guide/11-look-and-sound.md): Simmer's first shader and first sound.
//
// The backdrop is the pot seen from above: water lit from below by the burners, bubbles rising through
// it. The pot's warmth (how many bubbles a second the stove makes, on a log scale) is its one game number.
// The sound is a blip on every tap of the pot and a whoosh when a burner is lit.

import { type CSSProperties, useRef } from "react";
import { createIdleStore, fmt } from "watchpot/core";
import { useReducedMotion } from "watchpot/kit";
import { createRuntimeHooks, type StoreState, useGameRuntime } from "watchpot/react";
import {
  compose,
  IGN,
  OKLAB,
  ShaderCanvas,
  UV,
  uniformDecls,
  useShaderTokens,
  VORONOI,
} from "watchpot/shader";
import { createSound } from "watchpot/sound";
import { burnerPrice, game } from "./simmer/game-wallet";

/** Chapter 2's store line, over Simmer as chapter 4 left it. */
export const store = createIdleStore(game, { now: Date.now });

const { useGameStore, useGameState } = createRuntimeHooks<typeof store>();
type State = StoreState<typeof store>;

// -------------------------------------------------------------------------------------------------------------
// The warmth: a game number turned into 0..1

/** The income at which the pot is as warm as it gets: a thousand bubbles a second. */
const HOT_RATE = 1000;

/**
 * How warm the pot is, 0..1: bubbles a second on a log scale up to `HOT_RATE`, in steps of a hundredth. The steps
 * matter: a selector that returns this re-renders the backdrop at most a hundred times over a whole run.
 */
export function warmthOf(bubblesPerSecond: number): number {
  const t = Math.log10(bubblesPerSecond + 1) / Math.log10(HOT_RATE);
  return Math.round(Math.min(1, Math.max(0, t)) * 100) / 100;
}

/** The selector the page hands `useGameState`: the stove's own rate (heat included) as warmth, cold while it is off. */
export const potWarmth = (s: State): number => warmthOf(s.stove.off ? 0 : s.stove.perSecond.toNumber());

// -------------------------------------------------------------------------------------------------------------
// The fragment

/**
 * The pot from above. Water mixed toward the flame colour from the bottom edge, the glow reaching higher as the pot
 * warms; bubbles (Voronoi cells) rising through it, faster and more of them the warmer it is. Opaque, so there is
 * no alpha to premultiply. Every colour is a uniform read from a CSS token: there is no colour in the GLSL.
 */
export const POT = compose(
  UV,
  VORONOI,
  OKLAB,
  IGN,
  uniformDecls({ u_water: "vec4", u_flame: "vec4", u_foam: "vec4", u_warmth: "float" }),
  `
void main() {
  vec2 uv = screenUv();
  float glow = 1.0 - smoothstep(0.0, 0.3 + 0.5 * u_warmth, uv.y);
  vec2 p = vec2(uv.x * u_resolution.x / u_resolution.y, uv.y) * 8.0;
  p.y -= u_time * (0.2 + 1.3 * u_warmth);
  vec3 cells = voronoi(p);
  float bubble = (1.0 - smoothstep(0.08, 0.12, cells.x)) * step(1.0 - u_warmth, cells.z);
  vec3 colour = oklabMix(u_water.rgb, u_flame.rgb, glow * (0.25 + 0.75 * u_warmth));
  colour = mix(colour, u_foam.rgb, 0.6 * bubble);
  colour += (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(colour, 1.0);
}
`,
);

// -------------------------------------------------------------------------------------------------------------
// The backdrop

/** The tokens the fragment's colours come from. The page's stylesheet defines them (and redefines them per scheme). */
const TOKENS = ["--pot-water", "--pot-flame", "--pot-foam"] as const;

/** The same idea in CSS, for when there is no WebGL2 or the fragment fails to compile. */
const STILL = "linear-gradient(to top, var(--pot-flame), var(--pot-water) 45%)";

const BEHIND: CSSProperties = { position: "fixed", inset: 0, zIndex: -1 };
const FILL: CSSProperties = { display: "block", width: "100%", height: "100%" };

/** The pot behind Simmer's page, as warm as `warmth` (0..1) says. */
export function PotBackdrop({ warmth }: { warmth: number }) {
  const scope = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const palette = useShaderTokens(scope, TOKENS);
  const still = <div style={{ ...FILL, background: STILL }} />;
  return (
    <div ref={scope} style={BEHIND} aria-hidden="true">
      {palette ? (
        <ShaderCanvas
          fragment={POT}
          uniforms={{
            u_water: palette["--pot-water"],
            u_flame: palette["--pot-flame"],
            u_foam: palette["--pot-foam"],
            u_warmth: warmth,
          }}
          reduced={reduced}
          reducedTime={4}
          fps={30}
          maxPixels={500_000}
          still={still}
          onError={(log) => console.warn(`[pot] ${log}`)}
          style={FILL}
        />
      ) : (
        still
      )}
    </div>
  );
}

// -------------------------------------------------------------------------------------------------------------
// The sound

/**
 * Simmer's sounds: zzfx voices only (numbers that describe a synthesised sound), so nothing is downloaded. `tap` is
 * a short rising blip, a bubble breaking the surface; `burner` is a soft whoosh of noise with a low note under it.
 */
export const sound = createSound({
  cues: {
    tap: {
      bus: "ui",
      voices: [
        { voice: { frequency: 620, slide: 2, attack: 0.002, sustain: 0.01, release: 0.06, wave: "sine" } },
      ],
      vary: { cents: 60, db: 1 },
      cooldownMs: 45,
    },
    burner: {
      bus: "ui",
      voices: [
        { voice: { wave: "noise", volume: 0.5, attack: 0.02, sustain: 0.05, release: 0.25, filter: -1200 } },
        { voice: { frequency: 180, attack: 0.01, sustain: 0.05, release: 0.2, wave: "triangle" }, at: 0.03 },
      ],
    },
  },
});

/** Named cue functions: a screen calls these and never spells a key. */
export const playTap = () => sound.play("tap");
export const playBurner = () => sound.play("burner");

// -------------------------------------------------------------------------------------------------------------
// Simmer's page, with both

/** The pot's button: the tap, then its blip. */
function Pot() {
  const game = useGameStore();
  const bubbles = useGameState((s) => s.wallet.bubbles);
  return (
    <section>
      <h1>{fmt(bubbles).text} bubbles</h1>
      <button
        type="button"
        onClick={() => {
          game.getState().pot.tap();
          playTap();
        }}
      >
        Tap the pot
      </button>
    </section>
  );
}

/** The stove's button: the whoosh plays only when a burner was actually lit. */
function Stove() {
  const game = useGameStore();
  const burners = useGameState((s) => s.stove.burners);
  const price = burnerPrice(burners);
  const canAfford = useGameState((s) => s.wallet.bubbles.gte(price));
  const light = () => {
    if (game.getState().stove.buyBurner()) playBurner();
  };
  return (
    <button type="button" disabled={!canAfford} onClick={light}>
      Light a burner for {fmt(price).text} bubbles
    </button>
  );
}

/**
 * The page. `useGameRuntime` replaces chapter 2's `useGameClock`: the same clock, plus the motion and scheme
 * settings (the operating system's, left out here) and the sound's unlock on the first gesture.
 */
export function App() {
  const warmth = useGameState(potWarmth);
  useGameRuntime(store, { sound: { engine: sound, on: true } });
  return (
    <main>
      <PotBackdrop warmth={warmth} />
      <Pot />
      <Stove />
    </main>
  );
}
