import { type PerfSize } from "./perf";
/** What the address can ask of the stage for one load. */
export interface StageParams {
    /** Run three's WebGL2 backend on a machine that has WebGPU. */
    readonly forceWebGL: boolean;
    /** Compile every shader before the first drawn frame (off: draw at once, to time a load without it). */
    readonly precompile: boolean;
    /** The perf harness's internal size, or null for a normal run. */
    readonly perf: PerfSize | null;
}
/** The address parameters `readStageParams` reads. Defaults `webgl`, `precompile`, `perf`. */
export interface StageParamNames {
    readonly webgl?: string;
    readonly precompile?: string;
    readonly perf?: string;
}
/** The stage params an address query asks for: `?webgl`, `?precompile=0`, `?perf=WxH`. */
export declare function readStageParams(search: string, names?: StageParamNames): StageParams;
