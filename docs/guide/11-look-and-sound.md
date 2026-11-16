# Look and sound

CSS gets a page most of the way to looking like a game. The rest is light that moves and sounds that answer you, and
this chapter is your first one of each. By the end Simmer's pot will glow behind the page, warmer as the burners
add up, and every tap and every burner will make a sound. You will also know which of the deeper pages to open next,
and which you can leave shut for now.

Everything here is in one file: `docs/examples/guide-look-and-sound.tsx`. It imports Simmer as chapter 4 left it
(`docs/examples/simmer/game-wallet.ts`), makes chapter 2's store over it, and adds a backdrop, a sound table and a
page that uses both.

## Why a shader, and what one is

A [shader](../glossary.md#shader) is a small program that runs on the graphics card. The kind you will write here is a
[fragment shader](../glossary.md#fragment-shader): the card runs it once for every pixel of a canvas, every frame, and
all it does is answer one question, "what colour is this pixel?". It is written in GLSL, a C-like language the
browser hands to the graphics driver to compile.

That sounds like a lot of machinery for a background. The reason to bother is that a shader can be driven by your
game's numbers. A CSS gradient is fixed; a shader that reads "how warm is the pot" turns a number the player earned
into something they see out of the corner of their eye. The game sets numbers, the shader turns them into weather.

The numbers a shader reads are called [uniforms](../glossary.md#uniform): values that are the same for every pixel of
one frame (so "uniform" across the canvas), set from your JavaScript. The pot's warmth will be one.

`watchpot/shader` is the container for your GLSL. It owns the canvas, the WebGL2 context, the frame loop, the
fallback when there is no WebGL, reduced motion and the pixel budget. What it draws is your fragment, and nothing
else: the engine ships no look.

## The pot's warmth, a number from 0 to 1

A shader wants small, tidy numbers. "1,240 bubbles a second" is not one; "0.6 of the way to as warm as it gets" is.
So the first job is a function that turns the stove's income into a warmth between 0 and 1:

<!-- example-code: guide-look-and-sound.tsx -->

```tsx
/** The income at which the pot is as warm as it gets: a thousand bubbles a second. */
const HOT_RATE = 1000;

export function warmthOf(bubblesPerSecond: number): number {
  const t = Math.log10(bubblesPerSecond + 1) / Math.log10(HOT_RATE);
  return Math.round(Math.min(1, Math.max(0, t)) * 100) / 100;
}

/** The selector the page hands `useGameState`: the stove's own rate (heat included) as warmth, cold while it is off. */
export const potWarmth = (s: State): number => warmthOf(s.stove.off ? 0 : s.stove.perSecond.toNumber());
```
<sub>`docs/examples/guide-look-and-sound.tsx`</sub>

Line by line:

- **A log scale.** Idle numbers grow by powers of ten, so the warmth follows the number of digits, not the number.
  The pot warms as quickly from 10 to 100 bubbles a second as from 100 to 1,000.
- **Clamped.** Past `HOT_RATE` the warmth stays at 1. A shader fed 3.7 where it expects at most 1 draws nonsense.
- **Rounded to a hundredth.** This one matters for React, not for the picture. `useGameState(potWarmth)` re-renders
  the component whenever the selector's answer changes. Simmer's stove rate moves only when a burner is lit or the lid
  or the switch is touched, but most games' incomes move every tick, and a raw float would then be a new answer every
  tick. A warmth in steps of 0.01 can change at most a hundred times over a whole run. The selector also returns a
  plain number, never a fresh object or Decimal: the store compares answers by identity, so a new object every tick is
  a new answer every tick.

The selector reads `s.stove.perSecond`, the stove's own rate with the heat (the lid and all) already in it, and reads zero
while the switch is off: a stove that is off is a cold pot. `State` is the store's type.

## The fragment

Here is the pot from above: water lit from below by the burners, bubbles rising through it.

<!-- example-code: guide-look-and-sound.tsx -->

```tsx
export const POT = compose(
  UV,
  VORONOI,
  OKLAB,
  IGN,
  uniformDecls({ u_water: "vec4", u_flame: "vec4", u_foam: "vec4", u_warmth: "float" }),
  `
void main() {
  vec2 uv = screenUv();
  float glow = 1.0 - smoothstep(0.0, 0.3 + 0.5 * u_warmth, uv.y);
  vec2 p = vec2(uv.x * u_resolution.x / u_resolution.y, uv.y) * 8.0;
  p.y -= u_time * (0.2 + 1.3 * u_warmth);
  vec3 cells = voronoi(p);
  float bubble = (1.0 - smoothstep(0.08, 0.12, cells.x)) * step(1.0 - u_warmth, cells.z);
  vec3 colour = oklabMix(u_water.rgb, u_flame.rgb, glow * (0.25 + 0.75 * u_warmth));
  colour = mix(colour, u_foam.rgb, 0.6 * bubble);
  colour += (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(colour, 1.0);
}
`,
);
```
<sub>`docs/examples/guide-look-and-sound.tsx`</sub>

The TypeScript around the GLSL first:

- **`compose(...)`** builds the fragment's source as one string. You do not write the first lines of a fragment
  yourself: the engine puts `SHADER_HEAD` before everything you pass, which sets the GLSL version and declares the
  uniforms every canvas has (`u_time` in seconds, `u_resolution` in pixels, `u_pixelRatio`, `u_pointer`) and the
  output, `fragColor`.
- **`UV`, `VORONOI`, `OKLAB`, `IGN`** are chunks: small GLSL libraries the engine ships. `UV` gives `screenUv()`
  (0 to 1 across the canvas), `VORONOI` gives cellular noise, `OKLAB` gives `oklabMix` (a colour mix without the
  muddy middle), `IGN` gives a dither. `compose` puts each chunk in once, after the chunks it needs.
- **`uniformDecls`** writes the `uniform vec4 u_water;` lines for you, from the same names you will pass in React.
  Three colours as `vec4` and the warmth as a `float`.

Then the GLSL, which runs per pixel:

- `glow` is 1 at the bottom edge, fading out upward. The fade reaches higher as `u_warmth` rises: the burner's light
  climbing the pot.
- `p` is the pixel's position in a grid eight cells high, corrected for the canvas's shape, and slid down over time.
  Sliding the grid down makes what is drawn on it rise, faster as the pot warms.
- `voronoi(p)` returns the distance to the nearest of a scatter of points, and an id for that point. Close to a
  point is a bubble. `step(1.0 - u_warmth, cells.z)` keeps only the points whose id is above `1 - warmth`: a cold pot
  shows almost none, a warm one shows nearly all.
- The colour mixes water toward flame by the glow, then lays foam over the bubbles.
- The last line before the output adds a speck of dither, less than one step of colour, so a smooth gradient does not
  break into visible bands.
- `fragColor` is opaque (`1.0` alpha). If you ever draw something see-through, multiply the colour by its alpha
  first: the canvas is premultiplied, and an unmultiplied colour comes out too bright at its edges.

Notice what is missing: there is no colour in the GLSL. Every colour is a uniform. That is the next part.

## The backdrop

<!-- example-code: guide-look-and-sound.tsx -->

```tsx
const TOKENS = ["--pot-water", "--pot-flame", "--pot-foam"] as const;

const STILL = "linear-gradient(to top, var(--pot-flame), var(--pot-water) 45%)";

// ...

export function PotBackdrop({ warmth }: { warmth: number }) {
  const scope = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const palette = useShaderTokens(scope, TOKENS);
  const still = <div style={{ ...FILL, background: STILL }} />;
  return (
    <div ref={scope} style={BEHIND} aria-hidden="true">
      {palette ? (
        <ShaderCanvas
          fragment={POT}
          uniforms={{
            u_water: palette["--pot-water"],
            u_flame: palette["--pot-flame"],
            u_foam: palette["--pot-foam"],
            u_warmth: warmth,
          }}
          reduced={reduced}
          reducedTime={4}
          fps={30}
          maxPixels={500_000}
          still={still}
          onError={(log) => console.warn(`[pot] ${log}`)}
          style={FILL}
        />
      ) : (
        still
      )}
    </div>
  );
}
```
<sub>`docs/examples/guide-look-and-sound.tsx` (`BEHIND` fixes the wrapper behind the page; `FILL` sizes a child to it)</sub>

Each prop is one of the things a backdrop has to get right.

**Colours from tokens.** `useShaderTokens(scope, TOKENS)` reads three CSS custom properties at the wrapper and hands
them back as `#rrggbbaa` strings, which a uniform takes as a `vec4` directly. Your stylesheet defines them, beside
the page's other [tokens](../glossary.md#token) ([chapter 10](10-the-page.md)):

```css
:root {
  --pot-water: oklch(0.32 0.05 230);
  --pot-flame: oklch(0.7 0.19 45);
  --pot-foam: oklch(0.92 0.02 220);
}
```

Because the colours live in CSS, a theme or a colour-scheme switch recolours the shader with no code: the hook reads
again when `data-theme`, `data-scheme`, a class or a style changes on the element or above it. Until every name reads
as a colour the hook returns `null`, and the component shows the still instead. In a development build it also
names, on the console, each token that has no value at that element, once per mount.

**A still.** The `still` prop is what renders in the canvas's place when there is no WebGL2, or when your fragment
fails to compile. Make it [a CSS version of the same idea](../glossary.md#still), so a player on an old machine sees
a warm gradient rather than nothing. Here it is the same flame-to-water fade, from the same tokens.

**Reduced motion.** `reduced` is the player's [reduced-motion](../glossary.md#reduced-motion) setting: the operating
system's, or the game's own once the runtime has written it. Under it the canvas draws one frame, at `reducedTime`
seconds of its clock, and holds it. Choose a time that looks good frozen; here, four seconds in, when a few bubbles
are already on their way up.

**The pixel budget.** A fragment runs once per pixel per frame, so its cost is pixels times frames. `maxPixels` caps
the area drawn (past it the canvas draws at a lower pixel ratio and lets CSS scale it up), and `fps` caps the frames.
A backdrop is soft and slow-moving, so half a million pixels at 30 frames a second loses nothing you would notice.
The canvas also stops drawing, and its clock stops, while it is off screen or the tab is hidden.

**Errors.** `onError` hears why there is no shader: "WebGL2 is unavailable", or the driver's compile log with its
line numbers moved to your own code. A line in what you passed `compose` after the chunks reads `main:N`, counted from
the first of those lines (here the uniform declarations, then a blank line, then `main`); a line inside a chunk keeps
its number in the whole string, and one in the engine's head reads `head:N`. Log it. Without this, a typo in the GLSL
looks exactly like a machine without WebGL: you see the still and nothing else.

**`aria-hidden`.** The canvas is decoration, and the engine marks it so. The wrapper here says the same for the still.

## Putting it behind Simmer

Simmer's page from chapter 2 started its clock with `useGameClock(store)`. Swap that for `useGameRuntime`, which
starts the same clock and also writes the motion and colour-scheme settings and unlocks the sound (you will need that
in a moment). Then read the warmth and draw the backdrop first, so it sits behind everything else:

<!-- example-code: guide-look-and-sound.tsx -->

```tsx
export function App() {
  const warmth = useGameState(potWarmth);
  useGameRuntime(store, { sound: { engine: sound, on: true } });
  return (
    <main>
      <PotBackdrop warmth={warmth} />
      <Pot />
      <Stove />
    </main>
  );
}
```
<sub>`docs/examples/guide-look-and-sound.tsx`</sub>

Left out, `motion` and `scheme` follow the player's operating system. A real game reads them from settings the
player can change, as [chapter 10](10-the-page.md) shows.

When a burner is lit, the stove's `perSecond` goes up, `potWarmth` returns a new number, `App` re-renders, and
`ShaderCanvas` draws its next frame with the new `u_warmth`. It compares a render's uniforms by value, so a render that passes the
same numbers in a fresh object draws nothing extra.

### Values that change every frame

`u_warmth` changes a few times a minute, so passing it as a prop is right. A value that changes every frame (a flash
fading out, a position following the pointer) should not go through React at all. A `ref` on the canvas gives you a
`ShaderHandle`, and its `setUniforms({ u_pulse: 0.4 })` pushes values straight to the card with no render. A value
pushed that way stays until it is pushed again; a later render's `uniforms` replaces only the names it passes.

The engine has a ready-made one of these: `createPulse(decayMs, now)` is a number that jumps to 1 on `bump()` and
falls back to 0, and `usePulseUniform(handleRef, pulse)` feeds it to the canvas as `u_pulse` a frame at a time. You
will see it in the real game below.

## How a shader is checked

Your tests run on happy-dom, a fake browser with no graphics card. It cannot compile GLSL. Under it `ShaderCanvas`
finds no WebGL2 and renders the still, so a component test can tell you the still and the wrapper are there, and
nothing about the fragment.

The engine's own shader tests stop at the same line. They check the wiring against a stand-in WebGL that records
calls (which uniforms were set, that a failed compile shows the still), and they read the GLSL chunks as text (each
chunk's dependencies are declared, no two define the same function). None of them compiles a fragment.

So a shader is checked in a browser, by looking:

1. Run the game's dev server and open the page. The backdrop should be moving, not the still.
2. Open the console. A clean console means the fragment compiled; a `[pot]` warning carries the driver's error at
   your fragment's line number.
3. Change the warmth (light a few burners, put the lid on, switch the stove off) and watch it respond.
4. Turn on reduced motion in the operating system and reload: one held frame.
5. Flip the colour scheme: the colours should follow.

Two development helpers make this repeatable. A handle's `pin(seconds)` holds that canvas at one instant of its clock
until `pin(null)`, and `pinShaderClock(seconds)` does the same for every canvas on the page, so a screenshot comes out
the same every time. Expose `pinShaderClock` on the console in a development build.

The game this guide follows writes the rule down plainly: a shader counts only once it has drawn in a browser with a
clean console.

## The real game: shaders as its material

VOID IF REMOVED treats shaders as what the game is made of, not as decoration added at the end. Its fiction is a
thermal label printer, and every surface is drawn the way such a printer lays down a picture: a dot at a time, a tone
as a pattern of dots, rows that slip when the paper misfeeds. Each surface is its own file in `src/shaders/`, and each
is the same three things:

```ts
/**
 * A surface: its fragment (GLSL ES 3.00 after the engine's `SHADER_HEAD`), the CSS still shown without WebGL2 or
 * when the fragment fails, and the frame it holds under reduced motion. Its palette is tokens read by
 * `useShaderTokens` (so a scheme change recolours it; never a hex in the GLSL).
 */
export interface Surface {
  fragment: string;
  /** A CSS `background` of the same idea, from the tokens. */
  still: string;
  /** The clock it holds under reduced motion (seconds): a frame that looks good frozen. */
  reducedTime: number;
}
```
<sub>VOID IF REMOVED, `src/shaders/surface.ts`</sub>

That is the same checklist you just worked through for the pot, written as a type, so no surface can be added without
a still and a frozen frame. The game wrote its own because it is on engine 0.17; the current engine ships the shape as
`ShaderSurface` from `watchpot/shader` (`fragment`, `still`, `reducedTime` and `kinds`), and since `ShaderCanvas`
takes every field of it, a surface spreads straight onto the canvas: `<ShaderCanvas {...HEAD} uniforms={…} />`.

### The press surface

The first thing a player touches is the FEED pad, the button that prints labels. The pad is a shader: the printer's
heating element seen from the paper's side, glowing from dark to red to white as the head's heat rises.

```tsx
export function Pad({ chute }: { chute: ReactNode }) {
  const store = useGameStore();
  const heatLevel = useGameState((g) => g.heat.level);
  // ...
  const reduced = useReducedMotion();
  // ...
  const shader = useRef<ShaderHandle>(null);
  const palette = useShaderTokens(wrap, TOKENS);
  const [pulse] = useState(() => createPulse(520, () => performance.now()));
  usePulseUniform(shader, pulse);
  const heat = Math.min(1, heatLevel / HEAT.max);
```
<sub>VOID IF REMOVED, `src/screens/FeedPad.tsx`</sub>

The heat is a gauge in the game's state, turned into 0 to 1 the same way you turned Simmer's stove into warmth. The
pulse is the flash of a press. When the player presses, the sound and the light go out in the same call:

```tsx
    const off = store.subscribe((g, prev) => {
      if (g.press.clicks <= prev.press.clicks) return;
      const clean = g.press.crits > prev.press.crits;
      // The case knocks with the pad's own pulse, in the same call as the press: never late, motion or not.
      head.press(clean ? 1 : 0.8);
      if (prefersReduced()) return;
      // ...
      shader.current?.setUniforms({ u_at: [at.x, at.y] });
      pulse.bump(clean ? 1 : 0.8);
      // ...
    });
```
<sub>VOID IF REMOVED, `src/screens/FeedPad.tsx`</sub>

`u_at` (where the press landed) goes through the handle, with no render. A lucky "clean print" bumps the pulse
harder. The sound plays before the reduced-motion check, because a player who turned motion off still wants to hear
the press. And the canvas itself carries everything from the pot's backdrop:

```tsx
          <ShaderCanvas
            ref={shader}
            className={s.canvas}
            fragment={HEAD.fragment}
            uniforms={{
              u_hot: palette["--hot"],
              u_lit: palette["--canary"],
              u_ink: palette["--on-loud"],
              u_paper: palette["--blank"],
              u_heat: Math.round(heat * 50) / 50,
              u_run: running ? 1 : 0,
              u_boost: boost ? 1 : 0,
            }}
            kinds={{ u_at: "vec2" }}
            paused={heat < 0.01 && !running && !boost}
            reduced={reduced}
            reducedTime={HEAD.reducedTime}
            dpr={1 / HEAD_DOT}
            maxPixels={90_000}
            still={still}
            onError={(log) => console.warn(`[head] ${log}`)}
          />
```
<sub>VOID IF REMOVED, `src/screens/FeedPad.tsx`</sub>

Three things here go past the pot. `kinds={{ u_at: "vec2" }}` states the type of a uniform that is
only ever pushed through the handle, rather than leaving the canvas to infer it from the first push. `paused` holds
the pad still while it is cold and idle, so it costs nothing until the player is using it. And `dpr={1 / HEAD_DOT}` draws one pixel for every
two CSS pixels on purpose: each drawn pixel is one dot of the printhead, so the coarse grid is the look, and it is
also cheap.

### The backdrop

Behind the page sits the backing sheet the labels are peeled from, printed by the same head, a dot at a time. It
reacts to the run's heat, to every press (a ring spreads out from where it landed), and to a misfeed: while a loose
label is waiting to be caught, the printed rows slip sideways.

```tsx
        <ShaderCanvas
          ref={shader}
          className={s.canvas}
          fragment={LINER.fragment}
          uniforms={{
            u_ground: palette["--ui-ground"],
            u_ink: palette["--ui-mark"],
            u_hot: palette["--hot"],
            u_heat: Math.round(heat * 50) / 50,
          }}
          paused
          dpr={1 / LINER_DOT}
          maxPixels={1_000_000}
          still={still}
          onError={(log) => console.warn(`[liner] ${log}`)}
        />
```
<sub>VOID IF REMOVED, `src/app/Backdrop.tsx`</sub>

This canvas is always `paused`. Its frames come from `useSteppedFrame` instead, which calls a function of yours at
most `fps` times a second and pushes the uniforms it returns through the handle:

```tsx
  useSteppedFrame(shader, frame, {
    fps: FPS,
    ready: shown,
    running: moving,
    at: reduced ? LINER.reducedTime : undefined,
    pin: () => forced.at,
  });
```
<sub>VOID IF REMOVED, `src/app/Backdrop.tsx`</sub>

`FPS` is 20, because a printer steps; a smooth 60 would look wrong as well as cost three times as much. The `frame`
function works out the eased, per-frame values (the press ring's age, the misfeed's slip as `u_skew: loose ? 1 : 0`)
and returns them. On a phone the game makes no canvas for the backdrop at all: a narrow screen shows almost none of
it, so it is not worth a graphics context.

Reach for `useSteppedFrame` when a surface works its uniforms out a frame at a time. The pot does not need it.

## Sound, the smallest correct form

A sound is a [cue](../glossary.md#cue): a name you play, and what it sounds like. `createSound` takes a table of cues
and returns the game's sound:

<!-- example-code: guide-look-and-sound.tsx -->

```tsx
export const sound = createSound({
  cues: {
    tap: {
      bus: "ui",
      voices: [
        { voice: { frequency: 620, slide: 2, attack: 0.002, sustain: 0.01, release: 0.06, wave: "sine" } },
      ],
      vary: { cents: 60, db: 1 },
      cooldownMs: 45,
    },
    burner: {
      bus: "ui",
      voices: [
        { voice: { wave: "noise", volume: 0.5, attack: 0.02, sustain: 0.05, release: 0.25, filter: -1200 } },
        { voice: { frequency: 180, attack: 0.01, sustain: 0.05, release: 0.2, wave: "triangle" }, at: 0.03 },
      ],
    },
  },
});

/** Named cue functions: a screen calls these and never spells a key. */
export const playTap = () => sound.play("tap");
export const playBurner = () => sound.play("burner");
```
<sub>`docs/examples/guide-look-and-sound.tsx`</sub>

- **`voices`** are [zzfx voices](../glossary.md#zzfx-voice): a synthesised sound described by numbers (a wave, a
  pitch in Hz, an envelope in seconds). Nothing is downloaded, so these work from the first line of code, once your
  game has the `zzfx` package installed (an optional peer: only a game that imports `watchpot/sound` needs it).
  `tap` is a short sine blip whose pitch slides up, a bubble breaking the surface. `burner` layers two voices: a puff
  of filtered noise, and a low note 30 milliseconds later.
- **`bus: "ui"`** says which channel of the mix the cue plays on. Five exist already (`sfx`, `ui`, `music`,
  `ambience`, `voice`); you can leave this out and get `sfx`.
- **`vary`** makes each play a little different: up to 60 cents of pitch and 1 dB of level either way. A tap you hear
  two hundred times should not sound like a recording of itself.
- **`cooldownMs`** is the [governor](../glossary.md#governor)'s, below.
- **Named functions.** `playTap()` reads better at the call site than `sound.play("tap")`, and a renamed key breaks
  in one place.

Then play them where the action happens:

<!-- example-code: guide-look-and-sound.tsx -->

```tsx
      <button
        type="button"
        onClick={() => {
          game.getState().pot.tap();
          playTap();
        }}
      >
        Tap the pot
      </button>
```
<sub>`docs/examples/guide-look-and-sound.tsx`</sub>

For the burner, play the whoosh only when one was actually lit. `buyBurner` returns whether it bought, so the
stove's button plays on that:

<!-- example-code: guide-look-and-sound.tsx -->

```tsx
  const light = () => {
    if (game.getState().stove.buyBurner()) playBurner();
  };
```
<sub>`docs/examples/guide-look-and-sound.tsx`</sub>

**The gate.** Browsers start audio suspended until the player does something: a click, a key. Nothing plays before
that. Passing `sound: { engine: sound, on }` to `useGameRuntime`, as Simmer's `App` does, arms the unlock on the first
gesture and mutes the sound whenever `on` is false. Without the runtime, call `sound.armUnlock()` once at boot. Until
the unlock, `play` returns `null` and nothing queues, so the very first tap may be silent: it is the one that wakes
the audio.

### The governor

An idle game can ask for more sound than an ear can take: a hundred buys in one "buy max", a player drumming on the
pot. The governor sits between `play` and the speakers and decides what actually sounds. Without being told anything
it turns a repeating cue down a little each time (to 9 dB quieter at most) and drops a quiet sound buried under a much
louder one. You give it two more tools per cue:

- **`cooldownMs`**: a play less than this long after the cue last sounded is skipped. The tap's 45 ms lets about
  twenty taps a second through, which no hand beats, and stops an autoclicker from turning into a buzz.
- **`roll: { above }`**: past `above` plays a second the cue stops retriggering and becomes one sustained sound that
  rises with the rate, then goes back to single plays when the rate falls. Use it for a flood you want heard as a
  flood.

There is also `play(key, { mine: true })`: the player's own hand did it. Such a play is never skipped and never
rolled, and repetition turns it down 3 dB at most. In the mix it plays as written; the plays you mark `mine: false`
(the machine's) are the ones moved back, 6 dB down with 6 dB more of their first send, unless `presence` in `createSound` says otherwise. That
sounds right for a tap, but read the trap below before you use it there.

### Where recordings come in

zzfx voices get a game to "nothing is met with silence". When you want real recorded sounds, a cue also takes
`takes`: recordings from a [pack](../glossary.md#pack), one picked per play. You keep the `voices` beside them; they
play until the pack has loaded, and wherever it cannot. A pack is built at build time from a folder of audio files by
`buildPack` (from `watchpot/sound/pack`, a separate entry that never ships in your bundle), which evens out loudness,
trims silence and writes a manifest you import. That is a job for later, and [sound-packs](../sound-packs.md) walks
through it.

### The real game's sound

VOID IF REMOVED goes a long way past this. Its press is not a cue at all but a modelled instrument (the plastic case
of the printer, knocked by every press), and it has its own buses, scenes, a score and a saved mix. Its sound is
still made by the same one call:

```ts
export const sound = createSound<CueKey | BedKey, string, OwnBus>({
  mix,
  cues,
  samples: CLIPS,
  packs: PACKS,
  volume: 0.3,
  buses,
  scenes,
  routes,
  presence,
});
// A pack that will not load leaves its cues on their synth voices; nothing to tell the player.
for (const name of AT_UNLOCK) sound.loadPack(name).catch(() => {});
```
<sub>VOID IF REMOVED, `src/app/sound/engine.ts`</sub>

The three type parameters are the cue keys, the old clip names, and the buses the game adds to the five defaults;
Simmer's call infers all three. And the comment under it is the pattern from the previous section: recordings when
they load, the synth voices when they do not, and the player never told.

### Which sound page you need

The sound has five pages on the reference shelf. You do not need them in order.

| You want to | Read |
| --- | --- |
| Add cues, give them recordings, pitch one up a ladder, tune the governor | [sound-table](../sound-table.md), first |
| Use recorded sounds: turn a folder of downloads into a pack | [sound-packs](../sound-packs.md) |
| Balance levels, add reverb, duck one bus under another, place a sound where it happened on screen | [sound-mix](../sound-mix.md) |
| Play music that changes section on the bar, keep pitched cues in key, run step sequences | [sound-music](../sound-music.md) |
| Make sound from numbers: grains over a sample, a held freeze, babbling voices, a motor or a bell with no recording, and read the master's loudness back to draw with | [sound-dsp](../sound-dsp.md) |

Most games need the first two. The mix comes next when two sounds fight. Music and the instruments are for a game
whose sound is part of its identity.

## The reveal, in one paragraph

If your game opens boxes, packs or chests, the moment the contents turn over is a small piece of theatre with a lot of
timing in it: the lid, the deal, one face per tap, a rare one charging up before it turns, and a way to skip.
`useRevealSequence` from `watchpot/kit` runs that sequence and draws nothing. You give it the ladder of rarities and
the items, and it tells you which phase you are in, which card holds the centre, and calls you back at each moment so
you can play the sound and the flash. Read [reveal](../reveal.md) and its example, alongside [gacha](../gacha.md) for
the roll that decides what is in the box.

## 3D, in one paragraph

`watchpot/three` is for a game whose page is a 3D scene. It is everything around the scene that is not the scene: a
`Stage` canvas on three.js's WebGPU renderer (falling back to WebGL2), quality tiers, the frame loop, post-processing,
a boot that compiles every shader before the first frame, camera poses and glides, and HTML labels pinned to points
in the world. Materials there are written in TSL, three.js's node language, not GLSL, so nothing in this chapter's
fragment carries over. `three` and `@react-three/fiber` are optional: install them only in a game that imports
`watchpot/three`. Read [three](../three.md); most idle games never need it, and a 2D shader backdrop gets you most of
the depth for far less.

## Things that bite

- **Missing tokens mean the still, forever.** If one of the names you pass `useShaderTokens` is not defined as a
  colour in your CSS, the hook returns `null` and you get the still. A development build names the missing ones on the
  console; a production build says nothing. When a backdrop "never starts", read the console first.
- **A compile error looks like no WebGL.** Both show the still. Only `onError` tells them apart, which is why every
  canvas should log it.
- **A uniform's value that is not rounded re-renders every tick.** Round or step a uniform's value in the selector. The canvas
  ignores a render whose uniforms are equal by value, but React still re-renders the component for every new number.
- **Every `ShaderCanvas` is its own WebGL context, and browsers keep about sixteen.** Past that the browser starts
  losing them. One canvas for a backdrop and one for a hero surface is fine; for a shine on every card, use a
  `ShaderPool` with `ShaderTile`s, which share one context ([shader](../shader.md), "Budget").
- **`smoothstep` with its edges reversed is undefined in GLSL.** `smoothstep(0.1, 0.0, x)` works on most cards and
  not on all. Write `1.0 - smoothstep(0.0, 0.1, x)`, as the pot does.
- **`mine: true` turns most of the governor off for that play, `cooldownMs` included.** The player's own plays are
  never skipped and never rolled; only the repetition still turns them down, 3 dB at most. If you mark the tap `mine`, its cooldown stops applying, and an autoclicker is a buzz
  again. Keep `mine` for actions that cannot flood, or leave the cue that floods unmarked.
- **The first gesture is spent unlocking.** `play` returns `null` before the unlock, so the first tap of a session can
  be silent. Do not build anything that depends on the first sound being heard.
- **happy-dom proves nothing about GLSL.** A green test suite says the still renders. Only a browser says the fragment
  compiles.

## Next

[Chapter 12, Proving the pacing](12-proving-the-pacing.md): the sim lab, and how to show that your game's numbers
arrive when you meant them to without playing it for a week.

## Reference

- [shader](../shader.md): every use of a shader in a 2D game, the chunk table, colour from tokens, when it cannot
  run, and the budget. Its example, `docs/examples/shader.tsx`, has four complete fragments.
- [sound-table](../sound-table.md), then [sound-packs](../sound-packs.md), [sound-mix](../sound-mix.md),
  [sound-music](../sound-music.md) and [sound-dsp](../sound-dsp.md), by the table above.
- [feel](../feel.md) for answering a press where it happened and rationing the machine's celebrations.
- [reveal](../reveal.md), [gacha](../gacha.md), [three](../three.md).
- `api/shader/canvas.d.ts`: `ShaderCanvas`, `ShaderCanvasProps`, `ShaderSurface`, `ShaderHandle`, `pinShaderClock`,
  `shaderClockPin`.
- `api/shader/glsl.d.ts`: `compose`, `chunk` and every chunk. `api/shader/head.d.ts`: `SHADER_HEAD`, `fixLog`.
- `api/shader/uniforms.d.ts`: `uniformDecls`, `Uniforms`, `UniformKind`. `api/shader/tokens.d.ts`: `useShaderTokens`.
- `api/shader/pulse.d.ts`: `createPulse`, `usePulseUniform`. `api/shader/stepped.d.ts`: `useSteppedFrame`.
- `api/shader/pool.d.ts`: `ShaderPool`, `ShaderTile`.
- `api/sound/engine.d.ts`: `createSound`. `api/sound/types.d.ts`: `Cue`, `PlayOptions`, `Sound`, `SoundOptions`.
  `api/sound/voice.d.ts`: `Voice`, `Layer`. `api/sound/governor.d.ts`: what the governor decides.
- `api/react/runtime.d.ts`: `useGameRuntime`, `usePageRuntime`, `RuntimeSound`.
- `api/kit/fx/motion.d.ts`: `useReducedMotion`. `api/kit/reveal/`: `useRevealSequence`. `api/three/`.
