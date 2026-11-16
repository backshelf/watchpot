# watchpot/kit

Effects with no look, the reveal's mechanism, the theme compiler and scenes. [theme](theme.md) and [reveal](reveal.md) have worked examples, and `api/kit/` has every signature.

## Kit

`watchpot/kit` is effects with no look, and the reveal's mechanism: one barrel (`src/kit/index.ts`, `export *` of `fx`
and `reveal`). It ships no CSS file and no class name of its own (the `kit-lookless` import rule and
`test/rules/headless.test.ts`): an effect's element takes the game's `className` and `style`, carries its state in
`data-*`, and sets inline only what it needs to work (a placement, the pointer, the Web Animations API run). Kit code
reads no store and no game module (`kit-props-only`; `kit-core-narrow`: from `watchpot/core` only `fmt`, `decimal`
and `world` names). Its tests are in `test/kit/`.

- **Reduced motion.** `setReducedMotion("system" | "reduced" | "full")` (the runtime calls it from the game's
  setting), `prefersReducedMotion()` (the setting, else the OS), `useReducedMotion()`, `subscribeReducedMotion`,
  `osPrefersReducedMotion`. Every effect below honours it. `hasWebGL()` probes once; `riseIn(show, delay)` is a
  `motion` entrance object for a game that uses `motion/react`.
- **The scheme.** `applyColorScheme(pref)` writes `data-scheme` on `<html>` (live while "system"); `resolveScheme`.
- **Token reads.** `readToken(name, scope?)`, `tokenReader(scope?)`, `readFoil` (the `--foil-1..5` stops),
  `useScopedRead(ref, live, read)` (read again when the element's theme, world or the page's scheme changes),
  `longHex`, `mixHex`, `luminance`: how canvas and WebGL take their colours from the game's tokens.
