import { type RefObject, useEffect, useRef, useState } from "react";
import type { ShaderHandle } from "./canvas";

/**
 * What the uniforms are read from: anything with a `read()` of five figures, 0..1. `watchpot/sound`'s `sound.tap`
 * is one; the shader takes the shape, not the sound module.
 */
export interface AudioTap {
  read(): { level: number; bass: number; mid: number; high: number; flux: number };
}

/** The five figures a tap reads. */
export type AudioFigure = "level" | "bass" | "mid" | "high" | "flux";

/** The uniform each figure is written to, where it is not `u_<figure>`. */
export type AudioUniformNames = Partial<Readonly<Record<AudioFigure, string>>>;

const FIGURES: readonly AudioFigure[] = ["level", "bass", "mid", "high", "flux"];
const REDUCED = "(prefers-reduced-motion: reduce)";

/** Whether the page asks for reduced motion, kept current. False where there is no `matchMedia`. */
function usePrefersReduced(): boolean {
  const query = typeof matchMedia === "function" ? matchMedia(REDUCED) : null;
  const [reduced, setReduced] = useState(() => query?.matches ?? false);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const list = matchMedia(REDUCED);
    const change = () => setReduced(list.matches);
    change();
    list.addEventListener?.("change", change);
    return () => list.removeEventListener?.("change", change);
  }, []);
  return reduced;
}

/**
 * Feeds a tap to a shader canvas: `u_level`, `u_bass`, `u_mid`, `u_high` and `u_flux` (or the names given), each
 * animation frame through the handle's `setUniforms`, so nothing renders. Under reduced motion (the page's
 * preference, or `reduced` when the game passes its own setting) it writes zeros once and holds. A null tap reads
 * as silence.
 */
export function useAudioUniforms(
  handle: RefObject<ShaderHandle | null>,
  tap: AudioTap | null | undefined,
  names?: AudioUniformNames,
  reduced?: boolean,
): void {
  const prefers = usePrefersReduced();
  const still = reduced ?? prefers;
  const level = names?.level ?? "u_level";
  const bass = names?.bass ?? "u_bass";
  const mid = names?.mid ?? "u_mid";
  const high = names?.high ?? "u_high";
  const flux = names?.flux ?? "u_flux";
  /** The uniform names zeros were last written under: a held still is written once, a remount included. */
  const zeroed = useRef<string | null>(null);

  useEffect(() => {
    const uniform = { level, bass, mid, high, flux };
    const write = (values: Record<AudioFigure, number> | null) => {
      const out: Record<string, number> = {};
      for (const f of FIGURES) {
        const v = values?.[f] ?? 0;
        out[uniform[f]] = Number.isFinite(v) ? v : 0;
      }
      handle.current?.setUniforms(out);
    };
    if (still || !tap) {
      const key = [level, bass, mid, high, flux].join();
      if (zeroed.current !== key) write(null);
      zeroed.current = key;
      return;
    }
    zeroed.current = null;
    let frame = 0;
    const tick = () => {
      write(tap.read());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [handle, tap, still, level, bass, mid, high, flux]);
}
