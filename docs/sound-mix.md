# The mix: buses, effects, sends, scenes, the mod matrix, placement

Every cue plays on a bus, and a bus is a fader, a chain of effects and a few sends. This page is how a game declares
them, moves them while it plays and lets the player have a say. The mixer, the mod matrix and the space are all safe to
call before `unlock()`: each remembers what it was told and sends all of it when the core comes up.

Example: [`examples/sound-mix.ts`](examples/sound-mix.ts). The cue table is [sound-table](sound-table.md).

## Buses

Five exist already: `sfx`, `ui`, `music`, `ambience` and `voice`, each summing into the master. `SoundOptions.buses`
declares more beside them, or redefines one by naming it (15 in all at most). A bus is:

- **`out`**: the bus it sums into (default the master).
- **`level`**: dB on its fader (default 0).
- **`volume`**: a bus whose player volume (`setBusVolume`) this one takes too, on top of its own: a bus kept apart
  from the music's so it is not ducked with it, which the player's music volume should still turn down.
- **`fx`**: its effects in order, before its fader, at most eight. A bus with any effect is processed every block, so a
  tail rings out after the bus has gone silent. An effect may carry an `id` (a name with a letter in it, its own on
  its bus): what a scene, a route, a handle and the mix desk call it. One with none is named by its place in this
  list (`"0"`, `"1"`). `on: false` declares it switched off.
- **`sends`**: levels 0..1 to other buses, taken after its fader.

A cue's `bus` names where it plays (default `"sfx"`), and its `sends` (at most two) are added by name. `Sound<K, B>`
takes `B` as the buses a game declares beside the five, read from `buses`, so a cue that names a bus nobody declared
is a type error.

A reverb is a return bus: declare it once, and send to it from the buses that want a room.

```ts
room: { level: -6, fx: [{ kind: "reverb", size: 0.5, decay: 2, damping: 0.5, mix: 1 }] },
sfx: { sends: { room: 0.2 } },
```

A play's hand moves the first send: `mine: false` has 6 dB more of it, so the machine's sounds sit further back in the
room than the player's own.

## Effects

An effect is `{ kind, ...settings }`, every setting in natural units (Hz, seconds, dB, 0..1; a switch is `true` or
`false` where it is declared and 0 or 1 in a `set`). **A setting left out is the effect's own default, and the default applies until the setting is set**: a
filter you declare with no `cutoff` is wide open, an EQ is flat, a saturator drives 6 dB. Two effects start fully
wet, `reverb` and `convolver` (`mix: 1`): they are for a bus other buses send to. On a bus that carries a sound
itself, set `mix`.

