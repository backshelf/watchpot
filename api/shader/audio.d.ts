import { type RefObject } from "react";
import type { ShaderHandle } from "./canvas";
/**
 * What the uniforms are read from: anything with a `read()` of five figures, 0..1. `watchpot/sound`'s `sound.tap`
 * is one; the shader takes the shape, not the sound module.
 */
export interface AudioTap {
    read(): {
        level: number;
        bass: number;
        mid: number;
        high: number;
        flux: number;
    };
}
/** The five figures a tap reads. */
export type AudioFigure = "level" | "bass" | "mid" | "high" | "flux";
/** The uniform each figure is written to, where it is not `u_<figure>`. */
export type AudioUniformNames = Partial<Readonly<Record<AudioFigure, string>>>;
/**
 * Feeds a tap to a shader canvas: `u_level`, `u_bass`, `u_mid`, `u_high` and `u_flux` (or the names given), each
 * animation frame through the handle's `setUniforms`, so nothing renders. Under reduced motion (the page's
 * preference, or `reduced` when the game passes its own setting) it writes zeros once and holds. A null tap reads
 * as silence.
 */
export declare function useAudioUniforms(handle: RefObject<ShaderHandle | null>, tap: AudioTap | null | undefined, names?: AudioUniformNames, reduced?: boolean): void;
