// Sound, step 6: what is under the table. The graph is a Rust crate built to WebAssembly and run in one
// AudioWorklet, and the panel draws the core's own meters: a still until the first press, then the master in five
// figures.
import * as Sound from "watchpot/sound";
import { Code, definePage, Note, Panel, Term, Try } from "../../kit";
import { Meter } from "../demos/core";

export default definePage({
  title: "Under it: the DSP core",
  idea: (
    <>
      Every voice, bus, effect and the clock itself run in one WebAssembly worklet the engine ships. A cue's
      voice is rendered once and frozen into a sample; the instruments and the music are made a block at a
      time.
    </>
  ),
  game: {
    file: "sound-core.ts",
    store: false,
    keep: "memory",
    clock: false,
    externals: { "watchpot/sound": Sound },
  },
  code: {
    figures: { at: "FIGURES" },
  },
  Panel: () => (
    <Panel title="The core's meters">
      <Meter />
    </Panel>
  ),
  next: { href: "../sound-dsp.html", title: "The instruments", label: "Read on" },
  Body: () => (
    <>
      <p>
        The pages so far have all been about a table. Under it is a mixer with no browser parts in it at all:
        a dependency-free Rust crate, built to WebAssembly, running in one <code>AudioWorklet</code>. It is
        committed in the package, so a game configures no asset, no server and no build step for it. The first{" "}
        <code>unlock()</code> adds it from a Blob URL, about 240 KB of WebAssembly before compression.
      </p>
      <p>Inside, one worklet does all of it:</p>
      <p>
        <strong>It keeps the clock.</strong> The transport, the grid a play can wait for, and the key every
        pitched cue is moved onto are on the audio clock, not the page's. Page timers drift; an audio clock
        does not, and anything that must land on a beat is decided there.
      </p>
      <p>
        <strong>It mixes.</strong> Every bus, its chain of effects, the sends between them, the mod routes and
        the scenes are the core's. Commands reach it as little-endian binary records stamped with the frame
        they apply to, so a voice starts on its frame to the sample, and a setting moves on a slew rather than
        a jump.
      </p>
      <p>
        <strong>It ends in a limiter.</strong> Everything leaves through a lookahead limiter: a ceiling of −1
        dBFS, 5 ms late. However many cues land on one frame, the output cannot be louder than the ceiling,
        and the lateness is the same for every sound, so nothing is out of time with anything else.
      </p>

      <h2>What is synthesised, and what is frozen</h2>
      <p>
        A cue's <Term id="zzfx-voice">zzfx voice</Term> is not synthesised while it plays. The first time a
        cue sounds, the core's shell renders its voices to one buffer and uploads it, and every press after
        that plays that sample like any recording. That is why retuning a voice is a new sound, and why a
        table of a hundred cue voices costs a game nothing at run time: each is a fraction of a second of PCM,
        made once.
      </p>
      <p>
        What is made a block at a time, in the core, is everything that cannot be frozen: the transport and
        its sequencer, the instruments (<code>gen</code> for a motor, shaped noise and a struck bank;{" "}
        <code>grain</code>
        for a cloud over a recording; <code>babble</code> for a line of speech-shaped buzz), the reverb and
        the delay tails, and the mix itself. A pack's recordings are the third case: frozen by definition,
        decoded and uploaded as they are.
      </p>
      <p>
        And the meters in the panel are the core's own: the master's level, three bands of it, and its flux,
        about sixty times a second. Here is the code that names the five:
      </p>
      <Code id="figures" />
      <p>
        The bars hold still until the first press because there is no audio before it: no context, no worklet,
        no numbers. Press thump and watch the low band jump and the level fall away; press bell and it is the
        high band. That is a mix being measured, not a picture of one.
      </p>
      <Try>
        <li>
          Press thump once: the left two bars jump, the level and the bass, and the flux spikes at the attack.
        </li>
        <li>Press bell: the right-hand bars, mid and high, and a longer fall.</li>
        <li>
          Press them together, quickly: the limiter is doing its work, and the meter never goes over the top.
        </li>
      </Try>

      <h2>When the core cannot run</h2>
      <p>
        No <code>AudioWorklet</code>, no WebAssembly, or a boot that failed: the engine says so, once, in one{" "}
        <code>console.warn</code>, and <code>mode()</code> reads <code>"fallback"</code>. The fallback plays a
        cue's zzfx voices and the old 0.6 clips through plain Web Audio, and nothing else: no mix, no music,
        no instruments, no meters. It is why every page here still makes a sound on a browser that cannot run
        the core, and why none of the mix pages can: a table of voices is the floor, and everything else is
        the core.
      </p>
      <Note title="The rest of the instrument">
        <p>
          Grains, a freeze that holds a bus's spectrum, generators driven by numbers, a voice that speaks a
          line of text: those are <a href="../sound-dsp.html">the instruments</a>. Every effect, every default
          and every range is in <a href="../sound-mix.html">the mix</a>. And the sound sheet on the front page
          is the whole engine played at once, its tap drawn as a shader:{" "}
          <a href="../../index.html#sound">a mixer in one worklet</a>.
        </p>
      </Note>
    </>
  ),
});
