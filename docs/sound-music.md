# Music: the transport, harmony, arrangement and sequences

The sound has a musical clock the core keeps, a key every pitched cue is moved onto, a score that arranges loops into
sections that change on the bar, and step sequences that play a cue on the grid. All of it is on the sample clock in the
core, so what must be exact is quantised there, never timed from the page.

Example: [`examples/sound-music.ts`](examples/sound-music.ts). The cue table is [sound-table](sound-table.md); the
loops are samples of a pack ([sound-packs](sound-packs.md)).

## The transport

`sound.transport` is tempo, bars and a start and a stop. It is safe to call before `unlock()`.

- **`set({ bpm?, beatsPerBar?, swing? })`**: the defaults are 120, 4 and 0, and the clock starts stopped. A change of
  tempo keeps the beat's phase and lands each beat within one frame, never early. A change of meter waits for the old
  meter's bar line. `swing` is 0..1 on the off sixteenths (and thirty-seconds): it bends those grids only, so
  eighths, beats and bars stay put.
- **`start()`**, **`stop()`**: stop is a pause. The beat holds and a start carries on from it. While it is stopped
  nothing waits for a grid line: a quantised play starts at once, a loop waits, a sequence holds its place.
- **`running()`**: whether the clock has been started and not stopped. **`tempo()`**: `{ bpm, beatsPerBar, swing }` as set.
- **`position()`**: `{ bar, beat, phase }` now, bar and beat from 0, phase 0..1 through the beat; it moves between the
  core's beats.
- **`onBeat(fn)`**: `fn({ bar, beat })` on every beat; the returned function stops it.

The core holds the position as an anchor (a frame and the beat it was on), not a running sum: 4,800 sixteenths over ten
minutes drift 0 frames.

### The grid

A line of the grid is a place a start can wait for: `"32"`, `"16"`, `"8"`, `"4"` (a beat), `"bar"`. A cue's `quantise`,
`play(key, { when })`, a score's `section`, `stinger` and `stop`, and a harmony `set` all take one. A start waiting for a
line begins on that line's frame to the sample, whatever tempo changes meanwhile (at most 64 wait; when another arrives
the oldest starts at once).

Everything the core tells the page (a beat, a step) is stamped with the frame it was rendered on and batched at most 60
a second, and what you hear is the limiter's 5 ms after that frame. Draw with `onBeat` and `onStep`; time nothing from
them.

## Harmony

`sound.harmony` is the key, the scale and the chord every `pitched` cue and every `ladder: "scale"` is moved onto.

```ts
sound.harmony.set({ key: "A", scale: "minorPentatonic", chord: [0, 2, 4] }, "bar");
```

- **`key`**: `"C"` to `"B"`, with `#` or `b`, and `m` for a minor key (`"Am"`, `"F#"`). Anything else warns once and is
  ignored. The default is C.
- **`scale`**: `major`, `minor`, `dorian`, `mixolydian`, `pentatonic`, `minorPentatonic` (default `major`, or `minor` for
  a minor key).
- **`chord`**: scale degrees. With no degree, a pitched cue goes to the nearest tone of the chord (or of the scale, with
  no chord).
- **`when`** (the second argument) waits for a grid line; `current()` says what is sounding, and `rateFor(rootHz, degree)`
  is the ratio that would move a recording there.

