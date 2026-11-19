// Getting started, step 18: your first page. The whole of Simmer's first page, the example's own React components,
// running in the panel on a store saved in this browser; the words say what each part is and which page taught it,
// list the words learned, and point on to the two ways into a real project (step 19).
import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as watchpotReact from "watchpot/react";
import * as watchpotUi from "watchpot/ui";
import { Away, Code, definePage, ExamplePage, Panel, Reload, StartOver, Term, Try } from "../kit";

function YourPage() {
  return (
    <Panel title="Simmer, the first page">
      <ExamplePage label="What guide-first-game.tsx draws" />
      <Away />
      <Reload />
      <StartOver />
    </Panel>
  );
}

/** A step of getting started, linked by its file. */
function Step({ n, slug, children }: { n: number; slug: string; children: string }) {
  return (
    <a href={`${String(n).padStart(2, "0")}-${slug}.html`}>
      {children}, step {n}
    </a>
  );
}

export default definePage({
  title: "Your first page",
  idea: (
    <>
      Everything so far on one page of its own: a number that prints itself, a button, a generator, an
      upgrade, ticking and saving. This is the game you would ship first.
    </>
  ),
  // The example's own page, run as its `main.tsx` would: `start()` makes the store and mounts `App`.
  game: {
    file: "guide-first-game.tsx",
    externals: {
      react,
      "react/jsx-runtime": jsxRuntime,
      "watchpot/react": watchpotReact,
      "watchpot/ui": watchpotUi,
    },
    start: "start",
    clock: "example",
    keep: "local",
  },
  code: {
    store: { at: "makeStore" },
    count: { at: "Count" },
    app: { at: "App" },
    start: { at: "start" },
  },
  Panel: YourPage,
  Body: () => (
    <>
      <p>
        The panel is Simmer as a player would meet it, on a page of its own: the count, a button, the stove
        and its lid, a shelf of kettles and a kitchen. None of it is new. It is every page so far, put
        together, and it is the real thing: the engine, ticking, saving in this browser, and paying for the
        time you are away.
      </p>
      <Try>
        <li>Stir the pot, light a burner, put the lid on. Save up for a kettle, then for the salt.</li>
        <li>
          Press "Reload the game": a new store, made from the save. Everything comes back as you left it.
        </li>
        <li>
          Leave for an hour and come back. The page opens again on its save, the engine pays for the hour, and
          the page itself says what the pot made.
        </li>
      </Try>

      <h2>What is in it</h2>
      <ul>
        <li>
          <strong>The count</strong>, printed for a person: the wallet's bubbles through <code>fmt</code>{" "}
          (step 9), and what they grow by a second (
          <Step n={11} slug="the-wallet">
            the wallet
          </Step>
          ).
        </li>
        <li>
          <strong>The stir</strong>, a button that calls an action (
          <Step n={3} slug="a-button">
            the action
          </Step>
          ), and pays a stat the kitchen raises (
          <Step n={17} slug="a-shop">
            the shop
          </Step>
          ).
        </li>
        <li>
          <strong>The stove</strong>: a burner and its price (
          <Step n={10} slug="something-to-buy">
            the burner
          </Step>
          ), worked out and never stored (
          <Step n={12} slug="a-derived-value">
            derived values
          </Step>
          ,{" "}
          <Step n={13} slug="a-later-layer">
            layers
          </Step>
          ), and the lid, a source of heat the rate reads (
          <Step n={14} slug="the-stat">
            the stat
          </Step>
          ,{" "}
          <Step n={15} slug="the-rate-reads-the-stat">
            the rate
          </Step>
          ).
        </li>
        <li>
          <strong>The kettles</strong>, from a factory, bought one, ten, to the next milestone or as many as
          you can afford (
          <Step n={16} slug="generators">
            generators
          </Step>
          ).
        </li>
        <li>
          <strong>Underneath</strong>, the tick, the save and the catch-up, which you never wrote and never
          will.
        </li>
      </ul>

      <h2>The page, in code</h2>
      <p>
        The whole page is one file, <code>docs/examples/guide-first-game.tsx</code>. Its game is chapter 6's,
        the one the last two steps ran. What is new is only the React around it. First, the store:
      </p>
      <Code id="store" />
      <p>
        <code>makeStore</code> makes the store from the game. In the browser it saves itself and reads the
        clock; the panel hands it a storage and a clock of its own, so it can send the game away for an hour.
      </p>
      <Code id="count" />
      <p>
        Each part of the page is a small component that reads the store with <code>useGameState</code> and
        prints what it reads. Here it reads the balance and works the rate out from three numbers on the
        state. It never stores anything, and it redraws when what it read changes.
      </p>
      <Code id="app" />
      <p>
        <code>App</code> starts the clock once, for the whole page, and lists the parts. The welcome back
        after time away is <code>AwayNote</code>, which the engine's <code>useAwayReport</code> feeds.
      </p>
      <Code id="start" />
      <p>
        <code>start()</code> makes the store and draws <code>App</code> into the page. In a game of your own,
        it is the last line of <code>main.tsx</code>. The panel does the same, inside this page.
      </p>

      <h2>What you have now</h2>
      <p>
        You know how an idle game is put together, in the engine's words: the state, held in{" "}
        <Term id="feature">features</Term>, each with its <Term id="slice">slice</Term>, run by a{" "}
        <Term id="store">store</Term>; <Term id="action">actions</Term> that change a{" "}
        <Term id="draft">draft</Term>; the <Term id="tick">tick</Term> and its steps; the{" "}
        <Term id="save">save</Term> and the <Term id="catch-up">catch-up</Term>; the{" "}
        <Term id="decimal">Decimal</Term> and the printers; <Term id="generator">generators</Term> and the{" "}
        <Term id="reach">reach</Term> that lets one feature touch another; the{" "}
        <Term id="vocabulary">vocabulary</Term> and the <Term id="wallet">wallet</Term>;{" "}
        <Term id="derived-value">derived values</Term>; <Term id="stat">stats</Term> and their{" "}
        <Term id="effect">effects</Term>; <Term id="factory">factories</Term>,{" "}
        <Term id="milestone">milestones</Term> and the <Term id="upgrade-tree">upgrade tree</Term>. Every one
        of them is in the <a href="../glossary.html">glossary</a>.
      </p>

      <h2>What comes next</h2>
      <p>
        Everything on this page runs in the browser, on files this site built for you. The next step is a
        folder of your own, and there are two ways to get one: add the engine to a project you already have,
        or have it write the project for you from its template.
      </p>
      <p>
        <Step n={19} slug="two-ways-in">
          Two ways in
        </Step>{" "}
        takes a game as small as this one apart — the game file, the page, and the shape of both kinds of
        project it can live in.
      </p>
    </>
  ),
});
