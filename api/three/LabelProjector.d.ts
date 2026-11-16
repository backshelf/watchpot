import { type LabelBoard } from "./labels";
/** What `<LabelProjector>` takes. */
export interface LabelProjectorProps {
    /** The board to place. Default: the shared one `pinLabel` writes to. */
    readonly board?: LabelBoard;
    /** The `useFrame` priority: above everything that moves the camera, below the stage's 1. Default 0.6. */
    readonly priority?: number;
}
/** Projects a label board each frame. Mount inside the stage; the labels' elements live in the DOM over it. */
export declare function LabelProjector({ board, priority }: LabelProjectorProps): null;
