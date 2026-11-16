# watchpot/sound

The sound engine. The topic pages ([sound-table](sound-table.md), [sound-mix](sound-mix.md), [sound-music](sound-music.md), [sound-dsp](sound-dsp.md), [sound-packs](sound-packs.md)) have worked examples, and `api/sound/` has every signature.

## Sound

`createSound({ cues, packs?, volume?, voices?, buses?, scenes?, routes?, presence?, seed?, mix? })` is a game's sound: `cues`
every cue by key (`Cue`: zzfx `voices`, recorded `takes` from a pack, a `bus`, and how a play varies, climbs, rolls
and is placed), `packs` the recordings by name, `volume` the master gain (default 0.3), `voices` how many the core
mixes at once (64). It returns a `Sound<K, B>` (`B` names the buses the game declares beside the five defaults):
`play(key, options?)` (a `VoiceHandle`, or null), `unlock()`, `armUnlock(target?)`, `setMuted`, `isMuted`, `setVolume`,
`audioUnlocked`, `mode()`, `context()`, `output()`, `loadPack`, `unloadPack`, `packReady`, `soundInfo(key)`, and the
`mixer`, `mod`, `space`, `transport`, `harmony` and `tap`, with `music`, `sequence`, `grain`, `freeze`, `babble` and
`gen`. A game wraps it in its named cue functions. The recipes are four pages,
[`docs/sound-table.md`](sound-table.md), [`sound-mix`](sound-mix.md), [`sound-music`](sound-music.md)
and [`sound-dsp`](sound-dsp.md), with [`sound-packs`](sound-packs.md) for the build step; the examples are
`docs/examples/sound-*.ts`.

`watchpot/sound` is on an entry of its own, for a game that plays cues and draws its own page: it imports nothing but
its own folder and `zzfx` (the `sound-alone` import rule), so it needs none of the kit's UI peers. `watchpot/sound/pack`
is the build-time entry: `buildPack` turns a folder of downloads into trimmed, loudness-matched, rooted, bar-cut Opus or
FLAC files and a typed manifest through `ffmpeg`, and is never in a game's bundle.

- **The core.** The graph is the engine's own: a dependency-free Rust crate (`dsp/`) built to WebAssembly runs every
  voice, bus, effect, the transport and the sequencer in one AudioWorklet, added from a Blob URL on `unlock()` with no
  asset or server configuration (the build is committed in `src/sound/core.gen.ts`, about 240 KB of wasm before
  compression). Commands go to it as little-endian binary records stamped with the audio clock's frame; a voice starts
  on its frame to the sample. Everything leaves through a lookahead limiter (ceiling -1 dBFS, 5 ms late). `mode()` is
  `"locked"` before the gesture, `"core"` once it runs, `"fallback"` where it cannot (no AudioWorklet or WebAssembly, or
  the boot failed: one `console.warn`): zzfx voices and 0.6 clips through plain Web Audio, and nothing else.
- **The gate.** Browsers start audio suspended. `armUnlock()` wires `unlock()` to pointerdown, pointerup, touchend,
  keydown and click until its cleanup runs: a gesture while audio runs costs one state read, one without activation
  leaves it to the next, and a context the OS suspends resumes on the next. While the context is not running, and while
  muted, `play` is a silent no-op: nothing queues up to blare later. The mixer, the mod matrix, the space, the
  transport and the harmony may be called before `unlock()`: each remembers and sends when the core comes up.
- **Cues.** A cue plays a take (one per play: `shuffle`, `round` or `random` by weight, narrowed by `velocity`), else its
  0.6 `clips` once decoded, else its zzfx `voices`, so nothing is ever silent. `vary` draws cents, dB and a start
  offset, `ladder` turns a `step` into a rate (ratios, or degrees of the harmony clock), `pitched` moves a take onto the
  harmony clock from its root, `quantise` waits for the transport's grid, `placed` is heard where `at` is. A take's
  `level` is dB on top of the pack's own loudness match (`lufs` in the manifest), so swapping a file needs no gain
  re-tune. `soundInfo(key)` says what plays now. `docs/sound-table.md`.
- **The governor** decides what sounds, with no clock of its own: `cooldownMs`; `roll` (a cue asked for more than
  `above` times a second becomes one sustained voice that follows the rate); repetition (each play in the last 4
  seconds turns the next down 1.5 dB, to -9); a loudness window (a play more than 40 dB under the loudest sound ringing
  is skipped); a full pool releases the quietest voice of the lowest `priority`. `mine: true` is the player's own hand:
  never skipped, never rolled.
