# Shaders

A fragment shader is the cheapest way to make an idle game look expensive: forty lines of GLSL replace an
illustrator, never repeat, and can be driven by the game's own numbers. Every game made with this skill is built
around a shader language of its own, in 2D as much as 3D. The engine gives the container (`watchpot/shader`); the
look is written fresh for each game, here, by you.

Read `node_modules/watchpot/docs/shader.md` and `docs/examples/shader.tsx` once per game: the API is small
(`ShaderCanvas`, `ShaderPool` + `ShaderTile`, `useShaderTokens`, `compose`, `uniformDecls`, the chunk library, and the
drivers below). `examples/shader-surface.tsx` here is one whole surface in the shape this file asks for.

## The floor

A finished game has, at the least:

1. **A backdrop that is the place.** One `ShaderCanvas` behind the page: the sea, the static, the kiln, the vacuum.
   Not a gradient with noise on it: the fiction's room, moving slowly.
2. **A hero surface.** The one thing the player looks at (what is pressed, what grows, what the moment happens to)
   is a shader or sits in one: an ember that brightens with income, a dial's phosphor, a tide line that rises.
3. **Light as feedback.** At least one state the player cares about shows as light, not a colour swap: the buy that
   has become affordable glows, a crit rings out, a full gauge shimmers.
4. **The moment.** The game's one memorable moment (the interview's `look.moment`) uses a shader transition or a
   uniform driven to its extreme: the backdrop changes character, not just a modal opening.

The scaffold's backdrop fragment (`src/shaders/<base>.ts`) is a placeholder chosen by `look.surface`. Shipping it
unchanged is a failed build.

## Where shaders go in a 2D game

| Surface | How | Budget |
| --- | --- | --- |
| The backdrop | one `ShaderCanvas`, fixed behind the shell | `maxPixels` 1,000,000 |
| The hero | a `ShaderCanvas` in the main screen, sized to its box | 300,000 to 600,000 |
| Materials: panels, cards, tiles, an achievement wall's earned tiles | `ShaderTile` each, inside one `ShaderPool` at the app root | 60,000 to 120,000 each; `maxLive` 12 |
| Feedback: affordable glow, purchase ripple, crit flash | a `ShaderTile` behind the control, `paused` until it is live | small |
| Transitions: prestige, a tab change, the moment | a full-page `ShaderCanvas` given `time={progress}`, mounted only while it plays | 1,000,000 |
| Data as picture: a progress bar that is a liquid, a gauge that is heat haze | a `ShaderTile` whose uniform is the value | small |

One `ShaderCanvas` is one WebGL context and browsers keep about sixteen: big surfaces get a canvas each, everything
small shares the pool. A slow surface that only reads `u_time` takes `fps` (a backdrop at 20 frames a second costs a
third of one at 60).

## Driving it from the game

The point of a shader in an idle game is that it knows the numbers. Design three to five uniforms, all 0..1, and feed
every shader in the game from the same few:

- **`u_heat`**: how well the run is going. `log10(perSecond + 1) / log10(lateGameRate)`, clamped. The backdrop
  thickens, speeds up, warms. Read the rate off the state (a derived value or a `select`), through `useSampled` or a
  selector that returns a number, never a fresh object.
- **`u_pulse`**: an envelope that jumps to 1 on an event (a buy, a crit, a catch) and decays to 0 over half a second.
  Rings, flashes, a breath. The engine has it: `createPulse(decayMs, now)` is the envelope, `pulse.bump()` the event,
  and `usePulseUniform(handleRef, pulse)` feeds it to a canvas a frame at a time with no render.
- **`u_progress`**: how far through the thing on screen (to the next unlock, through the prestige bar).
- **`u_depth`** or **`u_tier`**: which act of the game this is (prestige count, the layer open): the palette shifts,
  a new octave of detail appears. Late game should not look like the first minute.
- **The palette**: `useShaderTokens(ref, ["--ui-ground", "--ui-ink", "--ui-accent"])`, never hex literals, so a theme
  or a scheme change recolours every shader at once. (The signal colour of the interview is `--ui-accent`.) The
  scaffold's backdrops all declare `u_ground`, `u_ink`, `u_accent` and `u_heat` (`BACKDROP_UNIFORMS`): keep those names
  and add the game's own beside them.

Values that change on a purchase go in the `uniforms` prop (pushed only when they change by value). Values that move
every frame (an envelope, a pointer-follow, an eased value) go through the `ref` handle's `setUniforms`, or, for a
surface that works its uniforms out a frame at a time, `useSteppedFrame(handleRef, frame, { fps })` on a `paused`
canvas: no React render per frame. A value that eases over seconds is `createRamp` in `watchpot/core` (a smoothstep
from where it is to a new target), and a surface's own time that slows or speeds up smoothly is `createPaceClock`
(a clock whose scale ramps); the sound can drive a surface too (`useAudioUniforms` with the engine's tap: `u_level`,
`u_bass`, `u_mid`, `u_high`, `u_flux`).

## Technique to mood

Pick the two or three techniques the fiction wants and build everything from them; a game that uses all of them
looks like a shader demo, and a game that uses one consistently looks art-directed.