| Kind | Settings (default; range) |
| ---- | ------------------------- |
| `filter` | `mode` `"low"` (default) `"high"` `"band"` `"notch"`; `cutoff` (20 kHz; 20 to 20,000 Hz); `q` (0.707; 0.1 to 40); `slope` 12 or 24 dB an octave (12). Wide open until swept. |
| `eq` | Four bands: `lowFreq` (100 Hz) and `highFreq` (8 kHz) shelves, `mid1Freq` (500) and `mid2Freq` (2,500) peaks with `mid1Q` and `mid2Q` (1); gains `lowGain`, `mid1Gain`, `mid2Gain`, `highGain` (0 dB; -24 to 24); frequencies 20 to 20,000 Hz; Qs 0.1 to 18. |
| `compressor` | `threshold` (-24 dB; -80 to 0), `ratio` (4; 1 to 50), `attack` (0.01 s; 0.0001 to 1), `release` (0.15 s; 0.001 to 5), `knee` (6 dB; 0 to 24), `makeup` (0 dB; -24 to 24), `range` the most gain reduction (24 dB; 0 to 80), `mix` (1), and `key`. |
| `saturator` | `drive` (6 dB; 0 to 36), `tilt` (0 dB; -12 to 12: brighter going in, so the drive bites the highs, and the same amount taken off again), `mix` (1). Loudness-matched: any drive stays within a dB of the input's loudness. |
| `delay` | `time` (0.25 s; 0.001 to 4), `beats` (0 is off; 0 to 16) with `tempo` (0, the transport's; else 20 to 400 bpm), `feedback` (0.35; 0 to 0.95), `filter` the loop's cutoff (6 kHz; 200 to 20,000), `pingpong` (false), `glide` (false), `mix` (0.25). |
| `tape` | `wow` (0.15; 0 to 1) at `wowRate` (0.8 Hz; 0.3 to 2), `flutter` (0.1; 0 to 1) at `flutterRate` (9 Hz; 6 to 12), `speed` (1; 0 to 2), `hiss` (0.05; 0 to 1). |
| `crush` | `rate` (11,025 Hz; 50 to the sample rate), `bits` (8; 1 to 24), `mix` (1). |
| `stereo` | `width` (1; 0 is mono, up to 2) and `pan` (0; -1 to 1, a balance that leaves a centred bus untouched). A mono bus panned is a source at a place: a radio in a corner. |
| `reverb` | `size` (0.5; 0 to 1), `decay` (2 s at size 0.5; 0.1 to 30), `damping` (0.5; 0 to 1), `predelay` (0.02 s; 0 to 0.5), `width` (1; 0 mono to 1), `mod` (0.3; 0 to 1), `early` (0.5; 0 to 1), `mix` (1). |
| `convolver` | `ir`: a sample's key (`"pack/sample"`) from a pack, a `kind: "ir"` sample; `mix` (1); `gain` (0 dB on the wet path; -60 to 24). With no response loaded it is silent. |
| `freeze` | `amount`, `stutter`: [sound-dsp](sound-dsp.md). |

- **The duck.** `compressor`'s `key` names a bus it listens to instead of its own: a pulse on `sfx` pushes `ambience`
  down, by up to `range` dB. A silent key changes nothing.
- **The delay's beats** are beats of `sound.transport`, so an echo stays in time with the music through a tempo
  change (the time crossfades to the new one, or bends with `glide`). Give the delay a `tempo` of its own only to
  hold it against the transport's.
- **The reverb** is a feedback delay network. Its decay is `decay * 40^(size - 0.5)`, so the default spans about 0.3 s
  at `size` 0 to 12.6 s at `size` 1. `size` and `decay` can be played while it sounds: a change crossfades over 50 ms
  with no pitch swoop, so a room can grow under a long sound.
- **The tape** varispeeds its bus: pitch and level follow `speed`, and a `speed` set to 0 stops it, silent within 30 ms
  (slew the setting for a slower stop); set back to 1 it runs up again from where it was.
- **The delay's `time`** crossfades from tap to tap over 30 ms, the echoes jumping rather than swooping; with `glide`
  they bend in pitch as the time moves, the way a tape delay does.
- **Latency.** The limiter makes everything 5 ms late. Beyond that, the convolver's wet path is 256 frames late (5.3 ms
  at 48 kHz; the dry path is not), the saturator's 42 frames (under a millisecond), the tape's 17 ms. None is
  compensated, so a bus with a tape is a hair behind the one beside it; nothing else here delays.

## Moving the mix

`sound.mixer.bus(name)` is a bus live:

