# Shaders for feel

`watchpot/shader` runs a game's own fragment shaders well; the look is the game's GLSL. It imports React and nothing
else: no shader package, no kit, no stylesheet.

Example: [`examples/shader.tsx`](examples/shader.tsx) (four complete fragments and the components around them).

## What a 2D game uses them for

- **A backdrop that reacts.** One `ShaderCanvas` behind a screen, its uniforms the screen's state: `u_heat` from the
  run's momentum, `u_pulse` rising to 1 on a big moment and falling back. The game sets numbers; the shader turns them
  into weather. Every uniform is set on every frame drawn, a new value draws a frame at once while the canvas holds
  still, and a `ref` handle's `setUniforms` pushes values without a React render at all (for a value that changes
  every frame).
- **A foil on a card.** A `ShaderTile` per card inside one `ShaderPool`: every card shimmers, one WebGL context draws
  them all, and only the newest `maxLive` animate (the rest hold a true frame).
- **A button that glows** while the buy is affordable: `paused={!ready}` holds it still the rest of the time.
- **Light as feedback.** `createPulse(decayMs, now)` is one number that jumps to 1 on `bump()` and falls back to 0;
  `usePulseUniform(handleRef, pulse)` feeds it to a canvas as `u_pulse` a frame at a time, with no React render.
