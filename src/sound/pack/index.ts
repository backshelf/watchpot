// `watchpot/sound/pack`: the build-time pack pipeline (Bun only, shells out to ffmpeg, never in a game's bundle).
export { type BuildPackOptions, buildPack } from "./build";
export { FfmpegError, hasFfmpeg } from "./ffmpeg";
export { type SampleHandler, type SampleHostOptions, type SamplePackConfig, sampleHost } from "./host";
export { type FormatHook, manifestSource, type PackOnDisk, readManifest } from "./manifest";
export type { Targets } from "./pipeline";
export {
  type CommitSamplesOptions,
  commitSample,
  commitSamples,
  findOrigin,
  type ProcessedSample,
  type ProcessSampleOptions,
  planRetune,
  processSample,
  type RetunedLoop,
  type RetunePackOptions,
  retunePack,
  type SampleOrigin,
  type SampleWrite,
} from "./sample";
export { isSafeName, keepSource, type Sidecar } from "./source";
