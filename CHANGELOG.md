# Changelog

Each release is a tag `vX.Y.Z`. A breaking change names its codemod in `codemods/` (policy in `codemods/README.md`).

## 1.0.0 (unreleased)

A clean break: the API a game is written against, redone in one release, with no deprecated aliases and no codemods.
[docs/migrating-to-1.0.md](docs/migrating-to-1.0.md) lists every change as old → new, and how to bring a fitted game
across with its numbers unchanged.

- **The kernel.** `reach` is lazy and may name a feature by its state type, so two features can read each other and
  no game writes a whole-state type by hand. `derived: { name: (s) => value }` replaces the transient field, the
  `derive` function and the `rates` step: a derived value is typed by what it returns, never saved, and worked out
  again only when a field it read is written. A `produce` step must name its pass (`tick`, `catchUp` or `both`). A
  step orders itself with `after` and `before`; `defineGame`'s `order` is gone. `initial`'s `now` is always game
  time, with `wallNow` beside it.
- **One stat system.** `defineStats` declares every stat's base once, takes sources and contributions, and serves
  each stat as a derived Decimal on the state, with the breakdown on request. One effect spelling: `{ stat, add }`
  or `{ stat, mul }`, the amount a number or a function of the state. The number bus (`busOf`, `statValue`) is
  removed and the live graph is `statIndex`.
- **Factories.** Every feature factory is named `defineX` (`defineCurrencies`, `definePrestige`, …) and returns the
  feature plus `select` (questions over state), `def` (fixed configuration) and `draft` (helpers that take a draft,
  named like the actions). Each takes a `reach` option, so its callbacks are typed with no annotation.
- **Prestige and currencies.** A layer keeps its own run start and peak pace and serves `pace`, `peakShare` and
  `pastPeak`; `payInto` pays a reset into a wallet currency. A currency states the reset `depth` that wipes it, and
  totals are `earnedThisRun` / `earnedEver`.
- **Prices.** Cost curves round up by default (`round: "none"` for fractions). A node with more than one rank must
  state `costGrowth`.
- **The sim.** It runs on plain data (`createPlainStore`): no immer, no zustand, no save, and several times faster.
  The auto-player works a purchase's worth out from one `objective`, takes a free move once a look, and steps a
  second by default, with a named quality (`exact`, `quick`, `rough`). `upgradeTree` declares its own moves. The fit
  kit ships: `fitTable`, snapshots and resuming, `proveFit` (and on workers), a profiler.
- **Packages.** The dev panel and sound desk are `watchpot/devtools`; `watchpot/hooks` and `watchpot/env` are gone.
  The engine is MIT licensed.
- **Tests.** `decimalComparisons` fails a game's tests on Decimals compared with `<` or `===`. `plainParity` proves
  a game's sim and its real store agree. The guide's examples are run against what the chapters quote.

## 0.18.0

The developer-experience pass that came out of rebuilding the docs. The docs themselves are new: a guide to read front
to back (`docs/guide/`, thirteen chapters that build one small game, Simmer, and then show each idea on a real one),
`docs/showcases.md`, `docs/glossary.md`, and seven new reference pages (gauge, loadouts, prefs, settings, events, the
React runtime, the test kit).

**Breaking: `achievements` type parameters are `<K, G, E = never>`** (state before effect, as its types already
were), so the state infers and most calls write none. Codemod: `codemods/0.18.0-achievements-generics.ts` rewrites
explicit call sites.

**Stricter, no codemod.** `defineGame` throws when an action shares a name with a key of its feature's `initial`
(the slice used to be overwritten silently), and an action called inside a recipe or a step throws (its change used
to be lost). A feature's migration step is skipped when the save has no slice for it. A gacha over an empty ladder
throws at definition. `Formatter` gains a required `full`. `data-motion` on `<html>` is always written, from the
resolved value (`"reduced"` or `"full"`), and follows the OS under `"system"`. A composed shader gains one comment
line before the game's code, and `fixLog` reports lines past the chunks as `main:N`.

