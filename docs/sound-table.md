# A sound table

`createSound({ cues, packs, volume })` takes every cue by key and every pack by name, and returns the `Sound`: `play`
behind one gesture gate and one mute, with the mixer, the music and the instruments on it. The sound plays through a
DSP core the engine owns (a Rust crate built to WebAssembly and run in one AudioWorklet, committed in the package, so
a game configures no asset or server). This page is the cue table; [sound-mix](sound-mix.md),
[sound-music](sound-music.md) and [sound-dsp](sound-dsp.md) are what the table plays into, and
[sound-packs](sound-packs.md) is where the recordings come from.

Example: [`examples/sound-table.ts`](examples/sound-table.ts).

## A cue

A cue is what one `play(key)` does. Everything but the sound itself is optional.

- **`voices`** are zzfx layers (named parameters, placed in time with `at`). They are what plays until a cue's takes
  have loaded, what plays where the core cannot start, and the whole cue where there is no recording. Each cue's
  voices are rendered once and played through the core like any sample, so nothing is ever silent.
- **`takes`** are recordings from a loaded pack, `{ sample: "<pack>/<sample>" }`. One is picked per play. `pick` says
  how: `"shuffle"` (the default) deals from a bag and never repeats a take back to back, `"round"` goes in order,
  `"random"` draws by each take's `weight` (default 1). A take may say its own `rate`, its own `level` (dB on top of
  the cue's) and `at` (seconds into the sample it starts).
- **`velocity`** on a take is the range (0..1, inclusive) it answers to; `play(key, { velocity })` narrows the takes
  to those whose range holds it (a take with no range answers to all, and when no range holds the value the nearest
  range answers). A take that has not loaded leaves the play to the cue's voices rather than handing it to a take meant
  for another velocity. The play's velocity also scales its level: 20 log10(velocity) dB, never lower than -26.
- **`vary`** draws a little difference per play: `cents` of pitch, `db` of level, `startMs` into the sample, each
  within plus or minus the value. It applies to voices too. Every draw comes from `SoundOptions.seed` (default 1), so
  a seed replays the same plays.
- **`ladder`** turns `play(key, { step })` into a rate: an array is a ratio per step (the step is held to its ends), and
  `"scale"` makes the step a degree of the harmony clock ([sound-music](sound-music.md)): step 0 is the tonic nearest
  the recording's root and each step is measured up from it, so the ladder always rises. One recording climbs a
  ladder, where 0.6 built a cue per step.
- **`pitched`** moves the cue onto the harmony clock from the root in its take's manifest entry (`rootHz`, which
  `buildPack` detects for a tonal sample). `play(key, { degree })` picks a degree; without one the nearest tone of the
  chord. A sample with no root, and a zzfx voice, has none to move from: its degree 0 is its own pitch and the key
  changes nothing.
- **`bus`** (default `"sfx"`), **`level`** (dB on top of the pack's loudness match) and **`sends`** (levels 0..1 by bus
  name, at most two) say where it goes in the mix ([sound-mix](sound-mix.md)).
- **`placed`** makes `play(key, { at })` heard where on the screen it happened.
- **`loop`** makes the cue play round until the voice `play` returns is stopped (`voice.stop(releaseMs)`): a bed, a
  hum. Its sample should meet itself at the ends. It plays only through the core (silent on the fallback, which has
  no voice to stop) and never rolls.
- **`quantise`** (`"off"`, `"32"`, `"16"`, `"8"`, `"4"`, `"bar"`) waits for the next line of the transport's grid;
  `play(key, { when })` overrides it for one play. While the transport is stopped a play starts now.
- **`cooldownMs`**, **`roll`**, **`priority`** and **`loudness`** are the governor's: below.

## What a play says

`play(key, options)` returns a `VoiceHandle` (`stop(releaseMs?)`, `set(param, value, slewMs?)` for `gain` (linear),
`pan` (-1..1), `rate` (a ratio), `send1`, `send2`), or null when nothing started: muted, before `unlock()`, while the
context is not running, on the fallback path, or turned down by the governor. One handle covers every voice the play
started. The options:

| Option | Meaning |
| ------ | ------- |
| `step` | The step of the cue's `ladder`. |
| `velocity` | 0..1: picks among takes with a `velocity` range, and scales the level. |
| `degree` | A scale degree for a `pitched` cue. |
| `at` | Where on the screen it happened: a viewport point `{ x, y }` or an element. A `placed` cue only. |
| `mine` | The player's own hand: never skipped or rolled, no cooldown, 3 dB of repetition cut at most. `false`: the machine's. |
| `bus` | The bus this play goes to, in place of the cue's own: one cue heard from several places in the mix. |
| `rate`, `db` | A ratio and dB on top of everything else. |
| `delayMs` | Starts this many milliseconds from now, on the audio clock. |
| `attackMs` | Fades in over this many milliseconds: a looping bed arriving under the one it replaces. |
| `when` | Waits for a line of the grid, whatever the cue's `quantise` says. |

