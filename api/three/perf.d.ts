import type { WebGPURenderer } from "three/webgpu";
/** The internal size a perf run renders at, in device pixels. */
export interface PerfSize {
    readonly width: number;
    readonly height: number;
}
/** The size `?<param>=WxH` asks for in `search`, or null when it is absent or malformed. */
export declare function parsePerfSize(search: string, param?: string): PerfSize | null;
/** The CSS box that fits the run's aspect inside the window, and the DPR that makes it exactly WxH inside. */
export declare function fitPerf(size: PerfSize, windowWidth: number, windowHeight: number): {
    width: number;
    height: number;
    dpr: number;
};
/** The `p` quantile (0..1) of an ascending list, by nearest rank; NaN for an empty one. */
export declare function percentile(sorted: readonly number[], p: number): number;
/** What a run measured, in milliseconds. */
export interface PerfReport {
    readonly frames: number;
    readonly frame: {
        p50: number;
        p95: number;
    };
    readonly cpu: {
        p50: number;
        p95: number;
    };
    /** Null when the adapter reports no GPU time. */
    readonly gpu: {
        p50: number;
        p95: number;
    } | null;
}
/** How a run is timed and told. */
export interface PerfRunOptions {
    /** Seconds before measuring. Default 2. */
    readonly warmup?: number;
    /** Seconds measured. Default 10. */
    readonly measure?: number;
    /** Words for the log line: the tier, say. */
    readonly label?: string;
    /** Built with `trackTimestamp: true`, for GPU times; without it only frame times are measured. */
    readonly renderer?: WebGPURenderer | null;
    /** Where the result goes. Default: one `console.info` line. */
    readonly report?: (report: PerfReport, line: string) => void;
}
/** One measured run: call `frame` once per rendered frame; it reports once, then stays done. */
export declare class PerfRun {
    private readonly size;
    private readonly options;
    private readonly frames;
    private readonly cpu;
    private readonly gpu;
    private last;
    private started;
    /** True once the run has reported. */
    done: boolean;
    constructor(size: PerfSize, options?: PerfRunOptions);
    /** A rendered frame at `nowMs`, after it was submitted; `cpuMs` is the time spent submitting it. */
    frame(nowMs: number, cpuMs: number): void;
    private finish;
}
