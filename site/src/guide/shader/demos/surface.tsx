// The plate every surface on these pages sits in: one ink line, and the still behind the canvas, so the page reads
// before the first frame and stays readable when a canvas cannot run at all. `uniforms` null means the page has not
// read its tokens yet (the build's pass, and the browser's first), so only the still is drawn.
import type { CSSProperties, Ref } from "react";
import { ShaderCanvas, type ShaderHandle, type Uniforms } from "watchpot/shader";

const PLATE: CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
  overflow: "hidden",
  border: "1px solid var(--ink)",
  borderRadius: 2,
};

const FILL: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };

export interface SurfaceProps {
  /** The game's fragment, after `SHADER_HEAD`. */
  fragment: string;
  /** Its uniforms, or null while the page's colours are still unread. */
  uniforms?: Uniforms | null;
  /** The CSS version of the surface, drawn before the first frame and in place of a canvas that fails. */
  still: string;
  reduced?: boolean;
  paused?: boolean;
  maxPixels?: number;
  onError?: (log: string) => void;
  /** The canvas's handle, for a value pushed a frame at a time (a pulse). */
  handleRef?: Ref<ShaderHandle>;
  style?: CSSProperties;
}

/** One surface in its plate. */
export function Surface({
  fragment,
  uniforms,
  still,
  reduced = false,
  paused = false,
  maxPixels = 600_000,
  onError,
  handleRef,
  style,
}: SurfaceProps) {
  return (
    <div style={{ ...PLATE, background: still, ...style }} aria-hidden="true">
      {uniforms === null ? null : (
        <ShaderCanvas
          ref={handleRef}
          fragment={fragment}
          uniforms={uniforms}
          reduced={reduced}
          paused={paused}
          maxPixels={maxPixels}
          onError={onError}
          still={<div style={{ ...FILL, background: still }} />}
          style={FILL}
        />
      )}
    </div>
  );
}