A play that says neither `mine: true` nor `mine: false` is untouched. `mine: false` is 6 dB down with 6 dB more of its
first send unless `SoundOptions.presence` says otherwise (`{ mine?, other? }`, each `{ db, sendDb, distance? }`;
`distance` is how much of a placed play's distance that hand takes, 0..1, so `mine: { db: 0, sendDb: 0, distance: 0 }`
keeps the player's own press where it landed and close).

## The governor

A game can ask for more than the ear can take: a hundred buys a second, a swarm of identical hits. The governor
decides what sounds, with no clock of its own.

- **`cooldownMs`**: a cue played less than this after its last sounding play is skipped.
- **`roll: { above, cue? }`**: a cue asked for more than `above` times in a second stops retriggering and becomes one
  sustained voice (`cue`, or the same take looped) that follows the rate: 3 dB louder and 200 cents higher per
  doubling of the rate since it began, kept within -12 to +6 dB and 700 cents. Once the rate has stayed at or under
  `above` for 300 ms the voice is released and the cue plays singly again.
- **Repetition**: each sounding play of a cue in the last 4 seconds turns the next down 1.5 dB, to -9 dB, and widens
  its `vary` (to twice at the floor). A play counts in full for 2 seconds and fades out of the count over the next 2.
- **Loudness window**: every sounding voice holds its cue's `loudness` (default 60, a number in dB) until it ends and
  1.5 seconds more. A play more than 40 dB under the loudest held is skipped: a whisper is not played under a blast.
- **A full pool**: with every voice sounding (`SoundOptions.voices`, default 64) a play quieter than all of them is
  skipped; otherwise the quietest voice of the lowest `priority` (default 0) is released over 5 ms and the play takes its place.
- **`mine`**: the governor leaves the player's own plays almost alone. It never skips one (not for the loudness
  window, not for a full pool), never rolls one, ignores the cue's `cooldownMs` for it, and lets repetition turn it
  down 3 dB at most. How it sits in the mix is not the governor's doing: that is `SoundOptions.presence`.

With no `roll` and no `cooldownMs` a flood is turned down by repetition and the pool steals the quietest, but the
governor never skips a cue among its equals: a cue that can flood should say `roll` or `cooldownMs`. A `mine` play
never rolls and has no cooldown, so the cue behind the main button is not marked `mine` when it should become a roll
or be held back.

## Packs and the gate

- **Packs.** `packs: { ui: pack }` takes each manifest (`buildPack` writes one, [sound-packs](sound-packs.md)) or a
  function that imports it on first use. `loadPack(name)` fetches, decodes and uploads a pack's samples and resolves
  when its takes can play; called before the first gesture it is remembered and filled when the core comes up.
  `packReady(name)` asks, `unloadPack(name)` frees the memory (its cues play their voices again), and `soundInfo(key)`
  says whether a cue plays a recording or its voices now, and for how many seconds. A music kit is tens of megabytes of
  PCM in memory: a phone should load what it needs.
- **The gate.** Browsers start audio suspended. Call `sound.armUnlock()` once at boot; or pass `sound: { engine, on }`
  to `useGameRuntime`, which unlocks and mutes for you. Until the core boots (the unlocking gesture) cues play the 0.6
  way and `mode()` reads `"locked"`.
- **`mode()`** says what is playing: `"locked"`, `"core"`, or `"fallback"`, where the core cannot run (no AudioWorklet,
  no WebAssembly, or the boot failed, with one `console.warn`). The fallback is zzfx voices and [clips](#clips) through
  plain Web Audio: the mixer, the music and the instruments need the core and do nothing there, and a `ladder`, `vary`,
  `roll` and the governor do not apply.
- **Time.** A play reaches the core and is stamped on the audio context's own frame clock; a cue with `at` offsets or a
  `delayMs` keeps its layers' spacing to the sample. Everything leaves through a limiter whose ceiling is -1 dBFS and
  which makes the master 5 ms late, uniformly: the sound is never louder than the ceiling however many cues land at
  once.
- **Wrap the engine** in named cue functions (`playGold`), so screens never spell a key. Pick sounds yourself; the
  engine ships none.

## Clips

A cue can name `clips` (`{ file, at?, level, playbackRate? }`, all layers together), with `SoundOptions.samples`
giving every clip's URL by name: the cue plays its clips when every one is decoded and no take of it is ready (a ready
take wins), `level` the target RMS it is scaled to. `loadSamples()` decodes them on demand. `takes` is the usual way; clips
are the older form. For music, use `sound.music` ([sound-music](sound-music.md)).