- **`fx(slot).set(param, value, slewMs?)`**: a setting of an effect, by its `id` or its place in the declared chain
  (0 is the first in the bus's `fx`), named as in the table; `on` (0 or 1) switches it, crossfaded over 10 ms. A setting moves to `value` over `slewMs` (default 0); a parameter's first set lands at once.
- **`send(to, level, slewMs?)`** and **`level(db, slewMs?)`**.
- **`setBusVolume(name, volume)`** and **`busVolume(name)`** are the player's, 0..1 (1 until set): a settings slider,
  apart from the mix's own level, multiplying the bus's gain and moving over 30 ms so a slider does not click. The
  master's gain in the core is the sound's volume (`createSound({ volume })`, `setVolume`) times the master's level
  times the player's master volume (`"master"` is a name to `setBusVolume`).

### Scenes

`SoundOptions.scenes` are named mixes. A scene says only what it changes, per bus: `level`, `sends` and `fx` (an effect
by its `id` or its place in the declared chain, then its settings by name, and `on: 0` to switch it off); anything left out stays as the mix under it has it. `scene(name, { fadeMs })`
fades to one (400 ms unless told). **A scene can only hand back what the mix itself says**: an effect setting a scene
moves should also be in the bus's definition, with the value it returns to (the engine warns once, at creation, about
any that is not: it would stay where the scene left it). `scene.push(name, { fadeMs })` lays one over the current mix and returns what takes it
off again, for a dialog that quiets the world while it is open; it comes off over the fade it came in with, or over its
own (`const off = scene.push("duck", { fadeMs: 250 }); off({ fadeMs: 1500 })`).