- **Rarity rungs.** The effects take a rarity as a `RarityTier` (`{ index, count, id, label? }`, `tierOf(ladder,
  id)`), never a name. `tierIntensity` (the rung's height, 0..1), `tierStep(tier, n)` (one of `n` fixed looks),
  `tierRamp(stops, tier)` (a number read off stops), `tierToken` (`--rarity-<id>`), `tierInk` (its `var()`),
  `tierLabel` (its word), `isTopTier`.
- **The ticker.** `Ticker({ mantissa, suffix?, decimals?, animated?, className? })` rolls a live number on
  `@number-flow/react`: throttled to four animations a second (`useThrottledValue`, `throttleDelay`), digits that
  turn faster than the eye set still behind the rolling head (`splitDigits`), keyed by the suffix so a magnitude
  change snaps, still under reduced motion. `Money({ cents })` is real money to the cent. Their face is the game's
  `className`.
- **Shake.** `shake(el, "soft" | "hard")` and `useShake()`: one Web Animations jolt (`shakeKeyframes`, `SHAKE_MS`),
  none under reduced motion.
- **Flash.** `<Flash trigger peak? duration? className? style? />`: a flash over the nearest positioned ancestor each
  time `trigger` changes, its opacity curve run by the Web Animations API (`flashKeyframes`), dimmer and shorter
  under reduced motion; its colour and stacking are the game's class (`[data-flash]`).
- **Flight.** `<FlightHost glyphOf className? glyphClassName? />` once per page and `useFlight()` →
  `fly({ currency, from, count?, glyph? })`: glyphs burst from what was pressed and fall into the currency's
  `[data-pill="<id>"]`, which holds `data-bump` as they land (the bump's keyframes are the game's CSS). The layer is
  `[data-flight-layer]`, each glyph `[data-flight-glyph]` (its size and ink the game's class); reduced motion only
  bumps. `FLIGHT` holds the numbers, `staggerOf` the spacing.
- **Confetti.** `burst(tier, { origin?, canvas?, scope? })`: five presets climbing with the rung (none, a paper puff,
  a burst in the hue, a rain of the hue and `--foil-2`, a storm of the foil stops), colours read from the tokens at
  fire time (`readConfettiColors`, `confettiShots`), nothing under reduced motion; `cents()` is one grey square.
- **Gestures.** `createGestures()` and `useGestures()` tell a person's own press or key from the machine's change in
  the same tick (`active()`, `recent()`), remember where it landed (`point()`, `target()`) and whether something
  answered it (`answer`, `answered`); `pressPoint(e)` and `middleOf(el)`. `docs/feel.md`.
- **The celebration director.** `createDirector<D>(options)`: cues by tier (`micro`, `small`, `medium`, `big`) and
  kind; smalls coalesce by kind into batches (`onBatch`, `useCueBatches`), mediums and bigs take the stage one at a
  time (`stage()`, `useStage`, `done(id)`), a big cuts a medium short, the machine's wins are rationed (and drop a
  tier with `machine.downscale`), `reduced` rides on every cue, and `sample`/`replay`/`log` serve development. `docs/feel.md`.
- **Count-ups.** `<Count to from? ms? delay? format ease? onLand? skip? />` rolls a figure from one Decimal to another
  (log space past a thousand, from 1 when it starts under 1, `countBetween`), writing the element's text with no render per frame, at most
  `countFrameCap(ms)` frames whatever the size; a new `to` rolls on from the figure shown; the end at once under
  reduced motion or `skip`; `[data-counting]` while it rolls. `countUp(node, options)` is the same on any node and
  returns `{ cancel, finish }`. `docs/feel.md`.
- **Marks at a point.** `createMarks({ max?, className?, keyframes?, duration?, lifetime?, reduced?, hidden? })` and
  `<MarkLayer marks />`: `marks.at(x, y, { kind?, step?, text? })` or `marks.on(el)` leaves a short-lived
  `[data-mark]` where a press landed, run by the Web Animations API on transform and opacity only (`compositorOnly`,
  `markKeyframes`), capped, pooled, removed by a timer, a fade in place under reduced motion. `kick(el, name?)`
  restarts a CSS animation by flipping `data-<name>`. `docs/feel.md`.
- The **reveal** (below). The sound is `watchpot/sound`, and `watchpot/kit` exports none of it.

## Theme

`watchpot/kit/theme` (`src/kit/theme/build.ts`) is the design-time token compiler, not in the barrel. A game keeps
its `design/tokens.json` and calls `buildTokens({ tokens, out, fontBase })`: it writes the themes, schemes, worlds,
moments, structural tokens (spacing, grid, radius, type roles) and `@font-face` rules, each `fonts/<file>` url
re-based on `fontBase` as the css file sees it. The template's `design/build-tokens.ts` is the three-line caller,
and its `src/ui/theme.css` maps the compiled tokens onto the registry's `--ui-*` contract.

## Scenes

A screen's living backdrop is the game's own fragment shader run by `watchpot/shader` (`ShaderCanvas`, its palette
from the tokens through `useShaderTokens`, a CSS still without WebGL2; see Shader and `docs/shader.md`). The
template's `Backdrop` (`templates/game/src/ui/Backdrop.tsx`) runs one of four original starters from
`templates/game/src/shaders/` (`weather`, `print`, `signal`, `cells`, picked by the answers' `look.surface.base`),
built from the shader chunks, for a game to replace with its own place.

## Reveal

`src/kit/reveal/` is the gacha reveal's mechanism, headless: the sequence, its timing, the ladder's steps and the pity
ladder, and the director as a hook. It knows no rarity name (every step reads a payload's rung on the game's ladder)
and draws nothing: the room, the cards, the words and every effect are the game's. Recipe: `docs/reveal.md`.

- **The steps.** `ROOM_STEPS` (5) and `roomStep(tier)` put a rung on one of five steps from the plainest to the
  loudest; from `BIG_STEP` (3) a face charges before it turns (`chargeMs`: 1000ms, the top step 1500ms).
  `bestOf(ladder, ids)` and `rungAtLeast` are the ladder's comparisons.
- **`useRevealSequence`** `<R, P extends { rarity: R }>({ result, ladder, payloads, gift?, reduced?, charge?,
  onOpening?, onCharge?, onTurn?, onLand?, onSummary? })` and **`<RevealSequence>`** (the same as a render prop):
  the box, the lid, the deal, one face per tap (a tap before the face in the centre has shown is ignored), a big rung
  lifted face down and charging first, Skip, and a new `result` starting over in the same render. It hands back
  `state` (`phase`: `chest`, `opening`, `cards`, `summary`), `stage` (the payload holding the centre), `charging`,
  `tone` (the rung the room should take, never falling back mid-reveal), `lit`, `best`, `remaining`, `reduced`, and
  the moves `tap`, `skip`, `face(i)` and `onKeyDown` (Enter, Space and the right arrow on the stage). `onLand`'s
  `landing` says the rung's `tier`, `step`, `big` and `top`: what the game's burst, flash and shake read. Under
  reduced motion every step is a 600ms fade.
- **The pure sequence.** `initialReveal`, `reduceReveal` (`RevealEvent`), `nextDelay`, `REVEAL_TIMING`,
  `RevealState`, and the poses a renderer may use: `cardRole` (`deck`, `stage`, `shelf`), `cardPose` and `cardLayer`
  (a fan of backs, the stage and the shelf in pixels from the stage's centre, `FAN`), `isTurned`, `printKeyOf`.
- **Pity and the shelf**: the kit computes no guarantee; a game's gacha reports each one's window and opens left
  (`Guarantee`). `pityRungs` is the ladder an odds sheet prints (`PityRung`: `within`, `since`, `left`),
  `nearestGuarantee` the one a pity line names (a tie to the higher rung), `shelfLight(colour, fill, rungs)` how a box
  stands on its shelf (`strength` 0.45 to 1 by `fill`, `charge` 1 when the next open pays).

Tests: `test/kit/reveal/` (the pure sequence; the hook playing three payloads in order, charging the top rung first
and reporting the best). `examples/orbital-orchard/src/ui/Reveal.tsx` is a whole reveal built on it.
