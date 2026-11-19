// Sound, step 4: the mix. Every cue plays on a bus, a bus is a fader and a chain of effects, and the desk sets
// them while the game plays. The panel moves a level and mutes a group over a round of cues.
import * as Sound from "watchpot/sound";
import { Code, definePage, Note, Panel, Term, Try } from "../../kit";
import { Levels } from "../demos/levels";

export default definePage({
  title: "The mix: one desk for every cue",
  idea: (
    <>
      Every cue plays on a bus. A bus is a fader, a chain of effects and a few sends, and the mix of them is
      one surface the desk tunes by ear while the game plays.
    </>
  ),
  game: {
    file: "sound-levels.ts",
    store: false,
    keep: "memory",
    clock: false,
    externals: { "watchpot/sound": Sound },
  },
  code: {
    cues: { at: "CUES" },
    levels: { at: "LEVELS" },
    buses: { at: "BUSES" },
  },
  Panel: () => (
    <Panel title="Three buses and a room">
      <Levels />
    </Panel>
  ),
  Body: () => (
    <>
      <p>
        Ten cues all at their own volume is not a mix. A <Term id="bus-sound">bus</Term> is where cues of a
        kind meet: a fader that turns them all down together, effects in a chain and sends to other buses.
        Five are there from the start — <code>sfx</code>, <code>ui</code>, <code>music</code>,{" "}
        <code>ambience</code>, <code>voice</code> — and a cue names the one it plays on. Here is this page's
        table and its levels:
      </p>
      <Code id="cues" />
      <Code id="levels" />
      <p>
        And the mix itself: a level on each bus, and one more bus, <code>room</code>, that nothing plays on.
        It is a reverb, and the other two send a little of themselves to it. One room, three things in it:
        that is worth more than three separate reverbs, because the three cues sound like they are in the same
        place.
      </p>
      <Code id="buses" />
      <p>
        A level is the mix's own: dB on the fader, and it is what the desk moves. A player's volume is a
        second, separate fader on the same bus, 0 to 1, and the panel's mute is that one:{" "}
        <code>mixer.setBusVolume("ui", 0)</code>. Two faders rather than one, so that a settings slider in the
        game never rewrites the mix the desk spent an afternoon on.
      </p>
      <Note title="The desk, and mix.json">
        <p>
          <code>sound.desk</code> is every number of the mix as one live surface: each level, each send, each
          effect setting, a trim and a mute per bus, the structure of the buses themselves, and the recordings
          a cue plays. What it writes is a file, and the file is the mix: the game imports it and hands it to{" "}
          <code>createSound</code>, in development and in production both. Quoted from{" "}
          <a href="../sound-mix.html">the mix</a>:
        </p>
        <pre className="guide-snippet">
          <code>{`import mix from "./mix.json";
const sound = createSound({ cues, buses, scenes, mix });`}</code>
        </pre>
        <p>
          The desk opens in a window of its own, laid out as a mixer: a column a bus, the selected bus's
          effects in a row along the bottom, a pane of the sounds that have played. It is a development tool;
          the game ships the file, not the desk.
        </p>
      </Note>
      <Try>
        <li>Press "Play a round" and let it run while you read the next line.</li>
        <li>
          Pull the <code>ambience</code> fader down: the long tone drops away and the ticks stay where they
          are. Nothing else changes, and no cue is rebuilt.
        </li>
        <li>
          Mute <code>ui</code>: the short top-end ticks go silent, and everything else keeps playing. Unmute
          it and it is back at the level it had.
        </li>
        <li>
          Mute <code>ambience</code> and listen to the room: what is left of it is the other buses' sends, and
          the reverb rings on a little after they stop.
        </li>
      </Try>

      <h2>Groups are a shape, not a label</h2>
      <p>
        A bus may say which bus it sums into (<code>out</code>), so a game can have groups inside groups: five
        weapon sounds, each its own bus, all of them into <code>sfx</code>, and one fader for the lot. The
        engine allows fifteen buses in all, each with up to eight effects, and any of them can send to any
        other.
      </p>
      <p>
        The mix is safe to set before the first press: levels, sends, scenes and routes all remember what they
        were told and send it when the core comes up. That is why a game can declare its whole mix in the same
        call as its cue table, and why the panel above has faders that work before it has made a sound.
      </p>
    </>
  ),
});
