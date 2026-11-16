# Sound packs

`buildPack` turns a folder of downloaded audio into one set of encoded files and a typed manifest, so every sample in a
game starts at the same loudness, has no dead air at its edges and (for a loop) is a whole number of bars to the sample.
It runs in Bun at build time, shells out to `ffmpeg`, and is never part of a game's bundle: `watchpot/sound/pack` is its
own entry, and nothing in `watchpot/sound` imports it.

Example: [`examples/sound-pack.ts`](examples/sound-pack.ts). The game side is [sound-table](sound-table.md).

The package's other entry, `watchpot/sound`, plays what this writes: a shot is a take of a cue, a loop is a stem of a score
([sound-music](sound-music.md)), an impulse response is the `ir` of a `convolver` ([sound-mix](sound-mix.md)), and
`rootHz` is what a `pitched` cue is moved onto the harmony clock from.

`ffmpeg` must be on PATH, built with `rubberband` (loop stretching), `libopus` (the default codec) and `ebur128`
(loudness). The build stops with one line when `ffmpeg` is missing.

## The source folder

```
audio/source/
  shots/   kick.wav  hat.wav  hat-open.wav  chord.wav  hat.wav.json
  loops/   bed.wav   bed.wav.json
  irs/     room.wav
```

- Files go in a folder by role: `shots/` (one-hit sounds), `loops/` (music beds and textures) and `irs/` (impulse
  responses for a convolution reverb). A subfolder is allowed; its name joins the sample's with `-`.
- A sample's name is its file name without the extension. Two files that would write the same name (in two roles, or
  `kick.wav` beside `kick.flac`) are an error, never an overwrite.
- Any file ffmpeg reads works: wav, flac, mp3, ogg, opus, m4a, aiff.

## The sidecar

A file may have a `<file>.json` beside it (`bed.wav.json`), every field optional:

| Field    | Meaning                                                                                      |
| -------- | -------------------------------------------------------------------------------------------- |
| `bpm`    | A loop's tempo in its source. When it differs from the pack's `tempo` the loop is stretched. |
| `root`   | The root as Hz or a note name (`"A3"`). Wins over detection.                                 |
| `source` | Where the recording came from; copied into the manifest.                                     |
| `bars`   | A loop's length in bars when its length alone would not say.                                 |
| `loop`   | `true` on a shot the game plays round (a bed, a roll): its ends are left as they are.        |
| `key`    | Accepted and ignored; the pack's `key` is the manifest's.                                    |
| `edit`   | What was changed of the recording before the pipeline (the mix desk writes it, see below).   |

A loop with no sidecar `bpm` and no pack `tempo` is an error naming the file. With no pack `tempo`, the loops' own
`bpm` is used when they all agree.

## The caller

`buildPack({ source, out, name, tempo?, key?, codec?, targets?, log? })` writes `<out>/<name>/<sample>.opus` and
`<out>/<name>/pack.ts`: a static import of each file (so the bundler fingerprints its URL) and
`export const pack: PackManifest`. Bun bundles `.opus` and `.flac` as assets; TypeScript needs `declare module "*.opus"` and `"*.flac"` beside the
`"*.ogg"` a game's `env.d.ts` already has (the template declares all three). One line is printed per file: seconds, loudness before
and after, root, warnings.

## What each file goes through

1. Decoded to 48 kHz 32-bit float (every pack is 48 kHz), then edited as the sidecar's `edit` says: cropped to
   `start`..`end` (seconds in the source), moved by `semitones` with its length kept (rubberband; a sidecar `root` moves
   with it), reversed, then faded `fadeIn` and `fadeOut` seconds at the ends of what plays.
2. A loop is stretched to the pack tempo by rubberband when its `bpm` differs, then checked to be within 5 ms of whole
   bars (the build fails otherwise: a 4.03-bar file is a bad cut, not a loop) and cut to exactly that many bars. A loop
   is not trimmed or faded: its first sample is the downbeat.
3. A shot or an IR is trimmed to 1 ms before its first sound, its tail cut where it falls under -60 dBFS at the last zero
   crossing, and faded 2 ms in and out.
4. Stereo whose channels correlate above 0.98 is folded to mono.
5. Integrated loudness and true peak are measured (EBU R128; a sound under half a second is measured repeated end to end,
   so silence does not dilute it) and gain is applied to the role's target: shots -18 LUFS, loops -20, IRs untouched
   (`targets: { shots, loops, irs }` overrides). The true peak is held under -1 dBFS, which can leave a hot, short
   sound under its target (the log line says by how much). A sample that clips after gain fails the build.