What a number is worth when several things say it, highest first: the mod matrix (while any route drives it), the
topmost pushed scene that names it, the current scene, the mix itself (the bus's definition, moved by the handles). A
layer that stops saying (a route removed, a scene popped) uncovers the one under it.

### The mod matrix

`sound.mod` feeds the mix numbers the game already has. `source(name).set(value)` takes 0..1 (many sets in a frame
send once); `route({ from, to, range, curve?, slewMs? })` maps a source onto a target and returns what removes it;
`SoundOptions.routes` declares them up front.

- **Targets.** `{ bus, level: true }` (dB), `{ bus, send }` (0..1 to the bus `send`), `{ bus, fx, param }` (`fx` the
  effect's `id` or its place in the declared chain). A target that does not exist throws.
- **`range`** is what 0 and 1 map to, in the target's unit; several routes to one target sum.
- **`curve`**: `"lin"` (default), `"exp"`, `"log"`, `"s"`. Over a range wholly above zero (a frequency), `exp` is
  geometric, equal ratios a step; `log` is its mirror; `s` eases in and out.
- **`slewMs`** is how long the target takes to follow (default 30).

## Placement

A cue with `placed: true` played with `at` (a viewport point, or an element, read at the moment of the play) is heard
where it happened. `sound.space.resolve(at)` is `{ pan, distance, occlusion }` if a game wants the numbers.

- **Pan** runs -1 to 1 across the viewport's width, scaled by 0.7: the screen's edge is not hard left or right.
- **Distance** is 0 inside the viewport's central third and rises to 1 at its edge (and is 1 for an element scrolled
  out of view). It lowers the level by up to 18 dB, darkens toward 2.5 kHz and sends more to the first send. A button at
  the side of a narrow window is audibly further away, the player's own clicks included, unless the hand says
  otherwise: `presence: { mine: { db: 0, sendDb: 0, distance: 0 } }` keeps a `mine` play's pan and drops its distance.
- **Occlusion**: `space.place(el, { occluded })` says an element is behind something (0..1); plays placed at it, or at
  anything inside it, take a second low-pass toward 600 Hz and up to 9 dB off.
- **`space.listener({ mode })`**: `"speakers"` (an equal-power pan) or `"headphones"`: the far ear hears the sound up to
  0.65 ms later through a head-shadow low-pass, the near ear untouched.

A place travels over 20 ms; the first of a voice lands at once.

## The player's settings

`soundPrefs(key, sound)` keeps a volume per bus and the headphones mode on the device, as one JSON value under `key`
(session only where storage refuses), and applies them to `sound` now and on every change: `busVolume(name)`,
`setBusVolume(name, volume)`, `headphones()`, `setHeadphones(on)` are what a settings row reads and writes.

## The mix desk

`sound.desk` is everything about the mix that a person sets by ear, as one live surface: every number of the mix (in
the mix itself or in any scene), the structure (which effects a bus runs, where a bus and a source go), a trim, mute
and solo per bus, a strip per source that has sounded, the recordings a cue plays, and the game's own numbers. What is
moved is heard at once (over 30 ms) and saved as a `MixFile`, which the game hands back to `createSound({ mix })` in
development and in production: the file is the mix, and nothing is copied into code by hand.

```ts
import mix from "./mix.json";
const sound = createSound({ cues, buses, scenes, mix });
const TICK_DB = tunable("stream.ticks", -28, { group: "stream", label: "ticks", min: -60, max: 0, unit: "dB" });
// In a dev build only:
openSoundDesk({
  desk: sound.desk,
  onSave: (file) => fetch("/__mix", { method: "POST", body: JSON.stringify(file) }),
  samples: fetchSampleHost("/__samples"),
});
```

`openSoundDesk` (from `watchpot/devtools`) opens the desk in a window of its own, laid out as a mixer: a column a bus,
the selected bus's effects in a row along the bottom, the sources in a pane beside them. `onSave` writes the file
wherever `createSound` reads it (a route on the game's dev server that writes `mix.json` into the repository).
`samples` is who processes a dropped recording and writes it into a pack ([sound-packs](sound-packs.md) › The sample
host); without it the desk shows samples and replaces none. `switches` are the game's own (`{ id, label, options(),
value(), set() }`, drawn in the top bar): which scene the sound is held in, say, so a mix can be worked on without
playing to it. A game's own number is a `tunable(id, initial, spec, onChange?)`, read as a function each time it is
used; the desk lists it under its `group`, shows its `hint` on hover, and draws the tunables of a group that have a
`cell` (`{ row, column }`) as one grid: a score's sections by its stems.

**Layers and keys.** A value lives in a layer: `"mix"` (the mix itself) or `"scene:<name>"`; `get("live", key)` is the
value in force and `owner(key)` says where it comes from: `"route"` while a mod route drives it, else the topmost
pushed scene naming it, else the current scene, else `"mix"`, else `"default"`. A scene says only what it changes, so
a game whose tiers are its current scene has one mix and, per tier, only what that tier does differently. The keys:

| Key | What it is |
| --- | ---------- |
| `level:<bus>` | The bus's level, dB. |
| `send:<bus>><to>` | A send, 0 and up. |
| `fx:<bus>:<id>:<param>` | A setting of an effect, in its own unit (a filter's `mode` 0..3, a switch 0 or 1). |
| `fx:<bus>:<id>:on` | The effect on (1) or off (0): a scene can switch one off. |
| `trim:<bus>` | dB on the bus's gain, beside the player's volume and outside the mix and the routes. |
| `ch:<channel>` | A source's trim, dB. |
| `chsend:<channel>><bus>` | A cue's own send to a bus, 0 and up: a declared one's level, or one the desk added (two in all). |
| `tune:<id>` | A tunable. |

A desk write lies over what the code declares in the same layer and is kept apart from it: `set(layer, key,
undefined)` gives the declared value back, and a scene still takes back only what the mix says. Writing an effect
setting into the mix that the bus never declared gives it a value to return to. In a scene a trim of 0 is said (it
lies over the mix's); in the mix it is no trim. `copyLayer(from, to)` makes one layer say what another does: between
two scenes, what only the second said goes back to the mix's value.

**The structure** is the same in every scene, and each change is heard at once: `addBus(name, { out })` and
`removeBus(name)` (a bus the desk made, once nothing sums, sends, listens or is routed to it), `setOut(bus, out)`
(refused where it would close a loop), `setVolume(bus, of)` (the bus whose player volume it takes on top of its
own; `null` for none), `fxAdd(bus, kind, at?)` (its id is `<kind>-<n>`), `fxRemove`, `fxRestore` (a declared effect taken out, back in its place), `fxMove`,
`fxKey(bus, id, key)` (a compressor's key bus) and `fxIr` (a convolver's response). An effect is named, never
numbered: one the code declares with no `id` is named by its place in the declared chain (`"0"`), so a key, a scene
and a route keep meaning the same effect wherever the desk moves it. A chain that changes is defined again in the
core from the first slot that differs: those effects start over, so a tail is cut. A declared effect the desk took
out keeps what scenes and routes say of it, sent nowhere, for when it comes back.

**Sources.** A channel is `cue:<key>`, `stem:<pack>/<stem>`, `gen:<name>`, `grain:<name>` or `voice:<name>` (a
generator the game did not name is `<kind>#<n>` in the order made, a cloud its sample, a babble voice `#<n>`). A cue
whose plays name a `bus` has a strip under it for each bus asked for, its **role**: `cue:<key>@<bus>`. What is
written on the cue reaches every role; what is written on a role reaches it alone (a role's trim adds to the cue's;
its route and its send levels win). `route(channel, bus)` plays a source on a bus whatever it asks for: a cue from
its next play, a stem at once (its loop starts again in place), the rest from their next start. A trim rides on the
source's gain, for what starts next and for what is sounding now within about 50 ms: a cue's voices (a looped bed, a
roll, a sequence of it, a stinger), a stem's loop (a trim above what a level of 1 carries starts the loop again in
place, once, with +24 dB of headroom), a generator's `level` and a cloud's level; a babble voice's from its next line.
Trims are held to -80..+24 dB.

