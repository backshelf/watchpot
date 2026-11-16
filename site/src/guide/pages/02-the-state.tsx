// Getting started, step 2: the state. The pot as data, alone: no button and no clock yet, so the only thing that
// moves the state is the reader choosing what a new player starts with.
import { Code, Controls, choice, definePage, Note, Panel, SaveText, StateTree, Term, Try } from "../kit";

function TheState() {
  return (
    <Panel title="Simmer's state">
      <StateTree label="The state, as the store holds it" />
      <SaveText />
    </Panel>
  );
}

export default definePage({
  title: "The state: what the game remembers",
  idea: (
    <>
      Everything a game knows at a moment is plain data: its state. You declare a piece of it as a feature,
      with a name and a value to start from.
    </>
  ),
  game: { file: "simmer/game.ts", keep: "fresh", clock: false },
  params: {
    start: choice({
      at: "pot > initial",
      find: "bubbles: ZERO",
      token: "ZERO",
      label: "A new player starts with",
      options: [
        { label: "0", code: "ZERO" },
        { label: "10", code: "D(10)" },
        { label: "1,000", code: "D(1_000)" },
        { label: "1e400", code: 'D("1e400")' },
      ],
    }),
  },
  code: {
    pot: { at: "pot", omit: ["actions", "steps"] },
    game: { at: "game" },
    store: { at: "store" },
  },
  Panel: TheState,
  Body: () => (
    <>
      <p>
        Pause any game and write down everything it would need to carry on exactly where it was. That list is
        its state. For Simmer it is short: how many bubbles are in the pot, and how many burners are lit.
      </p>
      <p>
        The state is plain data, the kind you could print. The panel shows Simmer's as it is now. On this page
        nothing changes it: there is no button yet, and no clock. That is the point. First the data, then the
        things that change it.
      </p>

      <h2>A feature holds a piece of it</h2>
      <p>
        You declare a piece of the state with <code>feature</code>. Here is the pot, with the parts that
        change it folded away for now:
      </p>
      <Code id="pot" />
      <p>
        <code>key</code> is its name. The pot's state lives under that name, so you will read it as{" "}
        <code>s.pot.bubbles</code>. <code>initial</code> returns what a brand-new player starts with: no
        bubbles.
      </p>
      <Controls />
      <Try>
        <li>
          Choose 1,000. The token in the code changes to what you chose, and the state starts over from it.
        </li>
        <li>
          Choose 1e400, a 1 with four hundred zeros. The state holds it without trouble, though JavaScript's
          own numbers stop at about 1e308.
        </li>
      </Try>
      <p>
        <code>ZERO</code> is the number zero as the engine's own number type, a{" "}
        <Term id="decimal">Decimal</Term>. Idle games outgrow JavaScript's numbers, so anything that can grow
        without limit is a Decimal. A later page is about them; for now, read <code>D(10)</code> as "the
        number 10".
      </p>
      <p>
        A <Term id="feature">feature</Term> is one part of a game: a piece of state, and (soon) the things
        that change it. The pot is one. The piece of the state it holds, <code>{"{ bubbles }"}</code>, is its{" "}
        <Term id="slice">slice</Term>. A second feature, the stove, holds the burners; it gets a page of its
        own later.
      </p>

      <h2>From features to a running game</h2>
      <p>Two more calls turn features into something that runs. The first lists them:</p>
      <Code id="game" />
      <p>
        <code>defineGame</code> makes the <Term id="game">game</Term>: the list of features, a name, and where
        and under which version it saves. It is only a description. Nothing runs yet.
      </p>
      <Code id="store" />
      <p>
        <code>createIdleStore</code> makes the <Term id="store">store</Term>: the one object that holds the
        state while the game runs, and saves it. <code>now: Date.now</code> is how it learns the time. The
        engine never looks at a clock by itself; it asks the function you hand it. (On these pages, the page
        hands it a clock it can move.)
      </p>
      <Note title="The clock you did not write">
        <p>
          The state has a <code>clock</code> beside the pot and the stove. You did not declare it: the engine
          adds it to every game, to remember when the game began and when it last ran. That is how it knows,
          when the game opens again, how long it was away.
        </p>
      </Note>
      <p>
        The state as the store holds it and the state as it is saved are nearly the same. Open "The save, as
        stored": the same values, written as text, with a version number.
      </p>
    </>
  ),
});
