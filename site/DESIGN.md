# Design

The look of the watchpot site, as built. It is the site's own: the engine ships no look, and nothing here is part of
the package. Product facts are in `PRODUCT.md`.

## The world

**The service manual of the machine inside the game.** A game made on the engine is loud printed paperwork; the
engine's own page is the drawing that paperwork's machine was built from. Kin to it (a print process, ink on stock,
tone as screens, captions in small capitals) and deliberately not it: where the game is flat fields of hot colour
and fat thermal dots, this is hairlines at device resolution in one cold ink.

- **Two prints of one drawing.** Light is the _blueline_ (diazo-blue line on cool white stock). Dark is the
  _blueprint_ (pale line on Prussian blue). The reader's system picks; the switch in the masthead overrides it and is
  remembered. Both come from the same tokens (`src/styles/base.css`, `:root` and `:root[data-scheme="dark"]`).
- **One ink.** `--ink` for every line and word, `--ink-soft` for secondary text, `--text-faint` for the faintest
  text (4.5:1 or better), `--ink-faint` and `--rule` / `--rule-strong` for line weights only.
- **One mid-tone, and it means one thing.** `--live` (cyan) marks what is running or can be done _now_: the tick's
  phase on the drawing, a field a shader is drawing, a step sounding, a buy the balance covers, the run being
  plotted. It is never a hover, a link, a focus ring, a selection or decoration. (The shader specimens use it as their
  second ink.)
- **Tone is hatching, never a grey.** What is empty, locked, short or shaded is ruled (`.hatched`, the drawing's side
  faces, the sim's bands). No gradients as decoration, no shadows, no glass.
- **Colour enters only where a game does.** The one sheet that shows a real game shows it in its own colours; the
  rest of the page stays on the blue ramp so that sheet is the only warm thing on it.
- **The inked field.** "How this was made" and the foot are set paper-on-ink: the one place the page raises its
  voice, and it is for the statement.

## Type

Two families, both Omnibus-Type, both SIL OFL, served from the site (`@fontsource-variable/*`, copied at build).

- **Archivo** (variable weight and width). Headings at width 112 to 116, weight 620 to 640, tight. Body at width 100,
  17px, line-height 1.6. **Lettering** (`.lettering`): width 125, small capitals, tracked, for the captions a drawing
  carries (field names, plate titles, part names).
- **Chivo Mono** (`.num`, code): figures, measurements, identifiers and code only. Never running text.

## Shapes

- A **sheet** is a section: a heading and a lede on one line of the grid, the figure, and a **title-block strip**
  (`.tb`) that closes it by naming the entry and linking its recipe.
- A **plate** (`.plate`) is a working figure: one ink line all round, 2px corners, a strip of lettering for its name.
- A **control** is ruled and square; it inverts (ink and stock swap) under the pointer and drops a pixel on a press;
  one that cannot be used is dashed and ruled through, not faded.
- The **drawing's own marks**: leaders with a dot at the part, a centre line up the assembly's axis, a chain line
  for what is not supplied (the look), general notes, a title block with drawn-by and checked-by.

## The drawing (the first viewport)

`src/shaders/assembly.ts`: the engine's entries as an exploded isometric assembly, plotted by a fragment shader on
`watchpot/shader`'s `ShaderCanvas`. Every edge is a distance in device pixels (silhouettes heavier than inner
edges), the side faces are hatched, and each plate carries a small schematic of what it is. The core plate's eight
cells light as the page's own store ticks. The same table of parts drives the GLSL, the labels and leaders laid over
the canvas, and the pointer's pick. Without WebGL2 the same parts are drawn as SVG polygons; under reduced motion it
is drawn already apart.

## Motion

One authored moment: the assembly comes apart as the page arrives (1.5s, ease-out), then its leaders and labels fade
in. Everything else is 140ms state changes. Reduced motion: no explode, shaders hold a frame, no smooth scrolling.

## Docs (a reading surface)

The frame carries the world (masthead, contents rail, the page's ruled header, listings on sunk stock with a
lettering bar, tables as parts lists, the pager as two ruled cells); the column stays plain: Archivo at 17px, about
67 characters, nothing behind the text. Code is highlighted at build time in the one ink at several strengths.

## A phone

Its own order, not a squeezed desktop: the pitch, then the drawing with names only on its leaders, then the notes and
the title block; plates stack; the parts list sets each system as one run of text; the contents are a drawer (the
engine's own `Dialog` on the landing page).

## Decided against

A dark-only developer page with a code block for a hero; card grids; a display serif; a second accent; any colour
borrowed from the game; a recording where the engine could run.
