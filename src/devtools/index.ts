// `watchpot/devtools`, the dev-only UI: the dev panel and the sound desk, with the stylesheets they carry. A game
// imports it only in its dev build; `watchpot/react` reaches no stylesheet. The two references below teach a
// consumer's typecheck what a CSS-module import is, so a game adds nothing to its tsconfig.
/// <reference path="../../env.d.ts" />
/// <reference path="../css-vars.d.ts" />
export { DevPanel, type DevPanelProps } from "./gate";
export { type DeskSwitch, openSoundDesk, type SoundDeskOptions } from "./SoundDesk";
export { type FetchSampleHostOptions, fetchSampleHost } from "./sampleHost";
