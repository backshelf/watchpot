# The instruments: the granulator, the freeze, babble, the generators, the tap

The sound plays recordings, and it also makes sound from numbers: a cloud of grains over a sample, a spectrum held in
mid-air, a line of text spoken as syllables, a motor, noise and a struck bell with no recording behind them. Each is a
thing the game drives with numbers, and each has a way back to the page: what the master sounds like, as five figures to
draw with.

Example: [`examples/sound-dsp.ts`](examples/sound-dsp.ts). Buses and effects are [sound-mix](sound-mix.md).

All of it needs the core: where the core cannot run (`sound.mode()` reads `"fallback"`) these do nothing, and what is
set before it comes up is remembered and sent with the start. On the measured machine a 64-grain cloud costs about 1.6%
of real time, a held freeze 0.5% and sixteen generators 1%.

## The granulator

`sound.grain("pack/sample", def?)` is a cloud of grains over a recording, its playhead a number the game drives. Up to 8
clouds play at once (one more warns and does nothing), and a cloud starts once the core holds its sample.

A grain is a Hann-windowed read of the sample that starts at the cloud's playhead, reads at the cloud's pitch and is
thrown somewhere across the stereo field. A grain keeps what it started with: a setting that moves is heard in the
grains that start after it, so no grain is ever cut or bent mid-window.

| Setting | Meaning (default; range) |
| ------- | ------------------------ |
| `position` | Where in the sample, 0..1 (0). |
| `rate` | The playhead's own speed when nothing scrubs it: 1 is real time, 0 holds, negative runs backwards (0; -8 to 8). |
| `size` | A grain's length in milliseconds (100; 10 to 500). |
| `density` | Grains a second (40; 0 to 1,000). Past 64 sounding at once a start is dropped. |
| `spray` | How far from the playhead a grain may start, 0..1 of the sample (0). |
| `pitch` | A ratio apart from `rate`: 0.5 `rate` and 1 `pitch` is half speed at the same pitch (1; 1/16 to 16). |
| `spread` | How wide the grains are thrown, 0..1 (0). |
| `level` | 0..1 (1). |

`def` takes the settings, `bus`, `pan` and `sends`. `set(settings, slewMs?)` moves them. A setting's first set lands at
once; while `position` travels, the slew is the playhead, so a game that sets `position` every frame scrubs the sample.
The playhead does not wrap: at either end there is nothing left to read, and the cloud is silent until it is moved
(position 1 is the end). A cloud is as loud as its sample whatever its density and size; a sample played straight (the
playhead moving at the pitch, no spray) comes back whole. `stop(releaseMs?)` starts no more grains and fades the ones
sounding over `releaseMs` (default 50).

## The freeze

The freeze is an effect, so it lives on a bus: declare `{ kind: "freeze" }` in a bus's `fx` and move it with
`sound.freeze(bus, amount, slewMs?)` (0 lets the bus through, 1 holds it), or `mixer.bus(name).fx(slot).set("amount", v)`.
A freeze on a bus that declares none warns.

- **`amount`** (0..1, default 0). The moment it leaves 0 the last 2048 frames of the bus are analysed and held, and from
  then on a wash is resynthesised from the held spectrum; `amount` crossfades from the live signal to the wash over 10
  ms. Each region of the spectrum turns as one with its own slow random walk, so a held tone stays a tone and the walk
  is heard as a shimmer between partials, not a buzz. Back at 0 the wash is let go and the next engage holds a new
  spectrum. Engaged over silence, it holds silence.
- **`stutter`** (default 0 off; 8, 16 or 32). Instead of the wash, the unit repeats the last eighth, sixteenth or
  thirty-second of a bar of what it heard, in place of everything else, the wash included. The bar is the transport's
  (a slice over a second is halved until it fits); the slice is a division of the bar's length, not aligned to a grid
  line. Its edges are 3 ms crossfades.
- **No latency**, and with `amount` 0 and `stutter` 0 the bus passes bit for bit.

## Babble

`sound.babble({ bus?, carrier?, level?, rate?, pitch? })` speaks a line of text as syllables of shaped buzz: not words,
the sound of someone talking in a game that does not voice its characters. `bus` is `"voice"` by default, `level` is dB,
`rate` syllables a second (9), `pitch` a ratio (1). Its carrier is a 140 Hz pulse buzz; `carrier` names a looped sample
(`"pack/sample"`, mono) to shape in its place. At most 4 voices exist.

`say(text, { rate?, pitch?, db?, at?, onChar? })` starts a line (ending the one it was saying) and returns `{ seconds, stop() }`.
`at` pans the voice to where an element or point is. `onChar(index)` is called as each syllable starts, with the index
of its first character, so the page prints along; the example shows the text up to the end of the syllable that just
started. Where the core cannot speak (locked, the fallback, or every voice taken) the line is timed on the page instead,
so a page printing along still prints.

The rules are fixed, and `syllables(text, { rate?, pitch? })` returns them (index, start, length, pitch, two formants,
noise, level), the same for the same text:

- A syllable is a vowel run with the consonants before it; a digit is a syllable of its own; a word with no vowel is
  one syllable on a neutral vowel. At most 256 syllables of a line are spoken.