- **A transition.** Give `time` yourself (the transition's progress) and the canvas draws only when it changes.
- **A surface that moves in steps.** `fps` on a `ShaderCanvas` caps its draws (the clock keeps the display's time):
  enough for a field that only reads `u_time`. A surface that works its uniforms out a frame at a time (a pointer
  eased toward, an event that crosses, a pass that runs once) holds its canvas (`paused`) and runs
  `useSteppedFrame(handleRef, frame, { fps })`: `frame(seconds, dt)` is called at most `fps` times a second and what
  it returns is pushed through the handle, one draw a push and no React render. Its clock counts only while the tab
  shows and never jumps more than a quarter second. `running: false` stops it on the frame `at` (the one chosen for
  reduced motion), pushed again after each render so a held surface still follows its props; `ready: false` waits
  for the canvas to mount.
- **One instant, repeatable (development).** The `ref` handle's `pin(seconds)` holds a canvas's `u_time` at
  `seconds` and draws that frame, over `time`, `reduced` and the clock, until `pin(null)` lets it run on from where it
  was. `pinShaderClock(seconds)` does the same for every `ShaderCanvas` on the page at once (a canvas's own pin wins),
  so a screenshot of the backdrop and the hero at one moment comes out the same every time; expose it on the console
  in a development build. Only `u_time` is the engine's: a moment that drives its own uniforms from its own timeline
  pins that timeline too, and pushes the result through `setUniforms`. `shaderClockPin()` is the page's pin as it
  stands (seconds, or null), for such a timeline to hold the same instant; `useSteppedFrame` reads it already (its
  own `pin` option wins), a running loop at its next step and a stopped one at its next render. `ShaderTile` takes
  `time` for the same.

## Writing a fragment

Every fragment is written after `SHADER_HEAD`, which declares `u_time` (s), `u_resolution` (px), `u_pixelRatio`,
`u_pointer` (0..1 from the bottom-left, with `pointer`) and `out vec4 fragColor`. Declare your own uniforms (or let
`uniformDecls` write them) and write `main`. The canvas is premultiplied: multiply the colour by its alpha.

Build from the chunks in `glsl.ts` with `compose(...chunks, ...code)`: each chunk comes once, after what it depends on.

| Chunk | Gives |
| --- | --- |
| `HASH` | `hash11`, `hash12`, `hash22`, `hash33` |
| `VALUE_NOISE`, `GRADIENT_NOISE`, `SIMPLEX_NOISE` | `valueNoise`, `gradientNoise`, `simplexNoise` |
| `FBM`, `DOMAIN_WARP` | `fbm(p, octaves)`, `domainWarp(p, amount, time)` |
| `VORONOI` | `voronoi(p)`: nearest, second nearest, cell id |
| `BAYER`, `IGN` | `bayer2/4/8`, `interleavedGradientNoise`: dither thresholds |
| `SDF`, `SDF_OPS` | `sdCircle`, `sdBox`, `sdRoundBox`, `sdSegment`, `sdRing`; `opUnion`, `opSmoothUnion`, `opRound`, `opAnnular`, `sdfCoverage` |
| `PALETTE`, `OKLAB` | `cosinePalette`, `hueShift`; `oklabMix` and the conversions |
| `GRAIN`, `VIGNETTE`, `SCANLINES`, `HALFTONE`, `CRT_CURVE`, `CHROMATIC` | the screen treatments |
| `MOSAIC`, `DOT_SCREENS`, `RASTER_FAULTS` | a one-bit raster: `mosaicCell`, `mosaicCentre`; `dotScreen(level, dot)`, `blockScreen(dot, size)`; `deadDot(x, seed, share)`, `rowSkew(row, band, seed)` |
| `GLOW`, `POLAR`, `ROTATE`, `TILE`, `UV`, `MATH` | falloffs, coordinates, `PI`/`TAU` |

```ts
const FOIL = compose(UV, PALETTE, VORONOI, uniformDecls({ u_tint: "vec4", u_angle: "float" }), `
void main() {
  vec2 uv = screenUv();
  float band = dot(uv - 0.5, vec2(cos(u_angle), sin(u_angle))) * 3.0 + u_time * 0.15;
  vec3 foil = cosinePalette(band, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
  vec3 cells = voronoi(uv * 12.0);
  float sparkle = (1.0 - smoothstep(0.0, 0.08, cells.x)) * step(0.85, fract(cells.z + u_time * 0.5));
  float alpha = u_tint.a;
  fragColor = vec4((mix(u_tint.rgb, foil, 0.35) + sparkle) * alpha, alpha);
}`);
```

A picture drawn the way a one-bit device lays it down (a dot printer, a 1-bit display) is three chunks. Sample
the field at `mosaicCentre(p, size)` so it is flat across a coarse cell; turn its tone into a level 0..5 and ask
`dotScreen(level, dot)` whether this dot is on (each level is its own pattern: a sparse grid, a hatch, a checker,
the hatch inverted, solid; two tones side by side read as two textures, not two greys), or `blockScreen(dot, size)`
for one fat dot a cell. `RASTER_FAULTS` are what goes wrong with a row of elements writing the picture a line at a
time: `deadDot(x, seed, share)` is 1 down the columns that have died (an empty line through the whole picture), and
`rowSkew(row, band, seed)` slips a few bands of rows sideways, -1..1, zero for most.

```glsl
vec2 dot = floor(gl_FragCoord.xy / u_pixelRatio);
dot.x += rowSkew(dot.y, 6.0, u_seed) * 3.0 * u_skew;
float tone = field(mosaicCentre(dot, 8.0));
float on = dotScreen(int(tone * 5.0 + 0.5), dot) * (1.0 - deadDot(dot.x, u_seed, 0.01));
```

## Colour from the game's tokens

`useShaderTokens(ref, ["--ground", "--glow"])` reads those custom properties at the element as `#rrggbbaa` (any CSS
colour, `oklch()` included), null until all are colours, and again when `data-theme`, `data-scheme`, a class or a style
changes on it or an ancestor. Pass them straight in: a hex string uniform is a `vec4`. In a development build it names,
once, any of the properties that have no value at its element, which is usually a token the theme forgot.

## When it cannot run

Without WebGL2, or when the fragment fails to compile or link, the canvas renders `still` (a CSS gradient of the same
idea) and `onError` hears why: the driver's log with line numbers moved to your fragment's own lines. When the fragment
is built with `compose`, a line of your own code reads `main:N`, counted from the `// ---- main` line `compose` puts
between the chunks and your code. Under `reduced` (the game's reduced-motion setting) it draws one frame at
`reducedTime` and holds. A lost GPU context is rebuilt on restore.

## Budget

- `maxPixels` caps the drawn area (the pixel ratio drops past it); `dpr` caps the ratio. A full-screen backdrop at a
  million pixels is plenty; a card's foil needs a tenth of that.
- A canvas draws only while it intersects the viewport and the tab is visible. Off screen, its clock stops too.
- Browsers keep about sixteen WebGL contexts. One `ShaderCanvas` is one context: use it for the few big surfaces and a
  `ShaderPool` for everything small. The pool's `maxLive` (default 12) is how many tiles animate at once.
- Drive a value that changes every frame through the `ref` handle's `setUniforms`, not props: no React render. A
  pushed value stays until it is pushed again: a later render's `uniforms` replaces only the names it passes.
- `fps` caps a canvas that does not need the display's rate; a slow backdrop at 20 frames a second costs a third.