6. A tonal shot or loop gets `rootHz` by YIN over its loudest 200 ms, kept at confidence 0.8 or better.
7. Encoded: Opus in Ogg (96 kbit/s mono, 128 kbit/s stereo) or FLAC with `codec: "flac"`. An IR is always FLAC.

The manifest's `lufs` and `peak` (linear) are the values after gain, so the engine can match levels without decoding.
Every failure in a pack is collected and thrown as one error listing each file, so a script exits non-zero with the whole
list.

## One sample at a time

A pack can also take one sample at a time: the mix desk does this when a recording is dropped on a sample. The same
per-file pipeline runs, so a sample made alone is the file a full build makes from the same recording.

- `processSample({ file, name, kind, edit?, bpm?, bars?, root?, loop?, source?, tempo?, codec?, targets? })` runs one
  recording (with its `edit` first) and resolves `{ bytes, fileName, entry, tempo?, line }`. Nothing is written.
- `commitSamples({ out, pack, samples, tempo?, key?, format? })` (and `commitSample` for one) writes each file into
  `<out>/<pack>/` and rewrites `pack.ts` with those entries added or replaced and every other entry as it was. A replaced
  sample whose file name changed (a new codec) has its old file removed. `tempo` and `key` are written into the manifest;
  a pack with no `pack.ts` yet is made.
- `readManifest(dir)` reads a pack back from its own `pack.ts`, so no source folder is needed: the module is imported
  (under Bun each audio import resolves to the file's path), which reads it whatever a formatter has done to the text. The
  rewrite is what `manifestSource` writes; `format(file)` runs after, for a game that formats generated files.
- `keepSource({ source, name, kind, file, sidecar })` keeps a recording at `<source>/<role>/<name>.<ext>` with its sidecar,
  removing every earlier source that gave the same name (in any role or subfolder).
- `retunePack({ out, source?, pack, tempo })` makes every loop again at a new tempo: from its kept source and that
  sidecar's `bpm` when there is one, else from the pack's own file at the manifest's tempo (that many bars at the new
  one). It writes nothing; commit the loops with `commitSamples({ ..., tempo, key })`.

## The sample host

`sampleHost({ out, source, packs, format? })` is the desk's side of this in a game's dev server: a request handler that
processes and stages for the desk in the browser, and writes into the packs on Save. `watchpot/react`'s
`fetchSampleHost(url)` is the `SampleHost` that talks to it. Example: [`examples/sample-host.ts`](examples/sample-host.ts).

```ts
const samples = sampleHost({ out: "src/audio/packs", source: "audio/source", packs: { ui: {}, music: { tempo: 120 } } });
Bun.serve({ routes: { "/__samples/*": (req) => samples.fetch(req), "/*": index } });
// in the page: openSoundDesk({ sound, samples: fetchSampleHost("/__samples") })
```

- `packs` is the allowlist: the desk writes no other pack. Each may say the `tempo` and `key` it starts with while its
  manifest says none, and the `codec` and `targets` it was built with.
- A pack and a sample name are letters, digits, `.`, `_` and `-`, never starting with a dot; anything else is refused
  before it becomes a path.
- `process` stages: the recording, the encoded file and what it was run with wait in `<source>/.staged/<token>/` until
  `commit(tokens)` writes each into its pack, keeps its recording under `<source>/<pack>/shots|loops|irs/` with a sidecar
  (`bpm`, `bars`, `root`, `loop`, `source`, `edit`), and clears it. Staging a day old is cleared when a host is made.
  Keep `.staged/` out of version control.
- A sample with no kept source is processed again (a new edit, a retune) from the pack's own encoded file, which becomes
  its kept source at commit. A loop's kept sidecar always says the `bpm` it was cut from.
- `retune(pack, { tempo, key })` stages every loop at the new tempo; the manifest's tempo and key move at their commit.
  With no loop to make again (none in the pack, or the tempo unchanged) the tempo and key are written at once.
- A failure answers `{ error }` with a message to act on: ffmpeg missing (503), a file ffmpeg cannot read, a loop with no
  tempo, a loop cut before the pack's tempo changed (409: process it again).

The kept sources are what make a full rebuild reproduce the desk's work: `buildPack` over `<source>/<pack>` applies each
sidecar's `edit`. **A full `buildPack` over a partial source folder drops every sample that has no source there**: the
pack is the folder, and `pack.ts` is written from it alone. A pack built elsewhere, whose folder holds only what the desk
kept, is grown one sample at a time (the desk, or `processSample` and `commitSamples`), never rebuilt whole from it.
