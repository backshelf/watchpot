// Places pinned labels each frame, inside the stage: after whatever moves the camera (the rig runs at 0), so a label
// never trails the picture by a frame during a glide.
import { useFrame } from "@react-three/fiber";
import { type LabelBoard, labels } from "./labels";

/** What `<LabelProjector>` takes. */
export interface LabelProjectorProps {
  /** The board to place. Default: the shared one `pinLabel` writes to. */
  readonly board?: LabelBoard;
  /** The `useFrame` priority: above everything that moves the camera, below the stage's 1. Default 0.6. */
  readonly priority?: number;
}

/** Projects a label board each frame. Mount inside the stage; the labels' elements live in the DOM over it. */
export function LabelProjector({ board = labels, priority = 0.6 }: LabelProjectorProps): null {
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld();
    board.project(camera, size.width, size.height);
  }, priority);
  return null;
}
