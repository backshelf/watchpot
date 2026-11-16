// What a guide page is: the declaration a page file exports, the controls it declares, and the data the build
// works out for it. A page file declares; the build reads the examples and the glossary; the page draws.
import type { ComponentType, ReactNode } from "react";
import type { Keep } from "./host";
import type { ModuleSet, ParamValue } from "./run";

/** Where a control's value sits in the example: in piece `at`, the unique text `find`, and `token` inside it. */
interface Site {
  /** The piece of the page's game file: a top-level symbol, then ` > key` for an entry inside it. */
  at: string;
  /** Text that occurs once in the piece and holds the token. */
  find: string;
  /** The value's text in `find` (defaults to all of `find`). */
  token?: string;
}

export interface NumberParam extends Site {
  kind: "slider" | "stepper";
  label: string;
  min: number;
  max: number;
  step: number;
  /** A word after the value (`ms`, `bubbles`). */
  unit?: string;
  /** How the value is written in the code (default: the number with the step's decimals). */
  code?: (value: number) => string;
}

export interface ChoiceParam extends Site {
  kind: "choice";
  label: string;
  /**
   * The choices, each an expression put where the token was. One of them must be the example's own text (it is the
   * default); a two-choice param draws as a switch.
   */
  options: readonly { label: string; code: string }[];
}

export type ParamDef = NumberParam | ChoiceParam;

export const slider = (def: Omit<NumberParam, "kind">): NumberParam => ({ kind: "slider", ...def });
export const stepper = (def: Omit<NumberParam, "kind">): NumberParam => ({ kind: "stepper", ...def });
export const choice = (def: Omit<ChoiceParam, "kind">): ChoiceParam => ({ kind: "choice", ...def });

/** A listing on the page: a piece of an example, quoted from the file at build time. */
export interface CodeDef {
  /** The piece: a top-level symbol, ` > key` inside it, or `*` for the whole file. */
  at: string;
  /** The example file, under `docs/examples/` (default: the page's game file). */
  file?: string;
  /** Keys of the piece to fold to `// ...` (`["steps"]`). */
  omit?: readonly string[];
}

export interface GameDef {
  /** The example the page runs, under `docs/examples/`. Its `game` export (or the store it makes) is what plays. */
  file: string;
  /** Where the game is kept between visits (default "local": in this browser, under the page's own name). */
  keep?: Keep;
  /** Whether the clock ticks when the page opens (default true). */
  clock?: boolean;
  /** The clock's interval, ms (default the engine's 100). */
  intervalMs?: number;
  /**
   * A code box: the reader edits this piece of the game file and the game runs their version, in a worker. `trial`
   * names actions pressed once to check a new version before it replaces the running one.
   */
  edit?: { at: string; trial?: readonly string[] };
}

export interface PageDef {
  /** The page's title. It must match its heading in `OUTLINE.md`. */
  title: string;
  /** Under the title: the one idea, in a sentence or two. */
  idea: ReactNode;
  game: GameDef;
  params?: Record<string, ParamDef>;
  code?: Record<string, CodeDef>;
  /** The page's words. Mark glossary terms with `<Term>`, quote code with `<Code>`, put controls with `<Controls>`. */
  Body: ComponentType;
  /** The live panel beside the words: `<Panel>` and what it shows. */
  Panel: ComponentType;
  /** Overrides for the pager's ends, for a page whose neighbour is not a guide page yet. */
  prev?: Link;
  next?: Link;
}

export interface Link {
  href: string;
  title: string;
  /** The word over the title ("Next", or "Continue in the guide"). */
  label?: string;
}

/** Declares a page. The identity: it exists for the types. */
export const definePage = (page: PageDef): PageDef => page;

// ---------------------------------------------------------------------------------------------------------------
// What the build works out for a page, carried to the browser as JSON beside the page's HTML.

/** One run of highlighted text: the text, its colour (an index into the palette), and the control it shows. */
export type Run = [text: string, colour: number, param?: string];

export interface CodeData {
  file: string;
  lang: string;
  lines: Run[][];
  palette: string[];
}

export interface TermData {
  title: string;
  short: string;
  href: string;
}

/** One step of the sequence, for the progress strip and the pager. */
export interface StepData {
  n: number;
  title: string;
  /** The page's address from this page, or null for a step not written yet. */
  href: string | null;
}

export interface EditData {
  /** The piece as the box first shows it, dedented. */
  piece: string;
  before: string;
  after: string;
  indent: number;
  trial: string[];
  /** The worker's script, from this page. */
  worker: string;
}

export interface PageData {
  n: number;
  slug: string;
  steps: StepData[];
  code: Record<string, CodeData>;
  terms: Record<string, TermData>;
  modules: ModuleSet;
  defaults: Record<string, ParamValue>;
  /** The example file the page runs, as a link to its source page. */
  source: { file: string; href: string };
  edit: EditData | null;
  prev: Link | null;
  next: Link | null;
}
