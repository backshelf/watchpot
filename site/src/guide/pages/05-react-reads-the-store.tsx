// Getting started, step 5: the page. Simmer's own `main.tsx` runs in the panel, drawn by its own components against
// its own store; the reader turns its clock hook off and on, and swaps its selector for one that makes a new value on
// every call, which React stops.
import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as watchpotReact from "watchpot/react";
import { Code, Controls, choice, definePage, ExamplePage, Note, Panel, Term, Try, useSnapshot } from "../kit";

function Ticks() {
  const { clock, passes } = useSnapshot();
  return (
    <p className="strip__note">
      {clock ? "useGameClock is ticking the store" : "Nothing is ticking the store"}:{" "}
      <span className="num">{passes.toLocaleString("en")}</span> {passes === 1 ? "tick" : "ticks"} so far.
    </p>
  );
}

function ThePage() {
  return (
    <Panel title="Simmer's page">
      <ExamplePage label="What main.tsx draws" />
      <Ticks />
    </Panel>
  );
}

export default definePage({
  title: "On a page: React reads the store",
  idea: (
    <>
      A game's page is React components. Each reads the one value it shows from the store with a hook, and
      calls an action when it is pressed. The clock is started once, at the top.
    </>
  ),
  game: {
    file: "simmer/main.tsx",
    externals: { react, "react/jsx-runtime": jsxRuntime, "watchpot/react": watchpotReact },
    clock: "example",
    keep: "memory",
  },
  params: {
    clock: choice({
      at: "App",
      find: "useGameClock(store);",
      token: "useGameClock(store)",
      label: "The clock hook",
      options: [
        { label: "Called", code: "useGameClock(store)" },
        { label: "Left out", code: "// useGameClock(store)", run: "undefined" },
      ],
    }),
    selector: choice({
      at: "Pot",
      find: "useGameState((s) => s.pot.bubbles)",
      token: "s.pot.bubbles",
      label: "The pot's selector returns",
      options: [
        { label: "What is stored", code: "s.pot.bubbles" },
        { label: "A new Decimal", code: "s.pot.bubbles.floor()" },
      ],
    }),
  },
  code: {
    hooks: { at: "useGameState" },
    pot: { at: "Pot" },
    app: { at: "App" },
    mount: { at: "mountGame" },
  },
  Panel: ThePage,
  Body: () => (
    <>
      <p>
        Until now the panel beside these words was drawn by this site, reading the game for you. A real game
        draws its own page. The panel now shows Simmer's: the file <code>main.tsx</code>, run as it is, with
        nothing added but this site's look (its own markup has none).
      </p>
      <p>
        The page is written in React. If you have not used it: a component is a function that returns what to
        draw, written in a form that looks like HTML. React calls it again whenever what it shows changes. A
        hook is a function a component calls to get something that can change, so React knows to call the
        component again when it does. Hooks are named <code>use…</code>.
      </p>

      <h2>Reading one value</h2>
      <Code id="pot" />
      <p>
        <code>Pot</code> reads two numbers from the store and draws them with a button.{" "}
        <code>useGameState</code> is the hook that reads. You hand it a <Term id="selector">selector</Term>: a
        small function that picks the one value this component shows out of the whole state, here{" "}
        <code>{"(s) => s.pot.bubbles"}</code>. Whenever the state changes, the hook runs the selector again,
        and only when the value it picks is a different one does React draw <code>Pot</code> again.
      </p>
      <p>
        The button needs the store itself, not a value from it: <code>useGameStore()</code> hands it over, and
        a press calls the action as page 3 did, <code>game.getState().pot.tap()</code>.
      </p>
      <p>Both hooks are made once, at the top of the file, typed for this game's store:</p>
      <Code id="hooks" />

      <h2>Starting the clock, once</h2>
      <Code id="app" />
      <p>
        <code>App</code> is the whole page: the note for coming back, the pot and the stove. It is also where
        the clock starts. <code>useGameClock(store)</code> starts the engine's clock when the page appears and
        stops it when the page goes away. Call it once, in the component at the top, and every component below
        gets a ticking game.
      </p>
      <Code id="mount" />
      <p>
        <code>mountGame</code> is the last line of the file. It draws <code>App</code> into the page's{" "}
        <code>{'<div id="root">'}</code> and hands the store to every component under it, which is how{" "}
        <code>useGameState</code> finds it. (Here, it draws into the panel.)
      </p>
      <Controls />
      <Try>
        <li>Tap the pot in the panel. That is Simmer's own button, calling Simmer's own action.</li>
        <li>
          Set "The clock hook" to "Left out". The page is drawn again without the call, and the count stops
          growing. Tap: the button still works. Actions do not need the clock; growth over time does.
        </li>
        <li>Put it back. The clock starts again.</li>
        <li>
          Set "The pot's selector returns" to "A new Decimal". The panel says React stopped drawing the page.
          Put it back to bring the page back.
        </li>
      </Try>

      <h2>Why React stopped</h2>
      <p>
        <code>s.pot.bubbles.floor()</code> looks harmless: round the count down before showing it. But a
        Decimal never changes in place, so <code>floor()</code> makes a new one every time it is called. React
        tells values apart by whether they are the same object, not by the number inside, so each answer looks
        like a change. It draws <code>Pot</code> again, which asks the selector again, which makes another new
        Decimal, and so on, until React gives up and stops the page. In your game, the page would go blank.
      </p>
      <p>
        The cure is to select what is stored, as the example does, and work things out in the component's
        body: <code>fmt(bubbles)</code> already rounds down when it prints. (When a selector must build
        something, wrapping it in <code>useShallow</code> from <code>watchpot/react</code> tells React to
        compare what is inside. You will rarely need it.)
      </p>
      <Note title="The page runs the game; the game does not know the page">
        <p>
          Nothing in <code>game.ts</code> mentions React, and nothing in <code>main.tsx</code> changes the
          state except through actions. That is why the same game can run here, in a test, or in a script with
          no page at all.
        </p>
      </Note>
    </>
  ),
});
