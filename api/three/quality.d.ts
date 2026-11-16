import { type Prefs } from "../core/prefs";
import type { StorageBackend } from "../core/storage";
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
export declare const DEFAULT_TIERS: Readonly<Record<DefaultTier, StagePreset>>;
/** A tier store: the chosen tier as a device pref, and the preset it names. */
export interface Quality<P extends StagePreset = StagePreset, N extends string = string> {
    /** The tiers, lowest first. */
    readonly names: readonly N[];
    readonly tiers: Readonly<Record<N, P>>;
    /** The stored choice, under any address override. */
    readonly prefs: Prefs<{
        tier: N;
    }>;
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
export declare function createQuality<P extends StagePreset, N extends string>(def: QualityDef<P, N>): Quality<P, N>;
/** The tier now, in React. */
export declare function useQuality<P extends StagePreset, N extends string>(quality: Quality<P, N>): N;
/** The preset of the tier now, in React. */
export declare function usePreset<P extends StagePreset, N extends string>(quality: Quality<P, N>): P;
