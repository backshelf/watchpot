// Sound, step 3: a cue with a recording from a pack and the voice behind it. The panel plays the recording, then
// frees the pack and plays the same cue again: the voice is still there, and nothing went silent.
import * as Sound from "watchpot/sound";
import { Code, definePage, Note, Panel, Term, Try } from "../../kit";
import { Take } from "../demos/take";

export default definePage({
  title: "A recording, with a voice behind it",
  idea: (
    <>
      A cue holds both: a pack's recording for the sound it wants, and its zzfx voice for every moment the
      pack is not there. A cue is never silent, and never a silence waiting to be filled.
    </>
  ),
  game: {
    file: "sound-take.ts",
    store: false,
    keep: "memory",
    clock: false,
    externals: { "watchpot/sound": Sound },
  },
  code: {
    take: { at: "CUES" },
    pack: { at: "packOf" },
    sound: { at: "makeSound" },
  },
  Panel: () => (
    <Panel title="The shot, two ways">
      <Take />
    </Panel>
  ),
  Body: () => (
    <>
      <p>
        A synthesised voice will do for a click, a coin, a tick. It will not do for a door, a footstep or an
        explosion. For those a game records the sound, and ships it in a <Term id="pack">pack</Term>: a folder
        of files and a manifest, which the engine loads and plays.
      </p>
      <p>Here is the cue that has one, from the same table as the last page's:</p>
      <Code id="take" />
      <p>
        Two lists, and the order between them is the whole idea. <code>takes</code> are recordings from a
        loaded pack, and <code>voices</code> are the zzfx voice. A play reaches for a take when one is ready,
        and falls back to the voice when none is: while the pack is still downloading, on a device that failed
        to decode it, or while it is unloaded to make room. A cue is never silent, and never a hole where a
        sound should be.
      </p>
      <p>A pack is a manifest of what is in it, and the files themselves:</p>
      <Code id="pack" />
      <p>
        Each entry says where the file is, how long it is, its loudness and its peak as the build measured
        them, and what kind of sound it is. A load fetches and decodes the files and hands them to the core;
        an unload frees them, and the cue is back on its voice. Both are one call on the sound:
      </p>
      <Code id="sound" />
      <Note title="Where the recording on this page comes from">
        <p>
          There are no audio files in this site's repository, so the panel writes one: a plucked tone in the
          browser, as a WAV, handed to the engine as the pack's <code>shot</code>. The engine cannot tell the
          difference between that and a file <code>buildPack</code> cut from a download — it is decoded,
          uploaded and played the same way. A real pack is a folder of <code>shots/</code>,{" "}
          <code>loops/</code> and <code>irs/</code>, run through the build once:{" "}
          <a href="../sound-packs.html">sound packs</a> is how.
        </p>
      </Note>
      <Try>
        <li>Press play: the recording, a short pluck with no synth in it.</li>
        <li>
          Switch to "the voice only". That is <code>unloadPack("demo")</code>: the same press, and the cue
          plays its <code>voices</code> instead.
        </li>
        <li>Switch back and press again: the recording returns, and no part of the game changed.</li>
        <li>
          Watch the readout for what a press plays. It is <code>soundInfo("shot")</code>, the engine's own
          answer, and it is the honest one: ask it rather than believe the table.
        </li>
      </Try>

      <h2>One cue, one recording, many presses</h2>
      <p>
        A cue's takes are a list, and one is picked per play: a shuffled bag by default, so a footstep is
        never the same file twice in a row. A take may say a range of <code>velocity</code> it answers to,
        which is how a hard press gets the hard recording, and how a cue's recording sounds different each
        time without a single number changing at run time.
      </p>
      <p>
        A recording also survives things a voice cannot: it has a root note, so a cue marked{" "}
        <code>pitched</code> can be moved onto the harmony clock, and a run of pickups climbs in key off one
        file. That is the music page's business, and so is the pack a score is made of.
      </p>
    </>
  ),
});
