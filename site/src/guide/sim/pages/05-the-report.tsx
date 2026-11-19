// Sim, step 5: the report, and the desk. Reading a real fit's report, the longest wait it names, a pacing contract
// judged on the same run, and the desk that runs it all for a game.
import * as Sim from "watchpot/sim";
import { Code, definePage, Note, Panel, Term, Try } from "../../kit";
import { ReportPanel } from "../demos/report";

export default definePage({
  title: "Reading the report, and the desk",
  idea: (
    <>
      The report is the run written down: each gate, the minute it was planned for, the price it got, and the
      wait between them. The desk is the one command that plays it, turns its knobs, and keeps the runs.
    </>
  ),
  game: {
    file: "sim-oven.ts",
    store: false,
    keep: "memory",
    clock: false,
    externals: { "watchpot/sim": Sim },
  },
  code: {
    report: { at: "readReport" },
    wait: { at: "longestWait" },
    contract: { at: "CONTRACT" },
    desk: { at: "desk" },
  },
  Panel: () => (
    <Panel title="The report, and what it names">
      <ReportPanel />
    </Panel>
  ),
  Body: () => (
    <>
      <p>
        A fit you cannot read is a fit you will not use. <code>formatFit</code> prints its run as a table, one
        row a <Term id="gate">gate</Term>: the key, the minute it was planned for, the minute it opened, and
        the price it got. The panel prints the very text the oven's script prints, which is what a report is:
        the table, and a line or two under it.
      </p>
      <Code id="report" />
      <p>
        The first thing to read is the distance between the two minute columns. A gate that opened late is the
        plan being out of reach of the pilot, and one that opened at once but at a price far below what the
        plan imagined is income running ahead of the curve. Neither is visible in the prices alone.
      </p>
      <h2>The longest wait</h2>
      <p>
        The second thing is the gap between one gate opening and the next. A player does not feel a price;
        they feel the stretch with nothing to do in it. The oven's plan leaves two minutes between the hood
        and the jacket, and the report names that: it is the wall the plan has, and the row a player would
        complain about.
      </p>
      <Code id="wait" />
      <p>
        A wait is only as fine as what the run samples, which is why the desk samples as it plays rather than
        reading the gates after. The number here is the gap between two gates opening, which is the same thing
        once a run buys each gate once.
      </p>
      <h2>The pacing contract</h2>
      <p>
        A fit says what a gate costs; it does not say the game feels right. That is a{" "}
        <Term id="pacing-contract">pacing contract</Term>: what a number should be at a point in the run,
        written as a <Term id="band">band</Term> with a floor and a ceiling. The oven's is judged on the
        plan's own run, at the minutes the plan opens its gates:
      </p>
      <Code id="contract" />
      <p>
        The bands are drawn from a real run with room either side, never from a guess, and the run they came
        from is recorded beside them. On the panel each band is marked in or out. A band that misses is either
        the plan's problem or the band's; a contract is a check you tune as the game's content lands, not a
        law.
      </p>
      <h2>The desk</h2>
      <p>
        Everything so far is a script the game owns. The desk is the one that runs it: a game's{" "}
        <code>sim.desk.ts</code> default-exports what to play and how. It says the game's words and knobs, the
        currency progress is measured in, the files whose change invalidates a cached run, where a run ends,
        and a function that builds a fresh run for a seed or resumes one.
      </p>
      <Code id="desk" />
      <p>
        <code>windowHours</code> is how wide a window the desk's charts cover, and <code>seeds</code> is how
        many runs a tuning pass takes against a full report. <code>watchpot sim</code> serves the desk on the
        game's own machine, imports its <code>sim.desk.ts</code> as it is, and opens it in a browser. The
        panel's last block is what the oven's desk says about itself here: one currency, six minutes a run,
        one knob.
      </p>
      <Try>
        <li>Press "Fit and read the report": the table, the run's finish, and the longest wait.</li>
        <li>
          Find the wall in the table. The caption under the report names two minutes; the rows that open at
          those minutes are the hood at 0:02 and the jacket at 0:04.
        </li>
        <li>
          Read the prices down the table. The bellows cost 48 and the jacket 2,500: the plan's minutes are
          what make that difference, not the fittings.
        </li>
        <li>The contract marks each band in or out against the run. All four are in.</li>
      </Try>
      <Note title="What a fit cannot tell you">
        <p>
          One run of one seed is a ballpark. A fit says the plan is reachable and its table proves; it does
          not say the game is fun, that the content lasts, or that another seed plays the same. That is what
          the contract and a person playing are for. Fit again after any change to the plan or to how fast the
          pilot earns, and play the game.
        </p>
      </Note>
    </>
  ),
});
