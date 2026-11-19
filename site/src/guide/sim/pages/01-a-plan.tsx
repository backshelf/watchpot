// Sim, step 1: a plan. The gates a game opens, the played minute each should open at, and what those minutes come to
// once the fit prices them. The panel prices the plan on a press, and the hood's planned minute is a control.
import * as Sim from "watchpot/sim";
import { Code, Controls, definePage, Note, Panel, slider, Term, Try } from "../../kit";
import { PlanPanel } from "../demos/plan";

export default definePage({
  title: "A plan: the gates and their minute",
  idea: (
    <>
      A plan is the pacing you meant, written down: one gate for each thing a player can open, and the played
      minute it should open at. A fit turns each minute into a price.
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
    hood: slider({
      at: "PLAN",
      find: "hood: 2,",
      token: "2",
      min: 1,
      max: 6,
      step: 1,
      unit: "minute",
      label: "The hood opens at",
    }),
  },
  code: {
    plan: { at: "PLAN" },
    table: { at: "PRICES" },
    gates: { at: "gatesOf" },
  },
  Panel: () => (
    <Panel title="The plan, priced">
      <PlanPanel />
    </Panel>
  ),
  Body: () => (
    <>
      <p>
        A game's pacing is what a player can open, and when. The <Term id="sim-lab">sim lab</Term> can check a
        game after it plays it, but a game with forty things to buy is past that: every price you move moves
        all the ones after it. So the sim also goes the other way round. You write down the minute each thing
        should open, and the sim works out the prices.
      </p>
      <p>
        The thing that opens is a <Term id="gate">gate</Term>: a purchase, a shelf row, a page that appears at
        a figure. A <Term id="plan-and-fit">plan</Term> is a record from gate to minute, and it is the game's,
        written beside the gate's own code. Here is the oven's, all three gates of it:
      </p>
      <Code id="plan" />
      <p>
        The minutes are <Term id="played-hours">played hours</Term> and played minutes: time with someone at
        the game, not hours of a tab left open. Nobody starts an idle game and goes idle, so the first stretch
        of a game is played straight, however long its sessions are later. A plan is written for that person.
      </p>
      <p>
        Why a minute, and not a price? Because a minute is the one thing you can judge without knowing the
        economy. You know a player should have the hood by the time they have been at the oven two minutes;
        you do not know, before you play it, whether that is 300 bubbles or 3,000. The minute is the intent;
        the price is what falls out of it, and it falls out of the run.
      </p>
      <h2>The table the game reads</h2>
      <p>
        Every gate's price lives in one live table. It starts empty, and a gate it does not hold costs{" "}
        <code>BLOCKED</code>: a big enough number that nothing on the shelf can be bought before it is priced.
      </p>
      <Code id="table" />
      <p>
        A gate is a key, its minute, and a <code>price()</code> the fit asks when the minute comes. The oven's
        three are the same gate three times over:
      </p>
      <Code id="gates" />
      <p>
        <code>price()</code> answers with a string: the figure a player will read, rounded however the game
        wants it. Rounding it above the most the pilot has ever held is what makes the table provable later
        (page 3); rounding it at nine tenths of what was held is what makes it payable the moment the minute
        comes. The fit asks again on every step until it answers, so a gate can also wait for something else
        to be true first.
      </p>
      <Controls />
      <Try>
        <li>Press "Price the plan". Each gate gets a price and the minute it actually opened.</li>
        <li>
          Slide the hood's minute to 6. Price it again: the hood now opens last, and the jacket, still planned
          for 4:00, costs less than it did, because the hood's doubling comes later and the pilot earns less
          by then.
        </li>
        <li>
          Slide it to 1: the hood and the bellows open in the same minute, the pilot earns at double the rate
          from then on, and the jacket costs more again. The plan is minutes; the prices follow it.
        </li>
      </Try>
      <Note title="What this is not">
        <p>
          A plan is for a player who is paying attention, and a fit is one run of one seed. It is a ballpark
          you then play, not a promise about every player. A game with a handful of prices needs none of this:
          tune them by playing and check them with a pacing contract (page 5).
        </p>
      </Note>
    </>
  ),
});
