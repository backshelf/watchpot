// Compiling shaders ahead of the first draw.
// three builds a shader for the render target and the outputs (MRT) it draws into, so a compile says where the
// object will be drawn (`Destination`). Every compile goes through `compileFor`, never `renderer.compileAsync`
// directly, because of two faults in three r187's `compileAsync`, which works in slices over many tasks:
//   - after every slice it puts the renderer back to the target and outputs it was called with, so those stay set
//     for the frames drawn meanwhile (three issue #35327). The destination is held here until the compile settles,
//     as three's own `PassNode.compileAsync` holds it (setting it only round the call leaves the renderer on the
//     compile's target for good), and the stage points the renderer at the canvas at the top of every frame;
//   - two calls in flight at once overwrite each other's state and one rejects (issue #35315). Compiles run one at
//     a time here.
// Searched: three r187's source (`Renderer.compileAsync`, `PassNode.compileAsync`) and its tracker. Both faults are
// fixed upstream by PR #35359, merged after r187. After a bump past r187, check whether the queue and the stage's
// reset can go.
import type { Camera, MRTNode, Object3D, RenderTarget, Scene, WebGPURenderer } from "three/webgpu";

/** Where a pass draws: its render target (null for the canvas) and its outputs (null for colour alone). */
export interface Destination {
  readonly target: RenderTarget | null;
  readonly outputs: MRTNode | null;
}

/** The canvas, colour alone. */
export const CANVAS: Destination = { target: null, outputs: null };

/** The compile in flight, or the last one to settle: the next waits for it. */
let last: Promise<void> = Promise.resolve();

/** Runs `compile` (a call of three's `compileAsync`, under whatever name) once the one before it has settled. */
export function compileInTurn(compile: () => Promise<void>): Promise<void> {
  const done = last.then(compile);
  last = done.catch(() => {});
  return done;
}

/**
 * Compiles `object` as a pass drawing into `to` will draw it, seen from `camera`; when `object` is not the scene
 * itself, `lights` is the scene whose lights it is drawn under. Safe to call while frames draw. Resolves once the
 * pipelines are built; what is compiled is `object` as it stands when its turn comes.
 */
export function compileFor(
  renderer: WebGPURenderer,
  to: Destination,
  object: Object3D,
  camera: Camera,
  lights: Scene | null = null,
): Promise<void> {
  return compileInTurn(async () => {
    const target = renderer.getRenderTarget();
    const outputs = renderer.getMRT();
    renderer.setRenderTarget(to.target);
    renderer.setMRT(to.outputs);
    try {
      await renderer.compileAsync(object, camera, lights);
    } finally {
      renderer.setRenderTarget(target);
      renderer.setMRT(outputs);
    }
  });
}
