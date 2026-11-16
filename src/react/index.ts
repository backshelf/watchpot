// `watchpot/react`, the entry a game's page imports by default: the store hooks, the clock and runtime hooks, the
// dev panel and the sound desk. `watchpot/hooks` is the same hooks without the dev parts, for a build with no
// CSS-module loader; each export there is the same binding as here.
export { SheetOutlet, type SheetOutletProps, type SheetRegistry } from "../ui/page";
export {
  type AwayGain,
  type AwayOptions,
  type AwayReport,
  type AwayReturn,
  awayGains,
  useAwayReport,
  watchAway,
} from "./away";
export { type BootMachine, useBoot } from "./boot";
export { clockLens, useClockNow, useTickNow, warpClock } from "./clock";
export { DevPanel, type DevPanelProps } from "./dev/gate";
export { type DeskSwitch, openSoundDesk, type SoundDeskOptions } from "./dev/SoundDesk";
export { type FetchSampleHostOptions, fetchSampleHost } from "./dev/sampleHost";
export { type GameClockState, useGameClock } from "./gameClock";
export { useHashRoute } from "./hashRoute";
export { useHotkeys } from "./hotkeys";
export { type PageLayout, PageLayoutProvider, usePageLayout, usePageLayoutObserver, WIDE_AT } from "./layout";
export { useNews } from "./news";
export {
  createPacedView,
  type PaceableStore,
  type PacedView,
  type PacedViewOptions,
  pacedView,
  usePacedState,
} from "./paced";
export { usePrefs } from "./prefs";
export {
  type GameRuntime,
  type GameRuntimeOptions,
  type PageRuntime,
  type PageRuntimeOptions,
  type RuntimeSound,
  useGameRuntime,
  usePageRuntime,
} from "./runtime";
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
} from "./sample";
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
  useShallow,
} from "./store";
export { type LayerSwap, type LayerSwapOptions, useLayerSwap } from "./swap";
export { type AwayTitleOptions, claimTabTitle, releaseTabTitle, useAwayTitle } from "./tabTitle";