**Takes and samples.** `takes(cue)` is a cue's takes in force and the ones its code declares; `setTakes(cue, takes)`
replaces them from its next play. `samples()` is every sample of the packs that have loaded, with the channels that
play each. `stage(key, audio, entry, token)` decodes a processed recording and holds it beside the sample (or as a
new sample of its pack), playing in its place: a cue from its next play, a stem at once. `ab(key, "a" | "b")` says
which of the two plays, `unstage(key)` drops it, and `committed(keys)` says the host has written it into its pack: it
is the sample now. The desk's window does the rest: a file dropped on a sample goes to the host's `process`, is
staged, compared, and on Save committed before `onSave` is called.

**Mute and solo** are for listening and never saved; `load` and `clearListening` take them off. A muted bus is a gain
of 0. While anything is soloed, a bus sounds only when it is soloed, carries a soloed bus's signal to the master (its
`out` chain), is a soloed channel's bus or on its way out, or is a return a sounding bus or a soloed channel's own
sends reach (and that return's way out). A channel is silent while it or its cue is muted, while another channel is
soloed and neither it nor its cue is, and while its bus or any bus on its way out is silent, so a cue's own sends
into a return go quiet with its bus. A muted cue still goes through the governor as if it played. Solo mutes a
compressor's key bus like any other, and a silent key no longer ducks: solo the key bus too to hear the duck.

**Undo.** `undo()` and `redo()` walk back and forward through every change to what the file holds; writes to one key
within 600 ms are one step (a control dragged). A staged recording is not a step: it is kept or dropped.

**The file.** `file()` is `{ version: 2, layers, graph, cues }` with empty parts left out and keys sorted, so a saved
file diffs cleanly: `layers` holds every number by layer and key, `graph` the structure where it differs from the
declared one (`buses`: a made bus, an output, a chain as ids with the declared effects that were dropped; `routes` by
channel), `cues` the takes that replace a cue's own. A file the first desk saved (`version: 1`) is still read: its
`trims`, `channels` and `tunables` are `trim:`, `ch:` and `tune:` keys of the mix, and a slot number in a key names the
declared effect at that place. A key, a bus, a scene or a channel the mix no longer has is kept in the file and
reaches nothing. `load(file)` replaces the desk's state live, sending only what differs, and `dirty()` compares with
what was loaded or last `saved()`. Channels a file names are on the desk from the start (on bus `""` until they
sound). `meters()` is, per bus, the peak since the last call, the latest RMS and the most gain reduction of its
compressors (dB), with the master's LUFS; silence while the core is down. Where the core cannot run, `sound.desk` is
inert, its tunables still live.
