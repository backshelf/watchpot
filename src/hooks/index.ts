// The hooks entry: `watchpot/react` without the game shell, the dev panel or the runtime, for a game that draws its
// own page. Nothing here reaches the kit or a stylesheet (`test/rules/hooks.test.ts`), so a build with no CSS-module
// loader can import it. Every export is the same binding `watchpot/react` has.
export {
  type AwayGain,
  type AwayOptions,
  type AwayReport,
  type AwayReturn,
  awayGains,
  useAwayReport,
  watchAway,
} from "../react/away";
export { type BootMachine, useBoot } from "../react/boot";
export { clockLens, useClockNow, useTickNow, warpClock } from "../react/clock";
export { type GameClockState, useGameClock } from "../react/gameClock";
export { useHotkeys } from "../react/hotkeys";
export {
  type PageLayout,
  PageLayoutProvider,
  usePageLayout,
  usePageLayoutObserver,
  WIDE_AT,
} from "../react/layout";
export { useNews } from "../react/news";
export {
  createPacedView,
  type PaceableStore,
  type PacedView,
  type PacedViewOptions,
  pacedView,
  usePacedState,
} from "../react/paced";
export { usePrefs } from "../react/prefs";
export {
  createSampler,
  frameRate,
  type SampleContext,
  SampleProvider,
  type SampleProviderProps,
  type Sampler,
  type SamplerOptions,
  sameShallow,
  useSample,
  useSampled,
} from "../react/sample";
export {
  createRuntimeHooks,
  IdleStoreContext,
  IdleStoreProvider,
  mountGame,
  type RuntimeHooks,
  type RuntimeHooksOptions,
  type RuntimeStore,
  type StoreState,
  useIdleStore,
} from "../react/store";
export { type LayerSwap, type LayerSwapOptions, useLayerSwap } from "../react/swap";
export { type AwayTitleOptions, claimTabTitle, releaseTabTitle, useAwayTitle } from "../react/tabTitle";