- Each lasts a beat of `1 / rate` scaled by its letters, with a gap after a word, longer after a comma (and the last
  syllable 1.5 times longer), longer still after a sentence (1.8 times).
- The five vowels have two formants each (a spoken average, no one's voice), and a syllable's leading consonant sets how
  much noise opens it: sibilants most, stops less, nasals and liquids least.
- Pitch falls across a sentence to a full stop, starts higher and falls less to an exclamation mark, and rises over the
  last two syllables to a question mark. A capital steps a word's first syllable up; a word in capitals is higher and
  louder throughout. A small wobble seeded by the text keeps it from droning.

## The generators

`sound.gen(kind, def?)` is a modelled source with no recording behind it, driven by numbers. Up to 16 run at once; each
fades in over 2 ms and starts where the game left its settings. `def` takes `bus`, `level` (**dB**), `pan`, `sends`,
`params` (the starting settings) and, for a modal bank, `modes`. `set(settings, slewMs?)` moves them (a setting's first
set lands at once; frequencies travel along a line in the logarithm) and `stop(releaseMs?)` fades it out (default 50).
Note that a kind's own `level` setting is linear and apart from `def.level`.

| Kind | Settings (default; range) |
| ---- | ------------------------- |
| `motor` | A band-limited pulse train from a rhythm to a pitch, through two body resonances. `rate` pulses a second (60; 0.5 to 2,000: from a slow tick to a whine, with no seam between), `duty` (0.3; 0.02 to 0.98), `body1` (220 Hz) with `body1Q` (3) and `body2` (1,400 Hz) with `body2Q` (6) (20 to 20,000 Hz; Q 0.3 to 30), `load` (0; 0 to 1: every other pulse down, an octave-under growl, with jitter), `level` (0.5; 0 to 4). A change of `rate` glides over at least 20 ms. |
| `noise` | White to pink through a band, tilted, gated in bursts. `color` (1; 0 white to 1 pink), `centre` (1,500 Hz; 20 to 20,000), `width` (2,500 Hz; 10 to 40,000), `grid` bursts a second (0, always open; 0 to 60) with `duty` (0.5; 0 to 1), `tilt` dB an octave about 1 kHz (0; -6 to 6), `level` (0.3; 0 to 4). |
| `modal` | Up to 12 resonators, struck. `strike` (-1 to 1: a positive value is one impulse of that height, a hard hit; a negative one a 5 ms burst of noise, a scrape or a soft hit; every set strikes, it never slews and is not a level), `damp` (1; 0.05 to 20: divides every decay), `size` (1; 0.1 to 10: divides every frequency, 2 an octave down), `level` (0.5; 0 to 4). `modes`: each `{ freq, decay, gain }`, 20 to 20,000 Hz, a sine falling 60 dB over `decay` (5 ms to 30 s), gain -4 to 4. |

A modal bank with no `modes` is a free-free bar at 440 Hz (four modes, 1, 2.756, 5.404 and 8.933 times it, decaying from
1.5 s to 0.35 s); `modes` replaces it. A strike in `params` is a moment, not a setting, and is not fired at the start. A
mode pushed above 0.45 of the sample rate falls silent; a bank that has rung out costs nothing until it is struck again.
The riser of a score ([sound-music](sound-music.md)) is three generators.

## The tap

`sound.tap.read()` is what the master sounds like now, five figures 0..1: `level`, `bass` (under 150 Hz), `mid`, `high`
(over 4 kHz) and `flux`. The first four are RMS on a 30 dB scale from -36 dBFS (0) up (1); the bands come from two
one-pole filters, 6 dB an octave: enough to draw with, not a crossover. `flux` jumps on a transient and falls back to 0
over 120 ms. The core sends them about 60 times a second; with no figures lately (the core is down, or the context is
suspended) every one reads 0.

`useAudioUniforms(handleRef, sound.tap, names?, reduced?)` (`watchpot/shader`) writes `u_level`, `u_bass`, `u_mid`,
`u_high` and `u_flux` to a `ShaderCanvas` through its handle each animation frame, with no React render. `names`
renames any of the five. Under reduced motion (the page's setting, or `reduced` when the game passes its own) it
writes zeros once and holds. It takes any object with a `read()` of the five, so the shader entry never imports the
sound.

## Bridges to the page

- **The tap** into a shader: above.
- **Babble** into a printed line: `onChar`, above.
- **A sequence's step** into a printed strip: `onStep` and `Checker`'s or `Barcode`'s `head` ([sound-music](sound-music.md)).
- **A tile's press** into a placed sound: `AchievementGrid`'s `onTilePress(tile, event)` is called on a click or Enter or
  Space on a tile, earned or not; play at `event.currentTarget` so the sound is heard where the tile is.

## Capture

`capture(sound, seconds)` records what the sound puts out, after the limiter, as a 16-bit stereo WAV `Blob` at the
context's sample rate, and is lossless. It is for measuring a mix in a build nobody is listening to: peaks against the
limiter's ceiling, clipping, loudness. It is development only (it rejects in a production build, before `unlock()`, and
where the browser lacks `createScriptProcessor`), and resolves with what it has if the context stops before the length
is reached.
