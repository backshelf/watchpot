// The perf harness: `?perf=WxH` renders at that internal size whatever the window, plays a measured stretch after a
// warm-up, then logs `perf p50=… p95=… ms` (frame to frame, CPU clock) and the GPU time when the adapter reports it.
import type { WebGPURenderer } from "three/webgpu";

/** The internal size a perf run renders at, in device pixels. */
export interface PerfSize {
  readonly width: number;
  readonly height: number;
}

/** The size `?<param>=WxH` asks for in `search`, or null when it is absent or malformed. */
export function parsePerfSize(search: string, param = "perf"): PerfSize | null {
  const raw = new URLSearchParams(search).get(param);
  if (!raw) return null;
  const m = /^(\d{3,5})x(\d{3,5})$/i.exec(raw.trim());
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

/** The CSS box that fits the run's aspect inside the window, and the DPR that makes it exactly WxH inside. */
export function fitPerf(
  size: PerfSize,
  windowWidth: number,
  windowHeight: number,
): { width: number; height: number; dpr: number } {
  const scale = Math.min(windowWidth / size.width, windowHeight / size.height);
  const width = Math.floor(size.width * scale);
  const height = Math.floor(size.height * scale);
  return { width, height, dpr: size.width / width };
}

/** The `p` quantile (0..1) of an ascending list, by nearest rank; NaN for an empty one. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i] ?? Number.NaN;
}

/** What a run measured, in milliseconds. */
export interface PerfReport {
  readonly frames: number;
  readonly frame: { p50: number; p95: number };
  readonly cpu: { p50: number; p95: number };
  /** Null when the adapter reports no GPU time. */
  readonly gpu: { p50: number; p95: number } | null;
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
export class PerfRun {
  private readonly frames: number[] = [];
  private readonly cpu: number[] = [];
  private readonly gpu: number[] = [];
  private last = -1;
  private started = -1;
  /** True once the run has reported. */
  done = false;

  constructor(
    private readonly size: PerfSize,
    private readonly options: PerfRunOptions = {},
  ) {}

  /** A rendered frame at `nowMs`, after it was submitted; `cpuMs` is the time spent submitting it. */
  frame(nowMs: number, cpuMs: number): void {
    if (this.done) return;
    if (this.started < 0) this.started = nowMs;
    const elapsed = (nowMs - this.started) / 1000;
    const warmup = this.options.warmup ?? 2;
    const renderer = this.options.renderer;
    if (this.last >= 0 && elapsed >= warmup) {
      this.frames.push(nowMs - this.last);
      this.cpu.push(cpuMs);
      const gpuMs = renderer?.info.render.timestamp;
      if (typeof gpuMs === "number" && gpuMs > 0) this.gpu.push(gpuMs);
      renderer?.resolveTimestampsAsync("render").catch(() => undefined);
    }
    this.last = nowMs;
    if (elapsed >= warmup + (this.options.measure ?? 10)) this.finish();
  }

  private finish(): void {
    this.done = true;
    const sorted = (list: number[]) => [...list].sort((a, b) => a - b);
    const pair = (list: number[]) => {
      const s = sorted(list);
      return { p50: percentile(s, 0.5), p95: percentile(s, 0.95) };
    };
    const report: PerfReport = {
      frames: this.frames.length,
      frame: pair(this.frames),
      cpu: pair(this.cpu),
      gpu: this.gpu.length ? pair(this.gpu) : null,
    };
    const f = (v: number) => (Number.isNaN(v) ? "n/a" : v.toFixed(2));
    const gpuPart = report.gpu ? ` gpu p50=${f(report.gpu.p50)} p95=${f(report.gpu.p95)} ms` : "";
    const label = this.options.label ? ` ${this.options.label}` : "";
    const line =
      `perf p50=${f(report.frame.p50)} p95=${f(report.frame.p95)} ms (frame) ` +
      `cpu p50=${f(report.cpu.p50)} p95=${f(report.cpu.p95)} ms${gpuPart}${label} ` +
      `${this.size.width}x${this.size.height} frames=${report.frames}`;
    if (this.options.report) this.options.report(report, line);
    else console.info(line);
  }
}
