# The getting-started pages

The first part of the guide, as interactive pages: one idea a page, a real game on the engine running beside the
words, controls that change the example's code and the game with it, and (on a few pages) a code box the reader types
in. The plan of every page is [`OUTLINE.md`](OUTLINE.md); this file is how to write one.

## How a page is made

```
pages/NN-slug.tsx   a page: one `definePage({...})`, default-exported (NN is its number in OUTLINE.md)
kit/                what pages are written with (import from "../kit" only)
OUTLINE.md          the sequence: each `## N. Title` is a step; the build reads it for titles and the progress strip
data.ts, source.ts  build side: pieces of an example by name, listings, controls' tokens, modules as JavaScript
prerender.tsx       draws every page to HTML at build time (in a process of its own, so a rebuild reads pages afresh)
build.ts            bundles one script per page and the code box's worker, writes `docs/start/NN-slug.html`
```

At build time each page is drawn to HTML inside the docs' own shell (contents, masthead, scheme switch), with the data
it needs beside it as JSON: its listings (quoted from the example files and highlighted), its glossary words (only the
ones it uses), and the example's modules as JavaScript. In the browser the page's script hydrates that HTML and starts
the game. Pages are listed in the contents under "Getting started" as soon as their file exists; a step of the outline
with no file yet is a dashed cell in the progress strip.

## A page, annotated

```tsx
import { fmt, type StateOf } from "watchpot/core";
// (1) The example's types only: `import type` runs nothing, so the example's own store is never made here.
import type * as Simmer from "../../../../docs/examples/simmer/game";
import { Act, Code, Controls, definePage, Panel, Readout, slider, Term, Try } from "../kit";

type S = StateOf<typeof Simmer.game.features>;

export default definePage({
  title: "Time moves: the tick", // (2) must equal its heading in OUTLINE.md (a test checks)
  idea: <>Ten times a second the engine runs every feature's steps for the time that passed.</>,
  // (3) The game the panel runs: an example file, run as it is (its `game`, or the store it makes). `keep` is where
  //     the game lives between visits: "local" (this browser), "memory" (this visit) or "fresh" (every rebuild).
  game: { file: "simmer/game.ts", keep: "local", clock: true },
  // (4) A control is a token in the example: in piece `at`, the unique text `find`, the `token` inside it. Moving it
  //     re-runs the example with the new value, and every listing that shows the token shows the value, marked.
  params: {
    rate: slider({
      at: "SIMMER_PER_SECOND",
      find: "= 1",
      token: "1",
      min: 0,
      max: 20,
      step: 1,
      label: "Bubbles a second",
    }),
  },
  // (5) Listings, by piece name: a top-level symbol, `symbol > key` inside it, or `*` for the file. Never lines.
  code: { simmer: { at: "pot > steps" }, rate: { at: "SIMMER_PER_SECOND" } },
  // (6) The panel: the live game. Readouts select from the state (return a string or number, never a new object).
  Panel: () => (
    <Panel title="The pot">
      <Readout<S> big label="Bubbles" select={(s) => fmt(s.pot.bubbles).text} />
      <Act call="pot.tap">Tap the pot</Act>
    </Panel>
  ),
  // (7) The words. A glossary word is <Term id="tick">, its id the entry's anchor in docs/glossary.md.
  Body: () => (
    <>
      <p>
        Ten times a second the engine runs a <Term id="tick">tick</Term>.
      </p>
      <Code id="rate" />
      <Controls />
      <Try>
        <li>Slide the rate to 10.</li>
      </Try>
    </>
  ),
});
```

## The kit

- **Words.** `Term` (a glossary word: hover, focus or tap shows its one sentence; the word links to the full entry),
  `Code` (a listing from `code`), `Controls` (the page's controls, or `names` of some), `Try` (a numbered "try it"),
  `Note` (a set-apart note). Plain HTML elsewhere: `<p>`, `<h2>`, `<code>`, and `<pre className="guide-snippet">` for
  code the reader is told to type (not in an example; prove it in `site/test/guide.test.ts` as page 3's is).
- **Controls.** `slider`, `stepper` (numbers: `min`, `max`, `step`, `unit`, and `code` to write the value; `log` for
  a slider over powers of ten, kept to `digits` figures; a token inside quotes, `D("1.52e6")`, is a number too),
  `choice` (expressions put where the token was; two choices draw as a switch, more as a row; an option's `run` is
  what runs when its shown `code` is not an expression, as `// useGameClock(store)` runs `undefined`). A control's
  token may sit in another example file the game imports: give it `file`.
- **Panel.** `Panel`, `Readouts` / `Readout`, `Value` (a figure inside a button's words), `Actions` / `Act` (an action
  by its path, `ready` lights it when the game would take it), `ClockSwitch`, `Away` (send the reader away for a
  while; `measure` says what to count, `week` stretches it to a week), `SaveText` (`open`), `StateTree` (`only` some
  slices), `StartOver`, `Reload` (a new store reads the save, as a reload does).
- **Time on a strip.** `TickStrip` (each tick of the last three seconds, as tall as what it paid, and what that comes
  to a second), `TickLength` (how often the page's clock ticks), `SaveStrip` (each change to the state, and each
  write of the save).
- **An example's own page.** A page whose example is a React file (`game.file: "simmer/main.tsx"`) passes the
  packages it imports as `game.externals` (`react`, `react/jsx-runtime`, `watchpot/react`); `<ExamplePage />` draws
  what its `mountGame` call was handed, under its store, and says in plain words why it stopped if a component
  throws. With `game.clock: "example"` the page starts no clock of its own: the example's `useGameClock` runs it,
  pays for time away when it mounts, and lights the panel's lamp.
- **An example that is not a game.** `game.store: false`: the example's modules run (with the controls' values) and
  no store is made; the panel calls its functions with `useExample()`.
- **Hooks.** `useView(select)` for anything else from the state; `useExample<typeof Example>()` for the example's
  exported helpers (`burnerPrice`), run from the same modules as the game, or `useExample(file)` for another module
  it loaded.
- **Code box.** `game.edit: { at, trial }` and `<CodeBox />` in the body. The reader's version of piece `at` runs in a
  worker: it is transpiled there (sucrase: types stripped, no type checking), run against the real engine, played for a
  second and has each `trial` action pressed once, and only then replaces the running game. A syntax error, a throw or
  a loop that never ends is stopped and said in plain words, and the last version that worked keeps running. A page
  with a code box has no `params`.

## Rules for a page

- One idea, said in `idea`. Plain word first, the engine's word once, with its `Term`. No word the reader has not met:
  check the outline's "Words" for what earlier pages introduced.
- Every listing comes from an example by piece name. If the page needs code no example has, add it to the example (it
  is type-checked and tested there), not to the page.
- A glossary word whose entry is too long or jargon-heavy for a popup gets an `**In short:**` line in
  `docs/glossary.md` (the glossary's opening says how).
- The look is `site/DESIGN.md`'s. The live tone is for the panel's running things and a control's changed value only.
- Gates: `bun test site` (it checks every page's pieces, tokens and terms against the files) and a look in a browser
  (`bun site/dev.ts`; `bun site/tools/shot.ts <url> <out.png> [w] [h] [dpr] [dark] [full]`).

## Splitting the remaining pages between writers

Each page is its own file, and its name is its number, so two writers never touch the same page. What they share:
`OUTLINE.md` (only to correct their own entries), `kit/` (add a component only if two pages need it; one writer owns
kit changes in a round), `docs/glossary.md` (each adds the "In short" lines for the words their pages introduce), and
the examples, which belong to whoever reworks them.
