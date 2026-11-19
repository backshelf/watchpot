// Sound, step 1: a cue, its table and one press of it. Three of Simmer's sounds are pressed in the panel, and the
// page reads the table they came from: what one cue is made of, and what a press says.
import * as Sound from "watchpot/sound";
import { Code, definePage, Panel, Term, Try } from "../../kit";
import { Cues } from "../demos/cues";

export default definePage({
  title: "A cue: the table and the play",
  idea: (
    <>
      A cue is one named sound. The table says what each one is made of, and a screen asks for it by name:{" "}
      <code>sound.play("stir")</code>.
    </>
  ),
  game: {
    file: "sound-cue.ts",
    store: false,
    keep: "memory",
    clock: false,
    externals: { "watchpot/sound": Sound },
  },
  code: {
    table: { at: "CUES" },
    sound: { at: "sound" },
    bubble: { at: "playBubble" },
  },
  Panel: () => (
    <Panel title="Simmer's sound table">
      <Cues />
    </Panel>
  ),
  prev: { href: "../index.html", title: "The docs", label: "Back to" },
  Body: () => (
    <>
      <p>
        A game's sound is one table: every sound it can make, by the name the game calls it, with what that
        sound is made of written beside it. A <Term id="cue">cue</Term> is one row of that table.
      </p>
      <p>
        Simmer has three: a bubble comes up, bubbles come in a row, and the pot boils over. Here is the table
        they come from, whole:
      </p>
      <Code id="table" />
      <p>
        Every one of those three is a <Term id="zzfx-voice">zzfx voice</Term>: a wave, a pitch in hertz, and
        an envelope in seconds. <code>attack</code> is how long it takes to reach full level,{" "}
        <code>sustain</code> how long it holds there, <code>release</code> how long it fades. There is no
        recording anywhere here: a voice is a handful of numbers, and it costs a game nothing to ship.
      </p>
      <p>
        The rest of a row is how that voice behaves. The bubble's <code>vary</code> draws a few cents of pitch
        and a little level per play, so no two taps are quite the same; its <code>placed</code> says a press
        is heard where on the screen it happened. The stir's <code>ladder</code> turns a step number into a
        pitch ratio, so one note climbs a run. The overflow has two layers, the second one starting{" "}
        <code>at</code> 0.08 seconds, and a <code>priority</code> that keeps it when the engine is out of
        voices.
      </p>
      <p>The table becomes a sound in one call:</p>
      <Code id="sound" />
      <p>
        Nothing is loaded and nothing plays yet. <code>createSound</code> reads the table and returns the
        thing a screen talks to; <code>unlock()</code>, called on the reader's first press, is what makes an{" "}
        <code>AudioContext</code> and starts the core. A game wraps that in the names its screens use:
      </p>
      <Code id="bubble" />
      <p>
        A screen now says <code>playBubble(button)</code> and never a wave or a frequency. The press says
        three things worth knowing. <code>velocity</code> is how hard it was, 0 to 1: it picks among takes
        recorded for different strengths, and the level follows it (20 log10 of it, so half as hard is 6 dB
        down). <code>step</code> is the rung of the cue's ladder. <code>mine: true</code> is the player's own
        hand, and the engine treats it gently: the overflow is marked so, and a play marked so is never held
        back or turned down.
      </p>
      <Try>
        <li>Press bubble a few times. It is the same cue each time, and never quite the same sound.</li>
        <li>
          Press stir four times: it climbs a rung a press, through the five ratios its <code>ladder</code>{" "}
          holds.
        </li>
        <li>
          Press overflow: two notes, the second a fifth above the first, 80 ms after it. Nothing about that is
          in the press; it is all in the row.
        </li>
        <li>
          Watch the readout under the pads. <code>soundInfo("bubble")</code> says the cue is zzfx voices, and
          how many seconds it lasts: the engine will tell you what a cue plays right now, and a later page
          changes that answer.
        </li>
      </Try>

      <h2>What the engine does with a play</h2>
      <p>
        <code>play</code> is not "make this sound". A hundred buys a second is a hundred cues, and a game
        cannot hear a hundred. The <Term id="governor">governor</Term> sits between the press and the speakers
        and decides what actually sounds: a cue with a <code>cooldownMs</code> is skipped inside it, a cue
        asked for more often than <code>roll.above</code> times a second becomes one held voice that follows
        the rate, and a play far quieter than what is already ringing is dropped. The overflow's{" "}
        <code>priority</code> is the same idea at the other end: when every voice is busy, the quietest of the
        lowest priority goes first.
      </p>
      <p>
        None of that is in the table above, because none of these three cues can flood: three presses a second
        is no flood. A cue behind a shop button, or a hit on every enemy in a wave, needs a line of it.
      </p>
      <p>
        One thing is missing from every row here: none of them is a recording. A voice will do for a coin and
        never for a door, and a cue can hold both. That is the third page.
      </p>
    </>
  ),
});
