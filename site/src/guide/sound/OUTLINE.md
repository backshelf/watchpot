# Sound: the outline

The sound section: interactive pages on `watchpot/sound` for a reader who has the getting-started pages behind them.
One idea a page, on the same terms as getting started: a cue named and heard, the voices and a recording, the buses and
the mix, the music, and the core under all of it. The example is Simmer's own sounds, so a page can be heard and
changed while it runs.

**This file is read by the build**: each `## N. Title` heading is a page, in order. A page that exists is
`pages/NN-slug.tsx` and its `title` must match its heading here (a test checks it); a heading with no page yet is
drawn in the progress strip as a step still to come. Keep the headings' form.

Each entry says: the one idea; what the reader does; what they see and hear change; the glossary words it introduces
(each gets its popup on first use; a word not introduced yet is not used); and which example it teaches, named by file
and exported symbol (never by line: the examples are edited in place).

Every page's panel makes its sound on the reader's first press and never before it: the pages are drawn to HTML in a
process with no `AudioContext`, so a panel starts as a still and comes alive on the press. A page whose example makes a
sound copy (a pack's file, a score's loops) writes it in the browser on that press, because no audio ships with this
site; the engine cannot tell those files from a pack's own.

## 1. A cue: the table and the play

- **Idea.** A cue is one named sound. The table says what each one is made of, and a screen asks for it by name:
  `sound.play("stir")`. The engine reads the whole table once and plays it by key.
- **The reader does.** Presses three of Simmer's cues (bubble, stir, overflow), one of them twice to hear it vary and
  climb a rung of its ladder.
- **They see.** The pads, the engine's mode (asleep until the press, then core or fallback), the last cue pressed, and
  `soundInfo("bubble")` saying the cue is zzfx voices and how many seconds it lasts. They hear a tap that is never
  quite the same, a run climbing five ratios, and a chord with a second note 80 ms after the first.
- **Words.** cue, zzfx voice, governor.
- **Teaches.** `sound-cue.ts`: `CUES`, `sound`, `playBubble`, `playOverflow`.

## 2. A voice: zzfx, and retuning it

- **Idea.** A zzfx voice is a wave and an envelope written as numbers. A cue's voices are rendered to one buffer when
  the sound is made, so retuning one is a new table, not a knob on a running engine.
- **The reader does.** Drags the pitch, the sustain and the release, and lets go of each; switches the wave between
  sine, triangle, square and saw.
- **They see.** The numbers written as the table writes them, changing with the sliders; the engine's mode; the count
  of sounds made, one per release. They hear the click become a note, the note become a pad, the triangle become a
  buzz.
- **Words.** voice, envelope, wave (plain; zzfx voice is page 1's).
- **Teaches.** `sound-voice.ts`: `VOICE`, `cueOf`, `makeSound`.

## 3. A recording, with a voice behind it

- **Idea.** A cue holds a pack's recording for the sound it wants, and its zzfx voice for every moment that pack is not
  there: still loading, failed to decode, or unloaded. A cue is never silent.
- **The reader does.** Presses play and hears the recording; switches to "the voice only" (`unloadPack`) and presses
  again; switches back.
- **They see.** The cue's `takes` and `voices` side by side in the listing; the engine's mode; the pack's answer,
  `soundInfo("shot")`, flipping between the recording and the voice. They hear a decoded file, then the saw under it.
- **Words.** pack, take (plain), fallback (plain).
- **Teaches.** `sound-take.ts`: `CUES`, `packOf`, `makeSound`.

## 4. The mix: one desk for every cue

- **Idea.** Every cue plays on a bus: a fader, a chain of effects and a few sends. The mix is one surface, and the desk
  tunes it by ear while the game plays; what it writes is a `mix.json` the game hands back to `createSound`.
- **The reader does.** Starts a round of cues playing, pulls the `ambience` fader down, mutes `ui`, unmutes it, and
  mutes `ambience` to hear what the room has left.
- **They see.** Three faders at the table's own levels and three mutes beside them; the round playing or stopped. They
  hear a group fall away and come back without any cue being rebuilt, and the reverb ring on after its bus is muted.
- **Words.** bus (sound), level and send (plain), scene (plain), the sound desk (plain).
- **Teaches.** `sound-levels.ts`: `CUES`, `LEVELS`, `BUSES`. The `mix.json` block is quoted from
  [sound-mix](../sound-mix.md).

## 5. Music and scenes, per tier

- **Idea.** A score is loops of one pack, locked to a clock and arranged into sections. A tier is a section of the
  score and a scene of the mix: what the game is doing, heard.
- **The reader does.** Starts the score and switches between three tiers, up and back down.
- **They see.** The section per tier (which stems, how loud) and the scene per tier (how far the room opens) as the
  listings; the engine's mode and the stems the tier hears. They hear the bass arrive on the bar line, the drums a tier
  later, the room open with them, and a bell on every change.
- **Words.** stem (plain), section (plain), transport (plain). Pack is page 3's.
- **Teaches.** `sound-tiers.ts`: `SECTIONS`, `SCENES`, `makeSound`.

## 6. Under it: the DSP core

- **Idea.** Every voice, bus, effect and the clock itself run in one WebAssembly worklet the engine ships. A cue's
  voice is rendered once and frozen into a sample; the instruments, the music and the mix are made a block at a time.
- **The reader does.** Presses thump, then bell, and watches the core's own meters; presses them together.
- **They see.** Five bars — level, bass, mid, high and flux — a still until the first press and moving after it, with
  the engine's mode and the context's sample rate beside them. They hear the low band jump on a thump and the high band
  on a bell.
- **Words.** core and worklet (plain), limiter (plain), fallback (plain; the engine's own word for what plays without
  the core).
- **Teaches.** `sound-core.ts`: `CUES`, `FIGURES`. The reference is [the instruments](../sound-dsp.md), and the front
  page's sound sheet is the same tap drawn as a shader.
