// Getting started, step 4: the tick. The pot's simmer step, alone: the reader changes how often the page's clock
// ticks and whether the step multiplies its rate by the tick's length, and watches each tick land on a strip.
import { fmt, type StateOf } from "watchpot/core";
import type * as Simmer from "../../../../docs/examples/simmer/game";
import {
  ClockSwitch,
  Code,
  Controls,
  choice,
  definePage,
  Note,
  Panel,
  Readout,
  Readouts,
  Term,
  TickLength,
  TickStrip,
  Try,
} from "../kit";

type S = StateOf<typeof Simmer.game.features>;

function TheTicks() {
  return (
    <Panel title="The pot, ticking">
      <Readouts>
        <Readout<S> big label="Bubbles" select={(s) => fmt(s.pot.bubbles, { decimals: 1 }).text} />
      </Readouts>
      <TickLength />
      <TickStrip<S> measure={(s) => s.pot.bubbles.toNumber()} />
      <ClockSwitch />
    </Panel>
  );
}

export default definePage({
  title: "Time moves: the tick",
  idea: (
    <>
      Ten times a second the engine runs every feature's steps for the time that passed. A step that pays
      multiplies its rate by that time, so it pays the same however long the ticks are.
    </>
  ),
  game: { file: "simmer/game.ts", keep: "memory", clock: true },
  params: {
    pays: choice({
      at: "pot > steps > produce > simmer",
      find: "(SIMMER_PER_SECOND * ctx.dtMs) / 1000",
      label: "Each tick pays",
      options: [
        { label: "The rate × the time", code: "(SIMMER_PER_SECOND * ctx.dtMs) / 1000" },
        { label: "The rate, once", code: "SIMMER_PER_SECOND" },
      ],
    }),
  },
  code: {
    steps: { at: "pot > steps" },
    rate: { at: "SIMMER_PER_SECOND" },
  },
  Panel: TheTicks,
  Body: () => (
    <>
      <p>
        So far the pot changed only when you pressed a button. An idle game also changes on its own: the
        number grows while you watch. Something has to move it forward, a little at a time.
      </p>
      <p>
        That something is the engine's clock. Ten times a second it runs a <Term id="tick">tick</Term>: it
        works out how much time has passed since the last tick, and lets every part of the game do what it
        does in that much time. The strip in the panel draws each tick as it happens, newest on the right.
      </p>

      <h2>What the pot does on a tick</h2>
      <p>Here is the part of the pot you have not read yet:</p>
      <Code id="steps" />
      <p>
        Read it from the inside out. <code>run</code> is a function the engine calls on every tick. It gets{" "}
        <code>s</code>, a <Term id="draft">draft</Term> of the state, just as an action does, and{" "}
        <code>ctx</code> (short for context): facts about this tick. <code>ctx.dtMs</code> is how long the
        tick covered, in milliseconds. (The <code>dt</code> is "delta time": the difference between two
        moments.)
      </p>
      <p>So the line adds the rate times the time. The rate is one bubble a second:</p>
      <Code id="rate" />
      <p>
        A tick of 100 ms is a tenth of a second, so it adds a tenth of a bubble. Ten of them make one bubble a
        second.
      </p>
      <Controls />
      <Try>
        <li>
          Look at the strip: ten marks a second, each a tenth of a bubble tall. "Paid a second" reads 1.00.
        </li>
        <li>
          Move "A tick every" to 1000 ms. One tick a second now, each paying a whole bubble. Still 1.00 a
          second.
        </li>
        <li>Move it to 50 ms: twenty small ticks a second. Still 1.00.</li>
        <li>
          Switch "Each tick pays" to "The rate, once", so each tick pays a whole bubble whatever it covered.
          At 50 ms the pot now pays 20 a second. Move the ticks to 1000 ms and it pays 1: right, but only by
          luck.
        </li>
        <li>Stop the clock. No ticks, and nothing grows.</li>
      </Try>

      <h2>Why multiply by the time</h2>
      <p>
        Because you never know how long a tick will be. Look at "Last tick" under the strip: 98 ms, then 104,
        then 101. A browser runs the clock when it can, a busy page runs it late, and a tab in the background
        is woken far less often. A step that pays "one bubble a tick" pays more on a fast computer than a slow
        one, and almost nothing in a background tab.
      </p>
      <p>
        A step that pays the rate times <code>ctx.dtMs</code> pays for exactly the time that passed, however
        the ticks fall. That is the rule for anything that grows over time: multiply by the time.
      </p>
      <Note title="The tick length is not yours to choose">
        <p>
          The engine's clock ticks every 100 ms, and you will not need to change it. The slider is there to
          show that a step written this way does not care. When a player closes your game for an hour, the
          same step is handed the whole hour in one go, and pays for it (page 7).
        </p>
      </Note>

      <h2>Steps and phases</h2>
      <p>
        <code>simmer</code> is a <Term id="step">step</Term>: a function a feature runs as time passes, under
        a name you choose. A feature lists its steps under <code>steps</code>, grouped by{" "}
        <Term id="phase">phase</Term>. A phase is a stage of every tick, and the engine runs every step in one
        phase before any step in the next. <code>produce</code> is the phase where a game pays its income, so
        that is where the simmer goes. The other phases are for later pages; income always goes in{" "}
        <code>produce</code>.
      </p>
      <p>
        The stove has a step too, <code>burn</code>, which pays for each burner the same way. And{" "}
        <code>{'pass: "both"'}</code> says when a step runs; it matters once the player leaves, which is page
        7.
      </p>
      <Note title="Next: who starts the clock">
        <p>
          Nothing in <code>game.ts</code> starts the clock: the game file only describes. The page starts it,
          once, when it opens. That is the next page, along with the rest of the page: how React reads the
          store.
        </p>
      </Note>
    </>
  ),
});
