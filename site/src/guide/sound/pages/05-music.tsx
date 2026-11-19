// Sound, step 5: music and scenes, per tier. One score of loops, a section per tier that brings its stems in, and
// a scene per tier that opens the room with it. The panel switches tier and the score changes on the bar line.
import * as Sound from "watchpot/sound";
import { Code, definePage, Note, Panel, Term, Try } from "../../kit";
import { Tiers } from "../demos/tiers";

export default definePage({
  title: "Music and scenes, per tier",
  idea: (
    <>
      A score is loops of one pack, locked to a clock, arranged into sections. A tier is a section of the
      score and a scene of the mix: what the game is doing, heard.
    </>
  ),
  game: {
    file: "sound-tiers.ts",
    store: false,
    keep: "memory",
    clock: false,
    externals: { "watchpot/sound": Sound },
  },
  code: {
    sections: { at: "SECTIONS" },
    scenes: { at: "SCENES" },
    score: { at: "makeSound" },
  },
  Panel: () => (
    <Panel title="One score, three tiers">
      <Tiers />
    </Panel>
  ),
  Body: () => (
    <>
      <p>
        A cue is a sound. Music is a thing that is still there: loops of a <Term id="pack">pack</Term>,
        running on the engine's own clock, and a score says which of them play and how loud.
      </p>
      <p>
        The loops are stems, one file each, cut to a whole number of bars at the pack's tempo. This page's
        pack is three: a pad, a bass and drums. A section is a set of stem levels, and a stem the section
        leaves out is silent. Here are this page's three tiers:
      </p>
      <Code id="sections" />
      <p>
        That is the whole arrangement. Nothing is crossfaded by hand and nothing is timed from the page:{" "}
        <code>music.section("busy")</code> waits for the next bar line and fades the stems over that bar, and
        a loop that arrives late comes in on the beat, sample for sample where it would have been. The engine
        keeps the beat as an anchor rather than a running sum, so ten minutes of it drift by no frames at all.
      </p>
      <p>The same tier is also a change to the mix, and that is a scene:</p>
      <Code id="scenes" />
      <p>
        A scene says only what it changes, and everything it leaves out stays as the mix has it. So the three
        tiers are one mix and three sentences about it: the room opens as the tier climbs, and no bus, effect
        or send is written twice. A game whose tiers are its scenes has one mix to tune, and a line per tier.
      </p>
      <Code id="score" />
      <p>
        The score and the sound are one object, and the score's first use sets the tempo, the key and starts
        the clock. After that it is two calls per change of tier, which is why a game can afford to change it
        on every state change it has: <code>section</code> and <code>scene</code>.
      </p>
      <Note title="Where the loops on this page come from">
        <p>
          The three stems are written in the browser when you press Start: one bar each, at 100 beats a
          minute, so they meet themselves at the ends and the core can loop them against the transport. A
          game's own are recordings, cut by <code>buildPack</code> to whole bars at one tempo; the engine
          cannot tell the difference.
        </p>
      </Note>
      <Try>
        <li>Press "Start the score": the pad alone, the room deep around it. That is the quiet tier.</li>
        <li>
          Switch to busy: the bass comes in on the next bar line, and the room opens. Switch to peak: the
          drums arrive, and the room opens further.
        </li>
        <li>
          Switch back down. The stems fade out and the room closes again. Nothing restarts, and the loops keep
          their place in the bar throughout.
        </li>
        <li>
          A bell rings on every change: <code>music.stinger("bell")</code>, a cue from the same table, played
          by the score on the grid and in key.
        </li>
      </Try>

      <h2>Layers, and one number the game already has</h2>
      <p>
        A score also has <code>layers</code>: loops no section moves, each at a level the game sets and keeps.
        That is for a part that follows a number of the game's rather than a tier — a drone that rises with
        the heat, a pulse that quickens as a boss winds up. The same idea is on the mix side as the mod
        matrix: <code>sound.mod</code> maps a number of the game's onto a bus level, a send or an effect
        setting, so one line of state can open the room as the danger rises.
      </p>
      <p>
        Both are the same bargain as the rest of the engine: the game says what it knows, and the sound
        follows. Nothing in a game ever waits for the beat; the core does that part.
      </p>
    </>
  ),
});
