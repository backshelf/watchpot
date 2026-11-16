// Quality tiers: what the renderer spends per frame, as a device pref. A game names its tiers (lowest first) and
// gives each a preset; the stage and the post stack read the fields of `StagePreset`, and a game extends the preset
// with its own (a caustics map size, a shadow map size its lights read). `?quality=<tier>` in the address picks the
// tier a load starts on without touching the saved choice; a tier the player then chooses wins, and is saved.

import { type Prefs, prefs } from "../core/prefs";
import type { StorageBackend } from "../core/storage";
import { usePrefs } from "../react/prefs";

/** What the stage and the post stack read from a tier. */
export interface StagePreset {
  /** Cap on devicePixelRatio. */
  readonly dpr: number;
  /** A shadow map size (square) for the game's lights; the stage does not read it. */
  readonly shadowSize: number;
  /** Indirect light: none, GTAO only, or screen-space GI (AO and one bounce). */
  readonly gi: "off" | "gtao" | "ssgi";
  /** SSGI hemisphere slices and steps per slice (read only when `gi` is "ssgi"). */
  readonly giSlices: number;
  readonly giSteps: number;
  /** God rays from the post's light; 0 is off, else raymarch steps. */
  readonly godraySteps: number;
  /** Depth of field. */
  readonly dof: boolean;
  /** Anti-aliasing: SMAA (one pass, no history) or TRAA (temporal, which SSGI needs to settle). */
  readonly aa: "smaa" | "traa";
  readonly bloom: boolean;
}

/** The four tiers `DEFAULT_TIERS` names, lowest first. */
export type DefaultTier = "low" | "medium" | "high" | "ultra";

/**
 * Four tiers tuned on a WebGPU scene a few metres across: `high` holds p95 at 16.7 ms at 3440×1440 on a current
 * desktop GPU, `ultra` spends past that, `low` is what the WebGL2 fallback runs.
 */
export const DEFAULT_TIERS: Readonly<Record<DefaultTier, StagePreset>> = {
  low: {
    dpr: 1,
    shadowSize: 1024,
    gi: "off",
    giSlices: 0,
    giSteps: 0,
    godraySteps: 0,
    dof: false,
    aa: "smaa",
    bloom: true,
  },
  medium: {
    dpr: 1,
    shadowSize: 2048,
    gi: "gtao",
    giSlices: 0,
    giSteps: 0,
    godraySteps: 32,
    dof: true,
    aa: "smaa",
    bloom: true,
  },
  high: {
    dpr: 1,
    shadowSize: 2048,
    gi: "ssgi",
    giSlices: 3,
    giSteps: 16,
    godraySteps: 48,
    dof: true,
    aa: "traa",
    bloom: true,
  },
  ultra: {
    dpr: 1.5,
    shadowSize: 4096,
    gi: "ssgi",
    giSlices: 4,
    giSteps: 16,
    godraySteps: 64,
    dof: true,
    aa: "traa",
    bloom: true,
  },
};

/** A tier store: the chosen tier as a device pref, and the preset it names. */
export interface Quality<P extends StagePreset = StagePreset, N extends string = string> {
  /** The tiers, lowest first. */
  readonly names: readonly N[];
  readonly tiers: Readonly<Record<N, P>>;
  /** The stored choice, under any address override. */
  readonly prefs: Prefs<{ tier: N }>;
  /** The tier now (the address's, when it names one, until the player chooses another). */
  get(): N;
  /** Chooses and saves a tier. */
  set(tier: N): void;
  /** The preset of the tier now. */
  preset(): P;
  /** The lowest tier: what a fallback backend runs. */
  readonly lowest: N;
  subscribe(listener: () => void): () => void;
}

/** The definition `createQuality` takes. */
export interface QualityDef<P extends StagePreset, N extends string> {
  /** The storage key (`mygame.quality`). */
  readonly key: string;
  /** The presets by tier name, lowest first (insertion order). */
  readonly tiers: Readonly<Record<N, P>>;
  /** The tier on a first run. */
  readonly initial: NoInfer<N>;
  /** The address parameter that names the tier a load starts on; null for none. Default "quality". */
  readonly param?: string | null;
  /** The address query read for the override. Default: the page's own, where there is one. */
  readonly search?: string;
  /** Where the choice is kept. Default localStorage. */
  readonly backend?: StorageBackend | null;
}

/** A tier store over `tiers`. */
export function createQuality<P extends StagePreset, N extends string>(def: QualityDef<P, N>): Quality<P, N> {
  const names = Object.keys(def.tiers) as N[];
  const isTier = (v: unknown): v is N => typeof v === "string" && (names as string[]).includes(v);
  const param = def.param === undefined ? "quality" : def.param;
  const search = def.search ?? (globalThis as { location?: { search?: string } }).location?.search ?? "";
  const asked = param ? new URLSearchParams(search).get(param) : null;
  const store = prefs<{ tier: N }>({
    key: def.key,
    initial: { tier: def.initial },
    backend: def.backend,
    // A bare tier name is how a game may have kept the choice before this store did.
    read: (raw, init) => {
      const tier = typeof raw === "string" ? raw : (raw as { tier?: unknown } | null | undefined)?.tier;
      return { tier: isTier(tier) ? tier : init.tier };
    },
    override: isTier(asked) ? { tier: asked } : undefined,
  });
  return {
    names,
    tiers: def.tiers,
    prefs: store,
    get: () => store.get().tier,
    set: (tier) => {
      if (isTier(tier)) store.set({ tier });
    },
    preset: () => def.tiers[store.get().tier],
    lowest: names[0] as N,
    subscribe: store.subscribe,
  };
}

/** The tier now, in React. */
export function useQuality<P extends StagePreset, N extends string>(quality: Quality<P, N>): N {
  return usePrefs(quality.prefs, (v) => v.tier);
}

/** The preset of the tier now, in React. */
export function usePreset<P extends StagePreset, N extends string>(quality: Quality<P, N>): P {
  return quality.tiers[useQuality(quality)];
}
