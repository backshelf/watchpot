// Sim, step 3: the fit and its proof. The loop that plays the plan and prices each gate as its minute comes, the two
// ways to round a price, the snapshots a fit leaves, and the replay that must arrive at each of them.
import * as Sim from "watchpot/sim";
import { Code, Controls, choice, definePage, Note, Panel, Term, Try } from "../../kit";
import { FitPanel } from "../demos/fit";

export default definePage({
  title: "The fit: pricing the gate, then proving it",
  idea: (
    <>
      The fit plays the game with every gate shut, and prices each one at the minute the plan gives it, from
      what the pilot holds then. Then it proves the table by playing it again.
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
    price: choice({
      at: "gatesOf",
      find: "price: () => abovePeak(have),",
      token: "abovePeak(have)",
      label: "A gate is priced",
      options: [
        { label: "Above the peak", code: "abovePeak(have)" },
        { label: "Nine tenths of what is held", code: "payNow(have)" },
      ],
    }),
  },
  code: {
    fit: { at: "fitPlan" },
    above: { at: "abovePeak" },
    pay: { at: "payNow" },
    run: { at: "ovenRun" },
  },
  Panel: () => (
    <Panel title="Fit, then prove">
      <FitPanel />
    </Panel>
  ),
  Body: () => (
    <>
      <p>
        A fit is one pass over the plan, in time order. It shuts every gate in the table, plays the oven with
        the pilot in it, and as each planned minute comes it asks that gate for a price. The answer goes into
        the table at once, so the pilot can pay it the moment it is set, and the run carries on with it. One
        pass, and the whole game is priced.
      </p>
      <Code id="fit" />
      <p>
        Everything in that call is either the run or the plan. <code>step</code> and <code>look</code> are the
        game and the pilot; <code>playedMs</code> is how much play has gone by, which is what the plan counts;{" "}
        <code>done</code> says the game is finished; <code>afterStep</code> takes the readings a price is
        worked out from. The only thing the loop insists on is the plan: a gate opens at its minute or after
        it, never before.
      </p>
      <h2>What a gate's price is</h2>
      <p>
        <code>price()</code> is the game's, not the engine's, and how it rounds is the whole of the fitting.
        The oven offers two. The first is what a provable table uses:
      </p>
      <Code id="above" />
      <p>
        Strictly above the most the pilot has ever held, rounded to a figure a player can read. A gate priced
        that way cannot be paid before the fit priced it, because nothing that has been held yet reaches it.
        The pilot pays it moments after its minute, which is the point.
      </p>
      <Code id="pay" />
      <p>
        The second rounds the other way: nine tenths of what was held lately, so the pilot pays at once. Most
        of a game's prices are fine this way. Move the control to it and fit again: same plan, same minutes,
        and every gate opens at its minute, with smaller numbers.
      </p>
      <Controls />
      <h2>The proof</h2>
      <p>
        A table can be wrong in a way the fit cannot see. During the fit each gate was shut until its moment,
        so the pilot could not buy it early; in the game the player gets the finished table, every price in
        place from the start. If a price could have been paid early, the game the player plays is not the game
        that was fitted.
      </p>
      <p>
        A <Term id="snapshot">snapshot</Term> is how the fit checks that. With <code>snapshotEveryMs</code> it
        leaves one every so often: the whole sim at that moment, as plain data, with the fit's own table and
        step in it. A <Term id="proof">proof</Term> then plays the finished table again, from nothing to the
        first snapshot and from each snapshot to the next, and asks whether each stretch arrives exactly where
        the fit stood.
      </p>
      <Code id="run" />
      <p>
        The replay is the same run builder the fit used, handed a snapshot instead of nothing: the world
        restored to the snapshot's moment, the pilot's memory with it, and every price in the table from the
        first step. Nothing has to match by name; it matches because it is the same game, played the same way.
      </p>
      <Try>
        <li>
          Press "Fit the plan". Three gates, each priced at its minute, and the run finished a few seconds
          after the last one.
        </li>
        <li>Press "Prove the table". Five stretches, and each one arrives where the fit stood.</li>
        <li>
          Switch the price to "nine tenths of what is held" and fit again, then prove it. The proof parts at
          the first snapshot: the replay had the bellows already, and the fit's run did not. The table plays
          earlier than it was priced.
        </li>
        <li>
          Read one parting line: the first is a Decimal written as its parts (86 bubbles in the replay against
          34 in the fit), and <code>.world.state.oven.fittings.0</code> is the bellows, there in the replay
          and not in the fit. That is what a wrong rounding looks like.
        </li>
      </Try>
      <Note title="A draft, and the step">
        <p>
          A fit runs at <code>exact</code>, a second a step, unless you ask for a coarser one:{" "}
          <code>quick</code> reads the curve in a tenth of the time, a draft you play before it is proved. The
          proof replays at the fit's own step, so a quick fit proved at quick says nothing about the same
          table at exact.
        </p>
      </Note>
    </>
  ),
});