A degree counts from 0 along the scale (0 is the tonic) and climbs an octave past its length. Tuning is equal
temperament, since the stems are recorded in it. A take with a root (`rootHz` in the pack's manifest) moves to the
nearest copy of its degree's note, a fifth above preferred to a fourth below: a run of degrees never moves it more than
seven semitones up or four down. A take or a zzfx voice with no root moves relative to itself, degree 0 being its own
pitch, so for those the scale sets the intervals above the cue's own note and the key changes nothing.

## A score

`sound.music(def)` is stems arranged into sections.

- **`pack`** and **`stems`**: the pack that holds the loops (loaded on first use) and which of its samples are stems. A
  stem is a loop a whole number of bars long at the pack's tempo, which `buildPack` cuts it to.
- **`tempo`**, **`beatsPerBar`**, **`key`**, **`scale`**: default to the pack's. The first call that uses the score sets
  the transport to them, sets the key, and starts the clock.
- **`bus`** (default `"music"`), **`sections`**, **`riser`**.
- **`takes`**: `{ stem: [sample, ...] }`, other samples of the pack that can play in a stem's place, one at a time.
- **`layers`**: loops no section moves (a part that follows a number of the game's, a part for one screen).

A section is `{ stems: { name: level }, harmony? }`. A stem a section leaves out is silent. A stem is a loop in the core
locked to the transport, so one that arrives late (its pack still loading, or raised from silence) comes in on the beat:
a loop started 1.5 bars late is sample for sample what it would have been started at bar 0. A loop follows a tempo
change by varispeed, the pitch moving with it. At most 16 loops play at once, and a loop is never stolen. A loop
holds one of the 16 only while it sounds: it starts (silent, then fading) when its level first leaves 0 and gives its
place back once it has faded there, so a score may list many more takes and layers than ever play together.

- **`section(name, { when?, fadeBeats? })`** moves to a section on the next bar line (`when`) over a bar (`fadeBeats`,
  default the bar's beats). The section's `harmony` is set on the same line. Called again before the first has landed,
  the last call wins.
- **`layer(stem, level, { fadeBeats? })`** moves one stem now, over a beat, on top of its section's level. A layer
  keeps the level it is given until it is moved again, whatever the section; one its pack does not hold is silent.
- **`take(stem, index, { when?, fadeBeats? })`** says which take a stem plays from the next bar line: 0 is the stem's
  own sample, 1 up its `takes` in order. The stem keeps its level and the two cross over a quarter of a beat. A take
  the pack does not hold is left out, so a score can name takes that are not recorded yet.
- **`stinger(key, { when? })`** plays a cue on the grid (default the next beat), in key if the cue is pitched.
- **`tension(value)`** (0..1) is a riser built from one number: a band of pink noise that climbs five octaves, a motor
  that climbs two and a roll of bursts that doubles its rate at 0.5, 0.75 and 0.9. It follows the value within 80 ms,
  sits at -6 dB (`riser.level`, on `riser.bus`), lets go over 250 ms at 0 and lets go over the time left as the next
  section lands.
- **`stop({ when? })`** fades the stems over a beat from the next bar line.

A score throws when a section names a stem it does not list, and when its pack is already loaded and lacks one of its
stems; a stem missing from a pack that arrives later warns once. Music that follows the game is one call per change of state:
`hear(best)`.

## Sequences

`sound.sequence({ cue, grid?, steps, level?, degrees? })` plays a cue on a step pattern, on the grid, in the core.

- **`steps`** is a string of `1` (a hit) and `0` (a rest), where spaces and `|` are left out to mark beats and bars, or
  an array of velocities 0..1; at most 64. `grid` is the step (default `"16"`), `level` dB on every step.
- **`degrees`** is a scale degree per step on the harmony clock, repeating if shorter than the pattern.
- The track plays the voice the cue would start (its take, its level, its first two sends) and does not pick again for
  each step. The cue can be a zzfx voice only. At most 16 sequences run at once.
- A pattern shorter than the bar wraps inside it; a longer one runs across bars. A new one (`steps(pattern)`) waits for
  the next bar line and plays from its first step there. `set({ cue, grid, level, degrees })` changes the rest and
  `stop()` removes the track.
- **`onStep(fn)`** calls `fn(index)` as each step sounds, rests included, for a printed playhead: the example draws
  the pattern with `Checker` and puts `head` on the step that sounds (`watchpot/ui`).
- A tempo change moves a step but never skips or repeats one.
