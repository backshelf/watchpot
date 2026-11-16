// A specimen without its shader (no WebGL2, or a fragment that did not build): the same idea in CSS, in the two inks.
import type { ReactNode } from "react";
import type { StillKind } from "../../shaders/specimens";

export function Still({ kind, children }: { kind: StillKind; children?: ReactNode }) {
  return (
    <span className="slab__still" data-still={kind}>
      {children}
    </span>
  );
}
