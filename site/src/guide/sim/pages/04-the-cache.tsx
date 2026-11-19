// Sim, step 4: the cache. Snapshots a fit leaves, what a change invalidates, and a fit carried on from the last one
// that still holds instead of from nothing.
import * as Sim from "watchpot/sim";
import { Code, Controls, definePage, Note, Panel, stepper, Term, Try } from "../../kit";
import { CachePanel } from "../demos/cache";

export default definePage({
  title: "The cache: carry on from a snapshot",
  idea: (
    <>
      A long fit leaves a snapshot every so often. Move something at the end of the plan and the fit carries
      on from the last snapshot that still holds, instead of playing the hours before it again.
    </>
  ),
  game: {
    file: "sim-oven.ts",
    store: false,
    keep: "memory",
    clock: false,
    externals: { "watchpot/sim": Sim },
  },
  params: {
    from: stepper({
      at: "AT_MIN",
      find: "AT_MIN = 2",
      token: "2",
      min: 1,
      max: 4,
      step: 1,
      unit: "minute",
      label: "Carry on from",
    }),
  },
  code: {
    cache: { at: "cacheStory" },
    at: { at: "AT_MIN" },
  },
  Panel: () => (
    <Panel title="A fit, and a second fit on top of it">
      <CachePanel />
    </Panel>
  ),
  Body: () => (
    <>
      <p>
        The oven's fit is a few seconds. A real game's is hours of played time at a step a second, minutes of
        real time, and every price you move at minute 200 sends you back to the start. That is what the cache
        is for.
      </p>
      <p>
        A fit given <code>snapshotEveryMs</code> leaves a <Term id="snapshot">snapshot</Term> every so many
        played minutes, and one where it ends. A snapshot is the whole sim at that moment as plain data: the
        world (the store's state and the sim's clock), the pilot's memory, the fit's own progress and table,
        and whatever the game keeps besides. It is exact, Decimals and all, because a run resumed from an
        inexact one parts from the run that never stopped.
      </p>
      <Code id="at" />
      <p>
        The panel's control is the minute the second fit starts at, and its snapshots come one a minute. What
        it may do with that snapshot is the interesting part, and there are three answers.
      </p>
      <h2>What a snapshot is good for</h2>
      <ul>
        <li>
          <strong>The plan, before it.</strong> If a gate planned at or before the snapshot's minute moved,
          appeared or went, the snapshot was taken under a plan that no longer exists, and{" "}
          <code>fitHolds(snapshot, gates)</code> names it. A fit asked to carry on from one throws rather than
          price a plan it was not taken under.
        </li>
        <li>
          <strong>The plan, after it.</strong> Move a gate that was planned later and nothing before the
          snapshot changed: the fit carries on, prices only the gates still unpriced, and lands where a fit
          from nothing would have. That is the case worth having, because it is the usual one: you play the
          plan, find a wall at minute 90, and move something at minute 120.
        </li>
        <li>
          <strong>The rules.</strong> A rate, a multiplier, the pilot's own rules: the kit cannot see any of
          them. A change that could act before the snapshot makes it another run's, and no check will tell
          you. Drop the snapshots after the earliest moment the change can act, or fit from nothing when it
          acts everywhere.
        </li>
      </ul>
      <p>
        The step and the look cadence are checked too, because a fit resumed at a different step is not the
        same run.
      </p>
      <h2>Carrying on</h2>
      <p>
        <code>runFit({"{ from }"})</code> takes the snapshot's table, gates and step count, asks only the
        gates still unpriced, and plays on. What is left is the choice of which snapshot:{" "}
        <code>latestSnapshot(snapshots, at)</code> is the latest at or before a minute that{" "}
        <code>fitHolds</code> accepts, which is how a script's <code>--from=&lt;minute&gt;</code> picks one.
      </p>
      <Code id="cache" />
      <Controls />
      <Try>
        <li>
          Leave "Nothing" and press. Five snapshots, a fit carried on from 2:00, and the same table a fit from
          nothing wrote, because nothing moved.
        </li>
        <li>
          Pick "The hood, to 1:00" and press. The cache is refused, and it says why: the hood is planned
          before the snapshot and was not then. Start again from nothing.
        </li>
        <li>
          Pick "The jacket, to 5:00" and press. The plan still holds: the fit carries on from 2:00, the
          bellows and the hood keep the prices the snapshot had, and the jacket is priced at 5:00 instead of
          4:00, from a pilot who has been earning a minute longer.
        </li>
        <li>
          Move the control to 1:00 and carry on from there: the same run, from a minute earlier. Move it to
          4:00 and the jacket's own minute is the snapshot's, so the jacket move is refused as well: a gate
          planned at the snapshot's moment counts as before it.
        </li>
      </Try>
      <Note title="Where a snapshot lives">
        <p>
          The engine never picks a file. <code>encodeSnapshot</code> gives the text and{" "}
          <code>decodeSnapshot</code> reads it, and a script writes it wherever it likes: a{" "}
          <code>sim/out/snap-90.json</code> beside the game's sim, say. The same text is what a proof's
          stretches replay from, so a snapshot is worth keeping for both.
        </p>
      </Note>
    </>
  ),
});