**Renamed, old names kept as deprecated aliases.** The pure helpers `catchUp` and `catchUpSteps` are `offlineCredit`
and `offlineSteps` (`catchUp` now names only the store's action); codemod `codemods/0.18.0-offline-credit.ts`. The
test kit's `Persona` is `FixturePlay`. The allocation kernel and its action share a name.

- **Clock and saves.** A hidden spell up to `awayAfterMs` is paid as live ticks, not as time away. The store flushes
  the save on page hide by itself. A save that is set aside warns and says why (`saveSetAside`), a blocked save says
  why (`saveBlockedBy`: newer, taken, unreadable), and `clearSave(store)` removes a save for good. Storage over the
  memory backend no longer calls itself durable. A saved `undefined` under a Decimal default falls back to the
  default.
- **Kernel.** `api.set` returns the recipe's value. `vocab` takes `stats` and `rarities` as optional. `type Draft`
  is exported from `watchpot/core`, with a helper for reading a saved shape loosely in a migration.
- **Systems.** Clicker, gauge, spawns and generators callbacks receive `{ now }`, so a buff can be read where it
  applies. The gauge has a draft helper (`nudge`). A buff's `effects` are optional. An upgrade tree has open-aware
  `open`, `check` and `affordable`, a pure `buyCheapest` and a `buyAll` action. Generators have a buy-row helper,
  `rules.away`, a `milestones` gate, and export `RateGeneratorDef` and `CycleGeneratorDef`. `BuyAmount`'s
  `optionProps` accept `data-*`.
- **Page.** `useShallow` is re-exported and a selector that returns a new identity warns in development.
  `useAwayReport` works in either hook order. `useGameRuntime`'s `motion` and `scheme` default to `"system"`.
  `useHashRoute`, `ShaderSurface` and `formatter().full` are new. `useShaderTokens` warns, naming the missing
  custom properties.
- **Sim and tests.** `playDays` stops on `until` or `hours`; `autoPlayer` reads its balance from the game's one
  wallet; `freshStore().play(ms)` moves the clock and ticks.
- **Scaffold.** `templates/game/.scaffold/new.ts <answers> <out>` runs the whole scaffold; the generator copies the
  template, defaults to this engine's own tag, builds the tokens and lints what it wrote; the answers reference is
  `templates/game/.scaffold/answers.md`; a look has defaults and a clicker-only game is a valid shape. The template
  mounts the dev panel on `#dev`, and its sim judges a played-hours contract.
- **Package.** `engines.bun` is `>=1.4.3`; `zzfx` is an optional peer; `watchpot/env` carries the CSS-module and
  custom-property declarations a game's typecheck needs; `api/` covers `watchpot/kit/theme` and
  `watchpot/sound/pack`; a `files` list.

## 0.17.0

**Breaking: the package is renamed.** `idleslop` was a codename; the engine is `watchpot`, at
`github.com/backshelf/watchpot`. Every export is where it was. Codemod: `codemods/0.17.0-watchpot.ts` rewrites a
game's specifiers, its dependency and its docs. Left to hand: the tag in `package.json` and `bun install`; and two
default browser storage keys start over under the new name (`watchpot.soundDesk`, the mix desk's layout, and
`watchpot.three.quality`). The history before this release is not published: the repository starts here.

## 0.16.0

- **A score's stems have takes, and a score has layers.** `MusicDef.takes` names other samples that can play in a
  stem's place and `music.take(stem, index)` changes which one plays on the bar; `MusicDef.layers` are loops no
  section moves, set by `music.layer`. Either may be missing from the pack. docs/sound-music.md › A score.
- **A loop holds a slot only while it sounds.** A stem at 0 no longer starts a silent loop: it starts when its level
  first leaves 0 (silent, fading from the next frame) and gives its slot back once it has faded out. A stem raised
  with `when: "off"` on its first start therefore fades in over `fadeBeats` where it used to start at its level.

## 0.15.0

Additive: every 0.14.0 call site compiles and behaves.

- `fillLoadout(rules, { owns, score, slots?, start?, depth? })`: an auto-equip for a loadout, by exchanges of up to
  `depth` slots at once, so it reaches a set that pays only whole. README › Loadouts.

## 0.14.0

- **A bus can take another bus's player volume.** `BusDef.volume` names a bus whose `setBusVolume` this one obeys on
  top of its own, and the mix desk sets it per track (`desk.setVolume(bus, of)`, saved in the file's graph): a bus
  kept apart from the music's, so a duck does not reach it, is still turned down by the player's music volume.

## 0.13.1

- **A loop dropped on the mix desk says its tempo.** A loop cut at another tempo than its pack's was sent to the
  pipeline with none, measured against the pack's and refused before its editor opened. The desk now reads the tempo
  from the file's name (`pack_100_pad.wav`, `120bpm`) and its bars from its length, else the tempo nearest the
  pack's at which the length is a power of two of bars (`guessLoop`). A recording the pipeline still refuses is held
  in the editor, drawn, with its tempo, bars and trim to set and Apply to run it again; an edit after a drop keeps
  the tempo it was staged with.

## 0.13.0

Additive but for two things a game may meet: a saved mix is written as version 2 (version 1 is still read, so a
game's own check of the file's shape has to accept both), and a cue played on a bus gains a strip per bus asked for
(`cue:<key>@<bus>`) under its own.

- **The mix desk is a mixer.** `sound.desk` changes the structure while the game plays and saves it: `addBus`,
  `removeBus`, `setOut`, `fxAdd`, `fxRemove`, `fxRestore`, `fxMove`, `fxKey`, `fxIr`, `route(channel, bus)`. An effect has a name
  (`FxDef.id`, else its declared place) that scenes, routes, handles and saved keys reach it by wherever it is moved,
  and an on/off (`on`) any layer can say; a bus holds eight effects.
- **Everything can differ by scene.** A bus's trim (`trim:<bus>`), a source's trim (`ch:<channel>`), a cue's own
  sends (`chsend:<channel>><bus>`) and a tunable (`tune:<id>`) are keys of a layer like a level or a setting: the
  topmost scene that says one wins, else the mix. `copyLayer(from, to)`; `SceneDef.label`.
- **Roles.** A cue played with a `bus` has a strip per bus asked for under its own; a write on the cue reaches all
  of them, a write on one reaches it alone.
- **Takes and samples.** `takes`, `setTakes`; `samples`, `stage`, `ab`, `unstage`, `committed`: a recording held
  beside a sample and played in its place. `watchpot/sound/pack` gains `processSample`, `commitSample`,
  `retunePack`, a `SampleEdit` (crop, fades, pitch, reverse) kept in a source's sidecar, and `sampleHost`, a
  handler a dev server mounts; `fetchSampleHost` (`watchpot/react`) is its other end.
- **Undo**: `undo`, `redo`, `canUndo`, `canRedo`.
- **The core** switches an effect on and off without a click (`FX_ON`) and meters each bus's gain reduction
  (`desk.meters().buses[name].reduction`).
- **Tunables** take a `hint` and a `cell` (`{ row, column }`: a group's cells are drawn as one grid).
- **The window** (`openSoundDesk`) is rebuilt as a mixer: tracks as columns with their output, sends and meters, the
  selected track's effects along the bottom, the sources beside them with their roles, takes and samples, the grids,
  the layer being edited, the game's own `switches`. `docs/sound-mix.md`, `docs/sound-packs.md`.

## 0.12.0

Additive: every 0.11.0 call site compiles and behaves.

- `searchBoard(board, { score, held?, open?, start?, trials?, random? })`: a board layout by simulated annealing, run
  a slice at a time (`step`, `best`, `bestScore`, `progress`), for an auto-arrange the player watches. It finds what
  `fillBoard`'s greedy pass misses and leaves a piece in hand when the board is better without it. `docs/board.md`.

## 0.11.0

Additive: every 0.10.0 call site compiles and behaves.

- `CrashBoundary` in `watchpot/ui`: what the page shows when a render or a stopped clock throws. The game's own
  `fallback({ error, retry })`, in place of the blank page React leaves. `docs/ui.md`.
- `useAwayTitle(titles, { everyMs? })` in `watchpot/react` and `watchpot/hooks`: the tab's title says the game's own
  words, in turn, while the tab is hidden, and the page's title comes back on the return.
- `IdleStore.profileSwaps()` counts the imports and profile resets a store has seen, and `watchChanges` treats a
  swapped profile as a jump with no `jumped` test of the game's: nothing a rule emits over it goes out, and bests
  and streaks are forgotten.
- Shader chunks for a one-bit raster: `MOSAIC` (`mosaicCell`, `mosaicCentre`), `DOT_SCREENS` (`dotScreen(level,
  dot)`, a pattern per tone, and `blockScreen`) and `RASTER_FAULTS` (`deadDot`, dead columns; `rowSkew`, slipped
  rows). `docs/shader.md`.
- `useSteppedFrame(handle, frame, { fps, ready, running, at, pin })` in `watchpot/shader`: a frame loop below the
  display's rate for a held canvas, its uniforms pushed through the handle with no React render; it stops on a
  chosen frame for reduced motion.
- `ShaderCanvas` takes `fps`, a cap on its draws (the clock keeps the display's time). `shaderClockPin()` reads the
  page's pin (`pinShaderClock`), so a surface with a clock of its own holds the same instant; `useSteppedFrame`
  does.
- A uniform pushed through a `ShaderCanvas` handle outlives a render: the `uniforms` prop replaces only the names it
  passes. A render used to drop every pushed value from the canvas's record (one wasted draw a render, and a
  rebuilt program after a lost context drew without them until the next push).
- `HoverTips` and `useTipSlot` in `watchpot/ui`: one tooltip for a whole page by event delegation. Whatever carries
  `data-tip` has a tip (`content(key)`, asked only as it opens): hover, keyboard focus (a `data-tip-scope` row
  shows its tips together), a tap or a held press on touch. `docs/ui.md`.
- `useClosestAttribute(ref, name)`, `useMediaQuery(query)` and `useArrived(shown, ms)` in `watchpot/ui`: an
  attribute off the nearest ancestor that carries it, kept current; a media query as a value; and true briefly,
  from before paint, after something turns up on a mounted page.
- `lexicon`, `annotate` and `annotator` in `watchpot/core`: a glossary's terms marked in running text, as
  segments (whole words, any case, the longest phrase, each entry once, `allow` to hold some back).
- `seenOnce({ key })` in `watchpot/core`: the saved set of what has been shown the first time, kept through a run
  reset (`see`, `seeAll`, `forget`).
- `usePacedState(store, options)`, `pacedView` and `createPacedView` in `watchpot/react` and `watchpot/hooks`: the
  whole state at once after the player's input, every `idleMs` at most while the game runs by itself, never while
  the tab is hidden. `createRuntimeHooks` gives it as `useGameView()` and takes `{ view }` for its pace.
- `usePageRuntime({ motion, scheme, sound })` in `watchpot/react`: `useGameRuntime` without the clock, for a shell
  that shows a title before the game runs. `useGameRuntime` is it and `useGameClock` composed, and behaves as it did.

## 0.10.0

Additive: every 0.9.8 call site compiles and behaves.

- `sound.desk` is real: every bus level, send and effect setting (in the mix or a scene), a trim, mute and solo per bus,
  a strip per source that has sounded (`cue:`, `stem:`, `gen:`, `grain:`, `voice:`) with a trim that moves what is
  already sounding, the game's tunables and the meters, on one live surface. What is moved saves as a `MixFile`, which
  `createSound({ mix })` lays over the declared mix before anything sounds. `docs/sound-mix.md`, "The mix desk".
- `openSoundDesk({ desk, onSave })` in `watchpot/react` opens the desk's window (development only): a strip per bus
  with its level, trim, mute, solo and meter, a bus's sends and effects by layer, a strip per source with solo and
  audition, the tunables, and Save, which hands the `MixFile` to `onSave`.
- A score's riser generators are named for its pack (`<pack>.riser.sweep`, `.motor`, `.roll`), so each tension is the
  same three strips.

## 0.10.0-pre.0

A prerelease for building against: the mix desk's contract only.

- `sound.desk` (inert until 0.10.0), `SoundOptions.mix`, `MixFile`, and `tunable(id, initial, spec)`: a game's own number the desk can move, read as a function. `openSoundDesk` in `watchpot/react` is a placeholder.
- `GenDef`, `GrainDef` and `BabbleDef` take a `name`, which the desk will call them by.

## 0.9.8

Two fixes; no API change.

- The `tape` effect comes home: back at `speed` 1 after running under it, it splices to its normal lag (a 10 ms crossfade). It used to stay as late as it had fallen, for good, so a bus slowed for a moment played behind everything else from then on.
- A scene that sets an effect setting its bus never declares now warns once when the sound is made: the mix has no value to return to, so the setting stays where the scene left it. Declare it in `buses`.

## 0.9.7

Additive: every 0.9.6 call site compiles and behaves.

- `babble.say(text, { db })`: a line's own level, over the voice's. One babble voice can speak a line softly and the next at full, where a game needed a voice per level.

## 0.9.6

Additive, with one fix.

- `watchpot/sound/pack`: a loop stretched to the pack's tempo comes out exactly its length over the ratio. At some ratios (16/15, as 90 to 96 bpm) the stretcher ended about 70 ms early, dropping the loop's tail and failing the whole-bars check.
- `sound.transport.tempo()`: the tempo, the bar and the swing as they are set.

## 0.9.5

Additive: every 0.9.4 call site compiles and behaves.

- `sound.transport.running()`: whether the clock has been started and not stopped, so a game need not infer it from beats arriving.

## 0.9.4

Additive in its API; two behaviours change, both fixes.

- A `ladder: "scale"` always rises: step 0 is the tonic nearest the take's root and each step is measured up from it. It used to place every step at its own nearest copy, so a take rooted far from the key fell an octave part of the way up. `play(key, { degree })` on a `pitched` cue still goes to the nearest copy of that degree.
- A roll sounds where the play that began it would have: on that play's `bus`, at its `at`, with its `mine`. It used to start on its cue's own bus, unplaced.

## 0.9.3

Additive: every 0.9.2 call site compiles and behaves.

- `watchpot/sound/pack`: a shot whose sidecar says `"loop": true` is built with its ends as they are, neither trimmed nor faded, so a bed or a roll played round (`Cue.loop`, `roll`) meets itself without the dip two faded ends leave.

## 0.9.2

Additive: every 0.9.1 call site compiles and behaves.

- A pushed scene comes off over a fade of its own: `const off = mixer.scene.push(name, { fadeMs })`, then `off({ fadeMs })`. With none it comes off over the fade it came in with, as before.
- `play(key, { attackMs })`: the voice fades in over that long, so a looping bed can arrive under the one it replaces.

## 0.9.1

Additive: every 0.9.0 call site compiles and behaves.

- `play(key, { bus })`: a play may name the bus it goes to, in place of its cue's own, so one cue can be heard from several places in the mix. `PlayOptions` takes the sound's bus names (`PlayOptions<B>`).
- `Cue.loop`: the cue plays its sample round until the voice `play` returns is stopped: an ambience bed, a hum. Only through the core (silent on the fallback); it never rolls.
- `Presence.distance` (0..1, default 1): how much of a placed play's distance a hand takes. `presence: { mine: { db: 0, sendDb: 0, distance: 0 } }` keeps the player's own press where it landed, and close.
- A `stereo` effect: `width` (0 is mono, 1 as it is, up to 2) and `pan` (-1..1, a balance). A mono bus panned is a source at a place.

## 0.9.0

Breaking: the sound is the engine's own graph, and `watchpot/sound` is the only place it comes from. Run `codemods/0.9.0-sound.ts` from the game's root (`bun <watchpot>/codemods/0.9.0-sound.ts --write`): it moves the sound imports and lists, by file and line, every call site it leaves to a hand with what to write instead. The last of the three releases that rebuild the sound: the music and the instruments.

Removed:

- `createStems`, `Stems`, `StemsOptions`: use `sound.music({ pack, stems, sections })`. `mix(levels)` is `music.section(name)` or `music.layer(stem, level)`, `position` is `sound.transport.position()`, `meter()` is `sound.tap.read().level`.
- `stemOffset`: the core keeps every loop in phase with the transport, so there is nothing to call.
- `soundSamples(key)`: nothing hands out a cue's samples any more. `sound.soundInfo(key)` gives its length and source, `sound.tap.read()` the live master, `capture(sound, seconds)` a recording in development.
- `mixLayers`: out of the public surface; the sound renders each cue's `voices` itself.
- Every sound name from `watchpot/kit`: import from `watchpot/sound` (the codemod does this).

Still read, unchanged: a 0.6 cue's `clips`, `SoundOptions.samples`, `ClipLayer` and `SoundCue`.

Added:

- The clock: `sound.transport` (`set({ bpm, beatsPerBar, swing })`, `start`, `stop`, `position()`, `onBeat`). Grid lines are resolved to the sample inside the core: ten minutes at 120 bpm drifts by no frame, and a tempo change keeps the beat's phase. `play(key, { when })` and a cue's `quantise` wait for a line of the grid.
- Harmony: `sound.harmony.set({ key, scale, chord }, when?)`; a cue marked `pitched`, `play(key, { degree })` and `ladder: "scale"` move a rooted take to the nearest copy of its degree's note, in equal temperament, never more than seven semitones within the scale's octave.
- Music: `sound.music({ pack, stems, sections })` plays a pack's stems as loops phase-locked to the transport (a loop started late starts inside itself; a tempo change is followed by varispeed). `section(name)` lands on the bar and fades over one, `layer(stem, level)` moves one stem, `stinger(key)` plays a cue on the grid, `tension(0..1)` drives a riser of generators that lets go as the next section lands.
- Sequences: `sound.sequence({ cue, grid, steps })` runs a step pattern on the core's sequencer (16 tracks of up to 64 steps); `steps(pattern)` swaps in on the bar, `onStep` hears every step, rests included.
- Grain clouds: `sound.grain(sample, { position, rate, size, density, spray, pitch, spread })` scrubs a sample by a 0..1 playhead or plays it slower or faster at the same pitch, at a level that holds as size and density move.
- The freeze: a bus declared with `{ kind: "freeze" }` holds its spectrum as a wash for as long as `sound.freeze(bus, amount)` is up, with no latency and no change to the sound while it is down; its `stutter` repeats the last slice of the bar (in time with the bar's length, not aligned to a grid line).
- Generators with no recording behind them: `sound.gen("motor" | "noise" | "modal", def)`, a pulse train that runs from a slow tick to a pitch, shaped noise in bursts, and a struck bank of up to 12 resonators.
- The babble: `sound.babble(def).say(text, { rate, pitch, at, onChar })` speaks a line as syllables (a buzz or a looped sample through two formants and a consonant burst) and calls `onChar` with each syllable's first character as it starts; `syllables(text)` is the same split, pure.
- `sound.tap.read()` gives `level`, `bass`, `mid`, `high` and `flux` from the master, each 0..1; `sound.output()` is the node the core plays through; `capture(sound, seconds)` records exactly what left the limiter as a 16-bit WAV, in development builds only.
- Changed since 0.8.0: a delay's `beats` are beats of `sound.transport` unless the delay is given a `tempo` of its own (was: its own `tempo`, default 120).
- `watchpot/shader`: `useAudioUniforms(handle, tap, names?, reduced?)` feeds a tap to a shader canvas as `u_level`, `u_bass`, `u_mid`, `u_high` and `u_flux` each frame, and writes zeros once under reduced motion.
- `watchpot/ui`: `Checker` and `Barcode` take `head`, drawn as a `<rect data-head>` over that cell or module (a playhead); `AchievementGrid` takes `onTilePress(tile, event)`, called on a click, Enter or Space on any tile, without changing focus or the tooltip.
- Docs: four recipe pages (`docs/sound-table.md`, `sound-mix.md`, `sound-music.md`, `sound-dsp.md`) and a rewritten README Sound section. The template declares a reverb send; the reference game runs a transport, one sequence and two scenes.
- The core is about 241 KB before compression in a game that imports `watchpot/sound`.

## 0.8.0

Additive: every 0.6.1 and 0.7.0 call site compiles and behaves. The mix: effects, sends, the place of a sound, the cue model and the governor. The recipes arrive with 0.9.0's docs; until then the types in `src/sound/types.ts` are the reference.

- `sound.mixer`: `SoundOptions.buses` declares buses beside the five defaults (or redefines one), each with its output, its level in dB, up to six effects and its sends; `mixer.bus(name)` gives `fx(slot).set(param, value, slewMs?)`, `send(to, level)` and `level(db)`; `setBusVolume` is the player's volume for a bus, apart from the mix; `SoundOptions.scenes` are named mixes, `mixer.scene(name, { fadeMs })` fades to one and `mixer.scene.push(name)` lays one over the mix and returns what takes it off. All of it may be called before `unlock()`. On one target a mod route wins over a scene, a scene over the plain mix.
- Nine effects (`FxDef`): `filter` (state-variable; low, high, band, notch; 12 or 24 dB), `eq` (four bands), `compressor` (with `key`, a bus it listens to instead of its own: a duck), `saturator` (4x oversampled, loudness-matched), `delay` (seconds or beats, ping-pong), `tape` (wow, flutter, hiss, a `speed` that runs down to a stop), `crush`, `reverb` (a feedback delay network whose `size` and `decay` can be played while it sounds, with no pitch swoop) and `convolver` (an impulse response from a pack; 256 frames of latency). The reverb and the convolver start fully wet: they are for a bus other buses send to.
- `sound.mod`: `source(name).set(0..1)` and `route({ from, to, range, curve?, slewMs? })` drive a bus level, a send or an effect setting from a game's numbers, through `lin`, `exp`, `log` or `s`; several routes to one target sum. `SoundOptions.routes` declares them up front.
- The place of a sound: a cue with `placed: true` played with `play(key, { at })` (a viewport point or an element) is panned across the screen, quieter and darker with distance from its middle, and sent more to its first send. `sound.space.listener({ mode: "headphones" })` swaps the pan law for a time and level difference between the ears; `space.place(el, { occluded })` puts an element behind something. `soundPrefs(key, sound)` keeps the player's bus volumes and the headphones mode on the device.
- The cue model: `takes` are picked one per play (`pick`: `shuffle` with no repeat, `round`, `random` by `weight`), narrowed by `play(key, { velocity })`; `vary` draws cents, dB and a start offset per play; `ladder` turns `play(key, { step })` into a rate. Every draw comes from `SoundOptions.seed`. `sends` names a cue's sends by bus.
- The governor decides what sounds: `cooldownMs`; `roll: { above, cue? }` turns a cue played faster than `above` a second into one sustained voice that follows the rate; a cue repeated within 4 seconds is turned down 1.5 dB a time (to -9 dB) and varied more; a play more than 40 dB under the loudest sound ringing (`loudness`, default 60) is skipped. `play(key, { mine: true })` is the player's own hand: never skipped, never rolled. `mine: false` is 6 dB down with 6 dB more of its first send (`SoundOptions.presence`).
- `Sound<K, B>` and `SoundOptions<K, F, B>`: `B` now names only the buses a game declares; the five defaults are always nameable (was: `B` defaulted to the defaults and could be narrowed by a cue table).
- The core is about 217 KB before compression in a game that imports `watchpot/sound`.

## 0.7.0

Additive: every 0.6.1 call site compiles and behaves. The first of three releases that rebuild `watchpot/sound` as an audio engine (0.8.0 the mix, 0.9.0 the music, which is the breaking one).

- `createSound` now plays through a DSP core: a dependency-free Rust crate (`dsp/`) built to WebAssembly and run in one AudioWorklet, booted on `unlock()` with no asset or server configuration in a game (the build is committed in `src/sound/core.gen.ts`). `sound.mode()` says what is playing: `"locked"`, `"core"`, or `"fallback"` (the 0.6 path, zzfx voices and clips through plain Web Audio, where AudioWorklet or WebAssembly is missing or the boot fails; one `console.warn`).
- The core mixes up to 64 sample voices (`SoundOptions.voices`) with smooth starts, stops, steals and loops, through five default buses (`sfx`, `ui`, `music`, `ambience`, `voice`) into a master with a lookahead limiter: no sample passes the ceiling (-1 dBFS), however many cues land at once. The limiter makes the master 5 ms late. A cue's zzfx voices are rendered once and played through the core like any sample.
- `play` returns a `VoiceHandle` (`stop(releaseMs?)`, `set(param, value, slewMs?)`) or null, and takes `PlayOptions` (`rate`, `db`, `delayMs`; the rest arrive in 0.8.0). A cue may name a `bus` and a `level`.
- Packs: `SoundOptions.packs` with `loadPack(name)`, `unloadPack(name)` and `packReady(name)`; a cue's `takes` name samples as `"pack/sample"`. `watchpot/sound/pack` is a new build-time entry: `buildPack` turns a folder of shots, loops and impulse responses into trimmed, loudness-matched, rooted, bar-cut Opus or FLAC files and a typed `pack.ts` manifest, through `ffmpeg`. `docs/sound-packs.md`.
- The sound code moved to `src/sound/`; `watchpot/kit` still re-exports it. A game that imports `watchpot/sound` carries the core: about 128 KB before compression.
- For the engine's own work: `bun run dsp` builds the core (Rust with the `wasm32-unknown-unknown` target; nothing a game needs) and `bun run dsp:test` runs its tests; `test/rules/dsp-fresh.test.ts` fails when the crate, the protocol or the worklet changed without it.

## 0.6.1

- `Toaster`: focus that leaves with a dismissed toast (its own button removed, which fires no blur) no longer holds every later toast's time for good.

## 0.6.0

- `createDirector` (changes a default an hour after 0.5.0): `machine.downscale` is now `false`. A machine's cue pushed without `first` keeps its tier, so a delayed or automated big show no longer silently shrinks; pass `machine: { downscale: true }` for the 0.5.0 behaviour. No codemod: a call site that wants the old rationing adds that one option. `docs/feel.md`.
- `watchChanges` (retype, no codemod needed): `tools.best(kind, value)` returns the best it beat (a `Decimal`, truthy even at 0) or `undefined`, where it returned a boolean, so a rule can say "up from the old best" without its own copy. A truthiness check compiles and behaves as before; only code that stores the result as a `boolean` or implements `WatchTools` itself changes. `docs/feel.md`.
- `watchChanges`: `startMs`, the settling window at the start apart from `settleMs` after a jump (default `settleMs`); `whileSettling: "run" | "skip"` (default `"run"`, as 0.5.0), and a rule given as `{ rule, whileSettling }` (`WatchRuleEntry`) overrides it, so a watch can leave every rule's `spare`, `best` and `streak` untouched by a load while one rule still acknowledges it. `docs/feel.md`.
- `countBetween` and `Count`: a roll from under 1 (from nothing) to a figure past a thousand goes in log space from 1, through the orders of magnitude, instead of landing most of the figure in the first frames; a smaller target stays straight from 0. `docs/feel.md`.
- `Sparkline`: a zone whose end is at or past the range's `min` or `max` runs to the frame's edge, through `pad`. `docs/ui.md`.
- `Barcode`: `label` is optional; without one the svg is `aria-hidden` decoration (no role), for a labelled wrapper. `docs/ui.md` also says `Ruler`'s caret is placed with an inline `left`.
- `createSound`: a clip's `playbackRate` (default 1, held to 1/16..16), so one recording follows a pitch ladder; `soundInfo` and `soundSamples` report the clip as it sounds. `docs/sound-table.md`.

## 0.5.0

- Seeding (changes what a seeded run draws after an import): `importProfile` hands `initial` the same first draws a new profile gets (the seed's own stream) instead of fresh entropy, so a slice a save lacks (`gacha`, `spawns`, `clicker`, `missions`, `sweep`, `market`) starts the same whether the profile was imported or the run carried on. A seeded replay from a save no longer parts ways with the run it replays. Unseeded stores still draw entropy.
- `crafting`: a recipe's `takesMs` may be `(state) => number`, read at each pass (a queue that speeds up keeps the progress of the craft under way); an `onCraft(draft, recipe, times, now)` hook, called once per batch given; `.craftDraft(draft, id, times, now)`, the craft inside a recipe. `docs/recipes.md`.
- `currencies` (throws where it was silently wrong): a currency, total, `extra` field or game action named `credit`, `debit` or `__proto__` (`RESERVED_CURRENCY_FIELDS`) throws with a message naming the clash; an `extra` field or game action named like a balance or a total throws too (it used to overwrite the balance in the slice). `docs/add-a-currency.md`.
- `upgradeTree`: `buyMax(id, limit?)`, as many ranks as the wallet covers up to `limit` and the last rank, in closed form (several price lines in one currency are walked, `WALK_LIMIT` at most); the rules gain `affordable(id, ranks, balance, limit?)` and `buyMax(ranks, id, purse, limit?)`. `docs/upgrade-tree.md`.
- `feature`: a `derive(draft, { now, reason })` option for derived transient state (stats folded from the rest). The store runs every `derive` wherever the transient state is made fresh (a new store, a load, an import, a profile reset, a run reset), so the first pass's `guard` and `sync` steps never read an empty value before `rates` refolds it. Opt-in: a feature without one is untouched. `docs/stat-graph.md` › The first pass after a load.
- `ShaderCanvas`: the handle's `pin(seconds | null)` and `pinShaderClock(seconds | null)` for every canvas on the page hold `u_time` at one instant (over `time`, `reduced` and the clock) until unpinned, for a repeatable screenshot in development. `docs/shader.md`.
- `AchievementGrid` and `TileGrid`: `renderRowAside`, a rail beside each row (told the row's index, its tiles, how many are earned), drawn inside the row as a `role="rowheader"` `[data-row-aside]` for CSS to place on either side. Fixed: a wall with an empty row marked the wrong row `data-complete`. `docs/ui.md`.

- `useSampled` and `createSampler` (`watchpot/react`, `watchpot/hooks`): a store read on a fixed interval into a derived snapshot that re-renders only when it changes, with an optional frame counter (`frameRate`, `sameShallow`). README › React.
- `createGestures` and `useGestures` (`watchpot/kit`): tell a person's own press or key from the machine's change in the same tick, remember where it landed and whether it was answered (`pressPoint`, `middleOf`). `docs/feel.md`.
- `watchChanges` (`watchpot/core`): the game's rules run over each change (the state before and after) into its own typed events, with a settling window after a load and per-kind `spare`, `best` and `streak`; `crossedMark` and `newKeys`. `docs/feel.md`.
- `createDirector` (`watchpot/kit`): the celebration director, a queue of cues by tier that coalesces smalls by kind, puts one medium or big show on the stage at a time (a big cuts a medium short), rations and downscales the machine's wins, carries reduced motion on every cue and replays named samples in development (`useStage`, `useCueBatches`). `docs/feel.md`.
- `Count` and `countUp` (`watchpot/kit`): a figure rolled from one Decimal to another in log space, written straight to the element, at most a fixed number of frames whatever its size, rolling on from where it stands, still under reduced motion, cancellable (`countBetween`, `countEase`, `countFrameCap`). `docs/feel.md`.
- `createMarks`, `MarkLayer` and `kick` (`watchpot/kit`): short-lived marks at a point or an element, pooled and capped, run on transform and opacity only by the Web Animations API, a fade in place under reduced motion (`compositorOnly`, `markKeyframes`); `kick` restarts a CSS animation on an element. `docs/feel.md`.
- `useNear`, `Near` and `Marquee` (`watchpot/ui`): a 0..1 nearness as a named band on `data-near` with hysteresis and `--near`, and a ring of bulbs round what it wraps that fills like a meter (`nearLevel`, `rimBulbs`, `rimPoint`). `docs/ui.md`.
- `watchAway`, `useAwayReport` and `awayGains` (`watchpot/react`, `watchpot/hooks`): the catch-up that credited an absence, heard once with the state before and after it, for the game's own report of what changed while away. `docs/time-away.md`.
- `Barcode`, `Ruler`, `LevelBars`, `Sparkline`, `Checker` and `SplitFlap` (`watchpot/ui`): printed figures in `currentColor`, every count capped: a real Code 128 (`code128`), a tick ruler with a caret, a level strip, a series over named zones and rules (a buy and a sell zone), a bit track (`bitsOf`), and text on split flaps whose changed cells alone remount. `docs/ui.md`.
- `useClearUnder` and `coveredBy` (`watchpot/ui`): decorative marks marked `data-covered` where a solid panel sits over them, measured on scroll, resize and a slow interval, every box read before any attribute is written. `docs/ui.md`.

## 0.4.1

- `resetPace(gain, kept, seconds, floorS?)`: when to reset a prestige layer, as orders of magnitude a second the reset would add to what is kept. The gain a second while the gain is small, the leap a second once it dwarfs what is kept, so one rule serves a steady layer and the climb after a deeper reset. `docs/prestige-layer.md`.

## 0.4.0

- `board`: a grid of cells, pieces placed on it, and each piece's effects read from where it sits (`board`, `boardFeature`, `fillBoard` for a greedy auto-arrange). `docs/board.md`.
- `sweep`: a timing bar. A cursor whose place is a pure function of game time, targets on its track, a strike graded by distance and a streak (`sweepAt`, `gradeStrike`, `drawTarget`, `passesIn`, `sweep`). `docs/sweep.md`.
- `stages`: tracks of stages with climbing resistance worn down by a force, exact over any stretch, with bosses and an optional time limit that makes a wall (`advanceTrack`, `stages`). `docs/stages.md`.
- `upgradeTree`: an `open(state, node)` rule; a closed node refuses with `{ ok: false, code: "closed" }`.
- `powerGain`: `per` and `mult` take a `DecimalSource`, and the curve is worked in Decimals, so it holds past 1e308.
- `challenges`: a `depth` option, the depth entering, leaving and completing reset at (for challenges of a higher reset layer).
- `spawns`: `.take(draft, kind, now)`, the catch inside a recipe or a step (an automatic catcher).

## 0.3.17

- Docs and the game template: the length is what the content makes it (never throttle or pad to reach a target), a market trader's pace is measured in buys per played hour, and a gate is planned before the reset that wipes its measure.
- Game template: the stage scroll clips absolute content so the page never grows past the window, and the counter's figure stays on one line.

## 0.3.16

- `market`: `trader.spend` may be a function of the state, read at each buy (clamped to 0..1). A share that falls as the balance grows keeps a fast trader from compounding a geometric price list out in a day.

## 0.3.15

- `watchpot/sim`: `activeSchedule(lookEverySec, presses)`, a player who no-lifes the game (every hour played, a look every few seconds). Pacing is planned and measured in played hours on it (`docs/plan-and-fit.md` › Played hours); a long target is filled with content, not stretched.
- Game template: the scaffolded `.claude/CLAUDE.md` plans pacing in played hours, fills a long target with content, and tests only what can break (one failing test per bug fix; none for content, copy, a retune or a look).

## 0.3.14

- `market`: `trader.everyMs`, how often the trader looks (on the interval's phase in game time, no saved clock). Every tick takes every wobble and compounds the currency far past a person's pace.

## 0.3.13

- `market`: a `trader` option, a buy-low sell-high trader that works the market by itself every tick (`MarketTrader`, the step `<key>.automate.trade`, `.market.trading(state)`), for a game whose market should run without the player.

## 0.3.12

- Game template: the scaffolded `.claude/CLAUDE.md` gains "Played by a person": an active mechanic pays off within a minute or two of real time, and every extreme a UI shows is reachable.

## 0.3.11

- `treeMoves(key, nodes, worth)`: the auto-player's moves over an `upgradeTree` feature, for `withMoves` (every game with a tree wrote these by hand).
- `watchpot/shader`: `createPulse(decayMs, now)` and `usePulseUniform(handle, pulse, name?)`: an envelope that jumps on an event and decays, fed to a canvas as `u_pulse` with no React render.

## 0.3.10

- `market`: a price now uses its band. The summed octaves crowded the middle (a ticker rarely came near either end, so the auto-player's buy-low and sell-high marks almost never fired); `tickerLean` spreads them through a tanh, and a price spends a real share of its time near each end. Prices for a given seed and time change with this release.

## 0.3.9

- `dimensions`: the draft helper `chain.produce(draft, seconds)` advances the chain inside a recipe, for a game that replays an absence in steps and buys between them.

## 0.3.8

- `dimensions`: the draft helpers `chain.buy(draft, id, count?)`, `chain.buyMax(draft, id, limit?)` and `chain.maxAll(draft)`, so an autobuyer's `run` can buy tiers inside the tick's recipe (as `generators` already could).
- `prestige`: `layer.resetDraft(draft, { now, resetRun })` is the reset inside a recipe or a step, for an autobuyer that resets for the player; `beforeReset(draft, now)` is told the game time.

## 0.3.7

- `market({ key, wallet, pays, tickers })`: tickers whose price is a pure function of game time and a saved seed (`priceAt`, `tickerLean`, `priceBand`, `priceSeries`), positions with a cost basis, a fee, a yield paid over an absence, and auto-player moves that buy low and sell high (`docs/market.md`).
- Reset depths: a feature's `reset` may be `{ depth, rule? }`, untouched by a reset shallower than `depth`. `resetRun({ depth })` (the root action, a step's and `FeatureApi`'s) says how deep a reset reaches, `InitialContext.depth` tells a function rule, and `prestige({ depth, reset })` makes a layer above another layer. `resetRuleOf` splits a rule into its depth and what it does.
- The game template holds a dimensions core with a tree and a reset to bands it can keep (three times as wide: the chain compounds faster than a producer list); a fourth fixture shape checks it.

## 0.3.6

- Fix: `useOpenerFocus` keeps its opener through StrictMode's extra cleanup. In a development build under `<StrictMode>`, a layer whose page turned inert as it mounted gave focus back to nothing at its close (production builds were not affected).

## 0.3.5

- `watchpot/ui`: `useOpenerFocus` reads the opener as it first renders active, so focus returns to it when the page turns inert in the commit that mounts the layer (before, focus was left on the body). `useEscape(fn, enabled, { ambient: true })` is a layer that gets Escape only while no ordinary layer is enabled. `useTabs({ controls: "selected" })` puts `aria-controls` on the selected tab only, for a game that mounts just the open panel.
- `fmtWait(ms, { zero })`: the word for a wait of nothing, where the wait is a length (`"0m"`).

## 0.3.4

- `buffs`: `start(draft, id, now, start?)` and `end(draft, id, now)` on the feature, for starting or ending a buff from another feature's handler that is already inside a recipe (a spawn's `onCatch`).
- The game template implements the `/watchpot` answers schema on the engine's systems: a `generators` (3 to 8) or `dimensions` (4 to 8 tiers) core on their factories, and any of `clicker`, `tree`, `gacha`, `prestige`, `achievements` (eight to a row) and `visitor` (`spawns` paying a `buffs` buff), each gated so a game without it has no file, import, tab, sim column or test for it. Four original starter backdrops on `watchpot/shader` (`weather`, `print`, `signal`, `cells`, by `look.surface.base`), new copy-in components `Arrival` and `BuffChip`, the scaffolded `CLAUDE.md` gains the engine-first rule, the shader floor and the passes the game still owes, and `test:slow` passes with no slow tests. Three fixture shapes are checked by `test/tooling/template-shapes.slow.test.ts`.

## 0.3.3

- Fix: the package no longer declares `sideEffects`. With it, a game's dev server on 0.3.2 served a blank page (`immer2 is not a function` in `createIdleStore`: Bun's development bundler ran the store's `immer` middleware before initialising it). Production builds were not affected. Skip 0.3.2.

## 0.3.2

- The package declares `sideEffects` (its stylesheets only), so a game's bundler drops every engine module the game does not use: a game that imports a few names from `watchpot/ui` no longer ships the rest of the entry.

## 0.3.1

- `watchpot/ui`: a stepped `Progress` / `Meter` no longer writes a step's `key` after its spread props, which made a game's build warn and fall back to the classic JSX runtime for that element.

## 0.3.0

The look leaves the engine: mechanism and behaviour from the engine, every look from the game.

- **Breaking.** The styled kit is gone from `src/`: every component, CSS module and helper of `src/kit/ui` (Badge, Button, Card, BankCard, Chest, Counter, CurrencyPill, Offer, Panel, PassTrack, ProgressBar, RarityChip, Ribbon, Sheet, TabBar, Timer, Title, Tree, the icons, `useDialogKeys`, `WARN_UNDER_SECONDS`, `OddsRow`, `carriesInk`, `overlayStyle`), the reveal's look (`RevealHost`, `RevealPull`, `RevealRoom`, `useRevealRoom`, `REVEAL_SCENE` and the scene helpers, `useOpenFlare`), the card renderer (`fx/cards`), the scene wrapper (`Scene` and its GLSL helpers) and `DitherMark`, `GameShell` (with `TabTable`, `PageTable`, `ShellTab`, `ShellPage`), and the `watchpot/kit/*.css` export. `cx`, `FOCUSABLE`, `useOpenerFocus` (now `(active, restore?)`), `formatCountdown`, `SheetOutlet` and `SheetRegistry` are `watchpot/ui`'s (`watchpot/react` still re-exports the outlet). `Flash` and `FlightHost` are headless (they take `className`; `[data-flash]`, `[data-flight-layer]`, `[data-flight-glyph]`), and `Ticker`/`Money` no longer add the `wh-num` class. `@paper-design/shaders-react` and `motion` are no longer peers. **Codemod:** `bun ../watchpot/codemods/0.3.0-headless-kit.ts [--write] [--vendor] [--force] [--local <dir>]` splits every `watchpot/kit` and `watchpot/react` import by where its names live now (stayed, `watchpot/ui`, or the game's local copy, default `src/vendor/kit`) and rewrites `useOpenerFocus()` to `useOpenerFocus(true)`; `--vendor` copies the 77 retired files as they stood at `v0.1.11` into the local dir with their imports repointed, an `index.ts` of every name that left, and `legacy-effects.css` (the old look of the flash, the flight and the pill bump). **Left to hand** (each listed with file and line): namespace, default, side-effect and dynamic imports of the two entries and `export *`; `watchpot/kit/*.css` imports; `useOpenerFocus` calls with arguments; uses of `GameShell` (works as the vendored copy; replace with `PageShell` when the game owns its look), `Ticker`/`Money` (pass `className`), `Flash`/`FlightHost` (import `legacy-effects.css` once or pass `className`); adding `motion` and `@paper-design/shaders-react` to the game's dependencies if the vendored copies use them; keeping the global `wh-*` classes and theme tokens the vendored CSS modules lean on.
- `watchpot/kit`: effects with no look and the reveal's mechanism. `useRevealSequence` and `<RevealSequence>` (the reveal's director as a hook: the queue, the timers, the tap, Skip, the charge, the best rung; every element and effect the game's); the pure sequence exported whole (`initialReveal`, `reduceReveal`, `nextDelay`, `cardRole`, `cardPose`, `cardLayer`, `FAN`, `isTurned`, `printKeyOf`); `flashKeyframes`, `tokenReader`, `shakeKeyframes`, `SHAKE_MS`, `useThrottledValue`, `splitDigits`; `isTopTier`, `tierLabel` and `tierInk` beside the other rarity helpers. It ships no CSS and no class name (`test/rules/headless.test.ts`, the `kit-lookless` rule).
- `watchpot/ui`: `cx`.
- The dev panel's stylesheet is self-contained (its own `--dp-*` colours, light and dark): it reads no game token.
- Template: `templates/game/src/ui/` is the copy-in registry a new game starts from and owns: thin wrappers over `watchpot/ui` (`Shell`, `TabBar`, `Sheet`, `ConfirmButton`, `Button`, `Panel`, `Title`, `Badge`, `RarityChip`, `CurrencyPill`, `Counter`, `ProgressBar`, `Timer`, `Tree`, `Tooltip`, `AchievementWall`, `BuyAmount`, `ClickTarget`, `Toasts`, `Backdrop`), each with a structural CSS module reading a small token contract (`src/ui/theme.css`, documented in `src/ui/README.md`). The template's page and screens run on it; `@paper-design/shaders-react` and `motion` left its dependencies.
- Orbital Orchard carries its own restyled copies and its own reveal on `useRevealSequence`.
- `watchpot/ui`: `useDialog`'s props are typed and spread onto native elements as they are (`PartRef`, a callback ref that also holds the node, for the panel and for `useTooltip` / `usePopover`); a dialog is pointed at its title only once one is mounted; the scrim closes on a press on itself, so it may wrap the panel, and is no longer `aria-hidden`; `Progress` and `Meter` take `stepProps(index, lit)`.
- `watchpot/core`: `GeometricCost.round` (`"floor" | "ceil" | "nearest"`: whole-number prices whose bulk sums stay exact); `withMigrations(feature, steps)` gives a factory-made feature its save migrations; `label` on a layer model puts the stat breakdown in the game's words; `prefs` hands a stored text that is not JSON to `read` as the string, and an `override` lets go of a key once the player sets it (all of them on `reset`).
- `watchpot/three`: `createQuality` reads a bare tier name an older build stored, and a tier the player picks wins over `?quality=` for the rest of the load; `onPerf` on `Stage` takes a perf run's report and line.

## 0.2.0

The engine grows from one game's kit into the parts any idle game is built from.

- `watchpot/core`: fifteen systems, each a feature factory over a pure kernel with a recipe in `docs/`: `generators`, `dimensions`, `clicker`, `layers`, `achievements`, `challenges`, `autobuyers`, `buffs`, `spawns`, `allocation`, `missions`, `crafting`, `levels`, `records` and `streak` (README › Systems).
- `watchpot/core`: cost curves (`costAt`, `costOfMany`, `maxAffordable`, set pricing through `every`), threshold ladders, the `engineering`, `letters` and `logarithm` notations with `NOTATIONS`, device `prefs`, the pace clock (`createPaceClock`, `createRamp`), and `ctx.resetRun` for a step that ends a run.
- `watchpot/hooks` (and `watchpot/react`): `usePrefs`.
- `watchpot/ui`: a new entry of headless primitives (Dialog, ConfirmPress, Tabs, NavTabs, Progress, Meter, Countdown, Tooltip, Popover, TileGrid, AchievementGrid, TreeGraph, Pressable, HoldButton, FloatingNumbers, Toasts, BuyAmount, Toggle, Switch, Slider, Disclosure, PageShell): behaviour, keyboard, focus, ARIA and `data-*` state from the engine, every pixel and word from the game; peers on react and react-dom only (README › UI, `docs/ui.md`).
- `watchpot/shader`: a new entry: `ShaderCanvas` runs a game's GLSL ES 3.00 fragment (uniforms by value, an on-screen-only loop, a reduced-motion hold, a context-loss rebuild, a still on failure); `ShaderPool` and `ShaderTile` draw many on one context; `useShaderTokens` turns colour tokens into uniforms; a GLSL chunk library with `compose()` and `uniformDecls()` (README › Shader, `docs/shader.md`).
- `watchpot/three`: a new entry for 3D games on three r187 WebGPU and r3f 9 (optional peers): `Stage` with its frame loop, hot-swapped TSL post stack, precompiling boot, hidden-tab and device-loss handling; quality tiers, frame cap and view prefs on `prefs()`; camera framing, glides and rig; pinned DOM labels; caustics, a sprite pool, a turntable, mesh clipping, idle builds and a TSL chunk library (README › Three, `docs/three.md`).

## 0.1.11

- `watchpot/sound`: a `Sound` has `setVolume(value)`, the master volume for voices and clips, settable before the unlock.

## 0.1.10

- `watchpot/hooks` (and `watchpot/react`): `useGameClock(store)`, the clock and the other-tab watch alone, for a game that draws its own page; `useGameRuntime` is built on it.
- Template: the upgrade-rank bands of the pacing contract scale with the tree's node count (a ten-node tree failed its own day-1 band).

## 0.1.9

Three mechanics a game invented beside the engine. No breaking change, no codemod.

- `watchpot/core`: loadouts (`loadout`, `loadoutFeature`): slots that take items by kind, each slotted item's effects, and sets that pay a tier once enough slotted items carry a tag.
- `watchpot/core`: gauges (`stepGauge`, `gauge`, `gaugeLocked`, `gaugeFill`, `secondsToTrip`): a bounded level a rate fills or drains, tripping into a lock at the top; it drains over an absence by default.
- `watchpot/sound` (and the kit): stems (`createStems`, `stemOffset`): loops of one tempo mixed in phase by level, with a level meter and a playhead; `Sound.context()` hands the mixer the gated AudioContext.
- Template: a game's session invents mechanics, and builds the generic ones here and releases them.

## 0.1.8

- `watchpot/hooks`: a seventh entry, the hooks of `watchpot/react` without the game shell, the dev panel or the runtime (the store hooks, the clocks, `useBoot`, `useHotkeys`, `useNews`, `useLayerSwap`, the page layout, the tab title). It reaches neither the kit nor a stylesheet, so a game with its own page and no CSS-module loader can import it. No breaking change, no codemod.

## 0.1.7

Ten additions a game with its own page had written beside the engine. No breaking change, no codemod.

- `watchpot/core`: a live stat graph beside the bus (`liveIndex`, `softcapDecimal`): effects whose value is a function of the state, in Decimals, with mute groups, flags and a breakdown.
- `watchpot/core`: `fmt` takes `notation: "scientific"`, `plainBelow` and `decimalsBelow`; the printers `fmtTimes`, `fmtPlus`, `fmtRate`, `fmtCounted` and `fmtPlayed`; `formatter(options)` binds them to one set of options.
- `watchpot/core`: `fillDeep`, a deep fill for a feature's `merge` (the loader's one-level fill is unchanged).
- `watchpot/core`: `catchUpSteps`, an absence as steps of the game's own tick rule.
- `watchpot/core`: the journal (`JournalLine`, `pushLine`, `linesSince`), a capped log and a cursor over it.
- `watchpot/core`: `settings({ key, initial })`, the settings feature as a factory.
- `watchpot/sim`: `bareSimStore` (a world over plain-state rules), `playStraight` (one sitting), `simArgs`, `fmtClock` and `shortDecimal`.
- `watchpot/sim`: plan-and-fit (`runFit`, `holdings`, `nicePrice`, `formatFit`, `fitTableSource`, `fitReader`, `BLOCKED`): each gate priced at what a pilot holds when its planned minute comes.
- `watchpot/react`: `useNews` (a journal's new lines) and `useHotkeys`.
- `watchpot/sound`: a sixth entry, the kit's sound engine on its own. `@number-flow/react`, `@paper-design/shaders-react`, `canvas-confetti` and `motion` are now optional peers: only `watchpot/kit` reaches them.
- Template and reference game: a `settings` feature (sound, motion) read by the runtime, the about sheet's save out and in, and `sim --straight=<hours>`; the sim reads its arguments through `simArgs`.
- `docs/`: three recipes, `stat-graph`, `time-away` and `plan-and-fit`.

## 0.1.6

- The kit's display voice reads `--font-voice` (falling back to `--font-ui`), so a game can give its headings its own face; Orbital Orchard sets it to its display face.
- Orbital Orchard polished: one primary action per screen, the first heirloom's bloom, the shower's glass, a two-press burn, a deeper module tree.

## 0.1.5

- `examples/orbital-orchard/`: the reference game, made with `/watchpot` (a gacha on four rungs, a timed event with a board, prestige), linked to the engine's own source through the root `workspaces`.
- The template: sun and seed glyphs (an unknown glyph is refused), a pull spends free opens before premium, the page fills the window, the header keeps its name on a narrow page, rates under one show, the sim's day row reads the day's best.

## 0.1.4

- Install with `git+ssh://github.com/...` (no `git@`): the template and docs, so the `gh` credential helper serves Bun's HTTPS try without a sign-in prompt.

## 0.1.3

- The repository's own tooling: `verify`, `gates`, the import rules, the API report, the wall-clock scan.
- `docs/`: fourteen recipes, each with a type-checked example; a TSDoc line on every export.
- `templates/game/`: the game template `/watchpot` scaffolds from.

## 0.1.2

- Check every text file out with LF (`.gitattributes`), so a consumer that compares bytes sees the same files.

## 0.1.1

- Export the theme compiler as `watchpot/kit/theme`.
- Declare `@number-flow/react` and the optional `@testing-library/react` as peers.

## 0.1.0

- The extraction: the engine moves out of WHALE into its own repository. Five entries: `watchpot/core`, `/sim`,
  `/test`, `/react`, `/kit` (plus `watchpot/kit/*.css`), with the public API report in `api/`.