| The fiction feels like | Chunks | Notes |
| --- | --- | --- |
| Weather, water, smoke, growth | `FBM`, `DOMAIN_WARP`, `GRADIENT_NOISE` | warp amount and time scale are the mood; 4 to 5 octaves |
| Print, paper, old media, cheapness as style | `BAYER`, `HALFTONE`, `GRAIN` | two or three ink colours from the tokens, an ordered dither between them |
| A one-bit device, a dot printer, a dying display | `MOSAIC`, `DOT_SCREENS`, `RASTER_FAULTS` | sample the field flat across a coarse cell, turn tone into a dot level; dead columns and slipped rows are the faults |
| Broadcast, terminals, instruments | `SCANLINES`, `CRT_CURVE`, `CHROMATIC`, `GLOW` | keep the curve subtle; glow is light from something, never an outline |
| Glass, crystal, glaze, cells, cracked earth | `VORONOI` | `voronoi(p).y - .x` is the edge; the cell id seeds per-cell colour |
| Foil, oil, pearl, anything precious | `PALETTE` (`cosinePalette`), `ROTATE` | band angle from tilt or pointer; a sparkle on Voronoi cells |
| Neon, signage, vector displays, dials | `SDF`, `SDF_OPS`, `GLOW`, `POLAR` | shapes as distance fields, light as falloff |
| Pattern, textile, wallpaper, bureaucracy | `TILE`, `ROTATE`, `SDF` | a motif in a cell, repeated; vary by cell hash |
| Night, cinema, memory | `VIGNETTE`, `GRAIN`, `IGN` | on top of anything; the last 5% |

## Writing one

1. **Say it in a sentence first**: "ink blooming through wet paper, faster as the presses run". If the sentence is
   "animated gradient", think again.
2. **Build in layers, in this order**: a field (noise, distance, pattern) → a shape (thresholds, masks) → colour
   (`oklabMix` between tokens along the field; never raw RGB lerps, they go muddy) → light (glow, rim, a ring on
   `u_pulse`) → finish (vignette, grain, and `interleavedGradientNoise` dither on the last line: an 8-bit gradient
   bands without it).
3. **Slow is expensive-looking.** Time scales of 0.03 to 0.2. Fast motion behind numbers is noise.
4. **Premultiplied alpha**: a transparent surface multiplies its colour by its alpha.
5. **Forty lines or so.** `compose(...chunks, uniformDecls({...}), main)`; the fragment lives in the game's
   `src/shaders/`, one file per surface, each with a one-line comment saying what it is in the fiction.
6. **Keep text off it.** Words sit on panels above the backdrop; keep the backdrop's brightness range narrow where
   text can overlap it, and check contrast on the brightest frame.

## What every surface must have

- **`still`**: a CSS gradient of the same idea (the canvas takes it as a node; the scaffold's backdrop wraps it in a
  div), shown when WebGL2 is missing or the fragment fails. Write it the moment you write the fragment.
- **`reduced`**: the game's reduced-motion setting (`useReducedMotion` from `watchpot/kit`). The canvas draws one frame
  (`reducedTime`) and holds; choose a frame that looks good frozen.
- **`onError`** logged in development: the driver's message comes back at your fragment's own line numbers
  (`main:N` counted from where your code starts).
- A budget (`maxPixels`), and nothing animating off screen (the container handles that; do not defeat it with a
  hidden always-mounted canvas).

## Proving it

happy-dom cannot compile GLSL: a fragment with a syntax error passes every test and shows the `still`. So:

- Look. Serve the game (`bun run dev`), open each screen, and confirm no `still` is showing and the console has no
  shader log. A screenshot per surface, at desktop and phone width. To compare one instant, pin the clock:
  `pinShaderClock(seconds)` holds every canvas's `u_time` (a canvas's own handle has `pin`); expose it on the console
  in a development build, and pin the moment's own timeline too, since only `u_time` is the engine's.
- In a development build, make `onError` throw or log loudly so a broken fragment cannot hide.
- No unit tests on fragment text: they cost a gate run each time and prove nothing the browser does not.

## 3D

A 3D game is on `watchpot/three` (three's WebGPU renderer and TSL node materials; `docs/three.md`,
`docs/examples/three-stage.tsx`): there is no GLSL there, and `watchpot/shader` is for its 2D surfaces only (a HUD
backdrop, a menu). The same thinking applies: the post stack and the materials are driven by the game's numbers
through uniforms, built once and varied, and the TSL chunk library (`triplanar`, `boxProjection`, `bumpNormal`,
`fresnel`, `bayer4`) is where a material starts.

## What goes wrong

- **The default backdrop, recoloured.** The player has seen it in the last game.
- **A shader as decoration.** If removing it changes nothing about how the game reads, it is in the wrong place:
  move the effort to the hero surface or to feedback.
- **Hex colours in GLSL.** The theme switch then leaves the shader behind.
- **One canvas per card.** Sixteen contexts, then the seventeenth is black. Use the pool.
- **A render per frame.** A value that moves every frame goes through the handle, not through state.
- **A vendor shader component.** The engine ships no look on purpose: the look must be the game's.
- **Copying another game's fragment.** Start from the sentence, not from the last file.
