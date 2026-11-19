// Sound, step 2: a voice is a handful of numbers, and retuning one is writing different numbers in the table. The
// panel's sliders build a voice a set at a time and play it when the reader lets go.
import * as Sound from "watchpot/sound";
import { Code, definePage, Note, Panel, Term, Try } from "../../kit";
import { Voice } from "../demos/voice";

export default definePage({
  title: "A voice: zzfx, and retuning it",
  idea: (
    <>
      A zzfx voice is a wave and an envelope, written as numbers. Change a number and you have a different
      sound: the table is read when the sound is made, so the change is a new sound, not a live one.
    </>
  ),
  game: {
    file: "sound-voice.ts",
    store: false,
    keep: "memory",
    clock: false,
    externals: { "watchpot/sound": Sound },
  },
  code: {
    voice: { at: "VOICE" },
    cue: { at: "cueOf" },
    sound: { at: "makeSound" },
  },
  Panel: () => (
    <Panel title="One voice, retuned">
      <Voice />
    </Panel>
  ),
  Body: () => (
    <>
      <p>
        The last page's three cues were all <Term id="zzfx-voice">zzfx voices</Term>. zzfx is a tiny
        synthesiser: it reads a list of numbers and writes a sound wave out of them. Nothing is sampled and
        nothing is stored, so a voice costs a few bytes in a table, and it can sound before any file has
        loaded.
      </p>
      <p>Here is one voice on its own, with the numbers this page's sliders hold:</p>
      <Code id="voice" />
      <p>
        Four of those numbers do most of the work. <code>wave</code> is the shape of the wave: a sine is
        smooth, a triangle is a little brighter, a square is hollow and loud, a saw buzzes.{" "}
        <code>frequency</code> is the pitch, in hertz, and every doubling is an octave. <code>sustain</code>{" "}
        is how long the note holds before it starts to die, and <code>release</code> is how long that death
        takes: a few milliseconds is a click, a quarter of a second is a note.
      </p>
      <p>A cue is a list of those voices, so the cue is where the numbers are written:</p>
      <Code id="cue" />
      <p>
        And here is the fact this page is really about. <code>createSound</code> renders a cue's voices to one
        buffer when the sound is made, and plays that buffer for every press after it. A voice is not a knob
        on a running engine: it is a decision made once, in the table. Retuning one means a new table, and a
        new sound:
      </p>
      <Code id="sound" />
      <Note title="So why does the panel make a new sound on every release?">
        <p>
          Because that is what the engine asks for. The page's sliders are a stand-in for the seconds you
          would spend editing the numbers in the file and reloading: each release builds the same table with
          new numbers, which is a new <code>createSound</code>. A game does this at build time and gets it
          right once, by ear, and then never again at run time.
        </p>
      </Note>
      <Try>
        <li>
          Drag the pitch to the top and let go: the same voice, well over an octave above where it started,
          and no longer than it was.
        </li>
        <li>
          Set sustain near 400 ms and release to 800 ms: the click becomes a held note. The panel counts the
          sounds it has made, so you can see each release is a new one.
        </li>
        <li>Switch the wave from triangle to square, then to sine: same three numbers, a different sound.</li>
        <li>
          Set pitch low, sustain long, wave square: that is the shape of a bass note or a warning buzz, out of
          the numbers alone.
        </li>
      </Try>

      <h2>What the numbers cannot do</h2>
      <p>
        A voice is a single oscillator with an envelope. It cannot be a chord, a hiss, a voice saying a word,
        or the sound of a real object: the numbers run out. zzfx has a few more of them — <code>slide</code>{" "}
        bends the pitch, <code>noise</code> mixes in hiss, <code>filter</code> takes the top off — and the
        engine's own preset voices use them. When a sound needs more than an oscillator, a game records it,
        and that is the next page.
      </p>
    </>
  ),
});
