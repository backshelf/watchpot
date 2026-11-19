# Shaders: the outline

The shaders section: interactive pages on `watchpot/shader` for a reader who wants a look of their own. One idea a
page, on the same terms as getting started: a surface and its fragment shader, the values a game tells it, the pool
that draws many small ones on one context, what happens when a canvas cannot run, and one surface built from blank to
finished. The examples are `shader-*` files of their own, written for the section: typechecked like Simmer's, run by
the page, and quoted by the pages' listings. A page on the 3D stage (`watchpot/three`) is still to come.

**This file is read by the build**: each `## N. Title` heading is a page, in order. A page that exists is
`pages/NN-slug.tsx` and its `title` must match its heading here (a test checks it); a heading with no page yet is
drawn in the progress strip as a step still to come. Keep the headings' form.

Each entry says: the one idea; what the reader does; what they see change; the glossary words it introduces (each
gets its popup on first use; a word not introduced yet is not used); and which example it teaches, named by file and
exported symbol (never by line: the examples are edited in place).

## 1. A surface: the 2D canvas

- **Idea.** A surface is a canvas and a fragment: a small program the graphics card runs for every pixel of every
  frame, answering "what colour is this one?". The engine draws it and hands it the time and the canvas's size; the
  look is the game's GLSL.
- **The reader does.** Watches the contour map drift. Slides the shader's drift from 0 to 0.6. Holds the frame.
- **They see.** The lines stop dead at 0 and race at 0.6, and the number they moved is marked in the listing: it is
  written inside the shader's own text, so every value builds a different fragment and the canvas compiles it again.
  Held, the last frame stays and the clock with it.
- **Words.** shader, fragment shader.
- **Teaches.** `shader-surface.tsx`: `DRIFT` (the control), `SURFACE` (the fragment), `STILL` (its CSS stand-in).
- **Departs from chapter 11's first look** by stopping at one fragment and one canvas: the sound, the tokens and the
  page around it come later in this section.

## 2. Uniforms: what the surface is told

- **Idea.** A uniform is a value the shader reads that is the same for every pixel of a frame. The canvas sets four of
  them itself; a game declares the rest, and sets them from JavaScript without building a new program. Colours come
  the same way, read from the page's design tokens.
- **The reader does.** Slides the heat and how far a transition has run; presses "A big moment"; switches the surface's
  inks between the page's and a game's; switches the page's own scheme in the masthead.
- **They see.** The field warm and cool with heat, the cover dither open and shut with progress, a ring run out and fade
  from one press with no React render, and every colour change with no new shader: the ink switch recolours the
  surface and its plate together, and so does the scheme.
- **Words.** uniform, token.
- **Teaches.** `shader-uniforms.tsx`: `TOKENS`, `UNIFORMS` (`u_heat` and `u_progress`, both controls), `inkUniforms`
  (a token as the `vec4` a colour uniform takes, `#rrggbbaa`), `SURFACE`; the engine's `createPulse` and
  `usePulseUniform`, quoted from `docs/shader.md`.
- **Departs from chapter 11's backdrop** by taking the uniforms one at a time and showing that a colour is one.

## 3. A pool: many surfaces, one budget

- **Idea.** A browser keeps about sixteen live WebGL contexts, and one canvas is one context. A game wants a shimmer on
  every card, so `ShaderPool` draws every `ShaderTile` on one context of its own: only `maxLive` of them animate, the
  newest win, and the rest hold a true frame.
- **The reader does.** Adds surfaces up to sixteen; takes the budget down to one and back to twelve.
- **They see.** The newest tiles move and the older ones stop, at whatever budget is set, and the count of contexts
  stay at one however many there are.
- **Words.** none new.
- **Teaches.** `shader-pool.tsx`: `MAX_LIVE`, `TINTS`, `TILE`, `STILL`, `Album` (the `ShaderPool` and its tiles, as a
  game would write them).
- **Departs from chapter 11** by making the budget a thing to turn rather than a note.

## 4. Still, reduced motion, and the cap

- **Idea.** A canvas does not always run: the machine may have no WebGL2, a fragment may not compile, or the player may
  have asked for less movement. `still` is the CSS version of the surface that takes the canvas's place, `onError` says
  why in the driver's words, `reduced` holds one frame, and `maxPixels` caps what is drawn.
- **The reader does.** Switches the fragment to one with a line broken, and back. Switches reduced motion. Takes the cap
  from a million pixels to a hundred and twenty thousand.
- **They see.** The plate hold its still with the driver's log under it, naming the reader's own line (`main:5:`);
  the surface draw once and hold at four seconds; the surface go soft as the pixel ratio drops to fit the cap.
- **Words.** still, reduced motion.
- **Teaches.** `shader-limits.tsx`: `SURFACE`, `BROKEN` (one argument the wrong type), `STILL`, `Canvas` (every one of
  the props that matter when it cannot run).
- **Departs from chapter 11** by showing the failure rather than describing it.

## 5. A worked surface, blank to finished

- **Idea.** One surface, in the order it is built: a colour, then a field, then the game's inks and numbers, then the
  same fragment in a pool. Every step is the previous fragment with one thing added.
- **The reader does.** Steps the surface from blank to finished in the panel; then slides how deep into the run it is,
  and presses for a big moment on the finished one at the end of the page.
- **They see.** The same plate at each stage: one flat colour, then contour lines, then the page's inks over a warped
  field with a ring on a press, then four small ones beside it at four depths, on one context.
- **Words.** none new.
- **Teaches.** `shader-worked.tsx`: `BLANK`, `FIELD`, `WARM` (the three stages), `UNIFORMS` (`u_heat`, `u_depth`,
  `u_pulse`), `TOKENS`, `inkUniforms`, `STILL`.
- **Ends the section's 2D part.** Next is the 3D stage (`watchpot/three`), still to be written.