- **The mix.** Five default buses (`sfx`, `ui`, `music`, `ambience`, `voice`) sum into a master; `buses` declares more
  (15 in all), each with its output, level, up to eight effects (each named by an `id`, or by its place) and its sends. Eleven effects: `filter`, `eq`, `compressor`
  (with a `key` bus: a duck), `saturator`, `delay`, `tape`, `crush`, `stereo`, `reverb` and `convolver` (both start fully wet, for
  a bus others send to) and `freeze`; every setting has a default that applies until it is set, and
  `mixer.bus(name).fx(slot).set(param, value, slewMs)` plays it live. `scenes` are named mixes faded to (`scene(name)`,
  `scene.push(name)`); the `mod` matrix routes 0..1 sources onto a bus level, a send or an effect setting through a
  curve and a slew; `space` places a sound where it happened (pan, distance, occlusion, speakers or headphones);
  `soundPrefs(key, sound)` keeps the player's bus volumes on the device. `docs/sound-mix.md` has every default and
  range, and the latencies (the convolver's 256 frames, the saturator's 42, the tape's 17 ms; none compensated).
- **The mix desk.** `sound.desk` is a mixer over the running game: every level, send and effect setting, an effect's
  on/off, a trim per bus and per source and the game's `tunable` numbers, each in the mix or in any one scene (a scene
  says only what it changes, so a game's tiers differ only where they are told to); the structure (buses made and
  pointed, effects added, moved, re-keyed and removed, a source routed to a bus, a cue split into a strip per bus its
  plays ask for); a cue's takes; a recording staged beside a sample and compared with it; undo. What is moved saves as
  a `MixFile` that `createSound({ mix })` lays over the declared mix, in development and production.
  `openSoundDesk({ desk, onSave, samples, switches })` (`watchpot/devtools`) is its window in a dev build, laid out as a
  mixer; `sampleHost` (`watchpot/sound/pack`) and `fetchSampleHost` (`watchpot/devtools`) run a dropped recording through the pack pipeline
  and write it into a pack. "The mix desk" in `docs/sound-mix.md`, "The sample host" in `docs/sound-packs.md`.
- **Music.** `transport` is the clock (`set({ bpm, beatsPerBar, swing })`, `start`, `stop`, `position()`, `onBeat`);
  `harmony` is the key, scale and chord (`set({ key, scale?, chord? }, when?)`); `music({ pack, stems, sections })` plays
  loops phase-locked to the transport, changing sections on the bar (`section`, `layer`, `take`, `stinger`, `tension`, `stop`), with takes per stem and layers no section moves;
  `sequence({ cue, grid, steps, degrees? })` plays a cue on a step pattern with an `onStep` for a printed playhead.
  `docs/sound-music.md`.
- **The instruments.** `grain(sample, def)` is a cloud of grains whose playhead the game drives; `freeze(bus, amount)`
  holds a bus's spectrum (or stutters the bar's last slice); `babble(def).say(text, { onChar })` speaks syllables of
  shaped buzz and calls back per syllable; `gen(kind, def)` is a pulse motor, shaped noise or a struck modal bank,
  driven by numbers. `tap.read()` is the master as five figures to draw with; `useAudioUniforms` (`watchpot/shader`)
  writes them to a shader canvas; `capture(sound, seconds)` records the output as a WAV in development.
  `docs/sound-dsp.md`.
- **Packs.** `packs: { ui: pack }` takes a manifest or a function importing it; `loadPack(name)` fetches, decodes and
  uploads a pack's samples (the browser decodes, and the core keeps 16-bit PCM) and `unloadPack` frees them. A pack that
  fails to decode leaves the game on its zzfx voices. `docs/sound-packs.md`.
- **Voices.** `Voice` names zzfx's positional parameters (`toParams`); `Layer` places one in time; `soundSeconds` is a
  layer list's length by zzfx's own envelope arithmetic. None of them imports zzfx. The 0.6 `clips`, `ClipLayer` and
  `SoundOptions.samples` are still read; a new cue names `takes`.
- **0.9.0 removed** `createStems` and `stemOffset` (a score is `sound.music`), `soundSamples` and `mixLayers`, and
  `watchpot/kit` exports no sound: import it from `watchpot/sound`. `codemods/0.9.0-sound.ts` rewrites the imports and
  lists what is left to hand.
