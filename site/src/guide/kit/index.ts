// Everything a guide page is written with. A page file imports from here and nowhere else in the kit.
export { CodeBox } from "./codebox";
export { useExample, useSnapshot, useView } from "./context";
export { Controls } from "./controls";
export { ExamplePage } from "./example-page";
export { AgainstCopy, Breakdown, type BreakdownRow, PriceCurve, SliceFields } from "./figures";
export { choice, definePage, type PageDef, slider, stepper } from "./page";
export {
  Act,
  Actions,
  Away,
  ClockSwitch,
  CodeName,
  figure,
  Panel,
  PanelChoice,
  Readout,
  Readouts,
  Reload,
  SaveText,
  Shortcut,
  StartOver,
  StateTree,
  Value,
} from "./panel";
export { Code, Note, Term, Try } from "./prose";
export { SaveStrip, TickLength, TickStrip } from "./timeline";
