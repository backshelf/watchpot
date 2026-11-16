// Getting started, step 3: the action. The reader edits the pot's `actions` in a code box, and the panel's buttons
// call what they wrote. Typing it is the lesson: `s.pot.bubbles = s.pot.bubbles.add(1)`, and why the `=` matters.
import { fmt, type StateOf } from "watchpot/core";
import type * as Simmer from "../../../../docs/examples/simmer/game";
import {
  Act,
  Actions,
  CodeBox,
  definePage,
  Note,
  Panel,
  Readout,
  Readouts,
  StartOver,
  StateTree,
  Term,
  Try,
} from "../kit";

type S = StateOf<typeof Simmer.game.features>;

function TheButton() {
  return (
    <Panel title="The pot">
      <Readouts>
        <Readout<S> big label="Bubbles" select={(s) => fmt(s.pot.bubbles).text} />
      </Readouts>
      <Actions>
        <Act call="pot.tap">Tap the pot</Act>
        <Act call="pot.tapTen">Tap ten</Act>
      </Actions>
      <StateTree only={["pot"]} label="The pot's slice" />
      <StartOver />
    </Panel>
  );
}

export default definePage({
  title: "A button: the action",
  idea: (
    <>
      A player changes the game through actions: functions that edit a draft of the state, which the engine
      turns into the next state.
    </>
  ),
  game: {
    file: "simmer/game.ts",
    keep: "memory",
    clock: false,
    edit: { at: "pot > actions", trial: ["pot.tap", "pot.tapTen"] },
  },
  Panel: TheButton,
  Body: () => (
    <>
      <p>
        So far the state only sits there. A player changes it by doing things: pressing a button, buying
        something. In code, each of those is an <Term id="action">action</Term>: a function, kept on the
        store, that changes the state.
      </p>
      <p>
        Here is the pot's one action, <code>tap</code>. It is not a picture of code: it is the code the
        panel's "Tap the pot" button runs. Change it, and a moment after you stop typing the button does what
        your version says.
      </p>
      <CodeBox label="The pot's actions" />
      <Try>
        <li>
          Change <code>add(1)</code> to <code>add(5)</code>. Stop typing, then tap: each tap pays five.
        </li>
        <li>
          Now delete <code>s.pot.bubbles = </code> so the line reads <code>s.pot.bubbles.add(5);</code>. Tap.
          Nothing happens, and no error says why. The next section explains.
        </li>
        <li>
          Put it back. Then give the pot a second action, below <code>tap</code>, and press "Tap ten":
          <pre className="guide-snippet">
            <code>{`tapTen: () =>
  api.set((s) => {
    s.pot.bubbles = s.pot.bubbles.add(10);
  }),`}</code>
          </pre>
        </li>
        <li>
          Break it on purpose: delete a closing bracket. The box says where, in plain words, and the game
          keeps running the last version that worked. "Reset" brings back the example's own code.
        </li>
      </Try>

      <h2>Reading it</h2>
      <p>
        <code>actions</code> returns the pot's actions, by name. Each one is a function the page can call:{" "}
        <code>tap</code> takes nothing and returns nothing.
      </p>
      <p>
        Inside, <code>api.set</code> is how an action changes the state. You hand it a function, and the
        engine calls it with <code>s</code>: a <Term id="draft">draft</Term>, a copy of the whole state that
        you are allowed to change. Assign to it as if it were plain data. When your function returns, the
        engine turns what you changed into the next state, and everything showing the state redraws.
      </p>
      <p>
        <code>s.pot.bubbles = s.pot.bubbles.add(1)</code> reads the pot's bubbles, adds one, and stores the
        result. The bubbles are a Decimal, and a Decimal never changes: <code>add</code> hands back a new
        number and leaves the old one as it was. That is why the line has to assign. Without the{" "}
        <code>s.pot.bubbles =</code>, the new number is worked out and thrown away, the draft is untouched,
        and the engine has nothing to turn into a next state. No error, because nothing went wrong as far as
        JavaScript can tell. It is the mistake everyone makes once.
      </p>

      <h2>Calling it from code</h2>
      <p>The store keeps each action right beside the state it changes:</p>
      <pre className="guide-snippet">
        <code>{`store.getState().pot.tap();      // what the button does
store.getState().pot.bubbles;    // what the panel reads`}</code>
      </pre>
      <p>So a button needs no wiring of its own: it reads the store and calls the action it finds there.</p>
      <Note title="Next: the clock">
        <p>
          Every change so far came from a press. An idle game also changes on its own, as time passes. That is
          the next idea, and the first thing the pot does without you.
        </p>
      </Note>
    </>
  ),
  next: {
    href: "../guide/02-your-first-game.html#step-3-the-clock",
    title: "Your first game, from step 3: the clock",
    label: "Continue in the guide",
  },
});
