// Getting started, step 18: your first page. The whole of Simmer's first page, the example's own React components,
// running in the panel on a store saved in this browser; the words say what each part is and which page taught it,
// list the words learned, and point on: the deeper chapters, the reference, and making a real game.
import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as watchpotReact from "watchpot/react";
import * as watchpotUi from "watchpot/ui";
import { Away, Code, definePage, ExamplePage, Note, Panel, Reload, StartOver, Term, Try } from "../kit";

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

      <h2>Where to go next</h2>
      <ul>
        <li>
          <strong>Make it real.</strong> To build a game of your own by hand, chapter 2 of the guide,{" "}
          <a href="../guide/02-your-first-game.html">Your first game</a>, makes the folder: the install and
          five small files. To start one the way the engine's own games start, from a template that already
          works on a phone, saves across machines and proves its pacing, read{" "}
          <a href="../guide/13-from-the-template.html">From the template</a>. If you build with an AI coding
          agent, the engine ships a skill for it: <code>/watchpot-init</code> asks about your game and
          scaffolds it from that template.
        </li>
        <li>
          <strong>Go deeper.</strong> The guide carries on from here, one chapter a subject:{" "}
          <a href="../guide/07-the-first-reset.html">the first reset</a> (starting over for a bonus),{" "}
          <a href="../guide/08-effects.html">effects</a> (stats in depth),{" "}
          <a href="../guide/09-saving-and-time-away.html">saving and time away</a>,{" "}
          <a href="../guide/10-the-page.html">the page</a>,{" "}
          <a href="../guide/11-look-and-sound.html">look and sound</a> and{" "}
          <a href="../guide/12-proving-the-pacing.html">proving the pacing</a>.
        </li>
        <li>
          <strong>Look something up.</strong> <a href="../reference.html">The reference</a> has a page for
          every system (clicker, gauge, spawns, buffs, prestige and the rest), each with an example that runs.
        </li>
      </ul>
      <Note title="Where this leaves the old chapters">
        <p>
          Chapters 1 to 6 of the guide cover the same ground as these eighteen steps, in one long read each,
          and a little more: chapter 6 also shows the foam on the pot, the big bubbles and the boost they
          start, which run underneath this page without a part of it to show them. Read it when you want them;
          chapter 7 picks up from Simmer as it stands here.
        </p>
      </Note>
    </>
  ),
  next: {
    href: "../guide/07-the-first-reset.html",
    title: "The first reset",
    label: "Continue in the guide",
  },
});
