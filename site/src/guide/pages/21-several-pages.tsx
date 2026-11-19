// Getting started, step 21: several pages in one game. A screen per page, the rail that opens them and only the open
// screen drawn; the reader switches tabs on the pantry, then puts a fourth, finished screen on the rail by adding one
// entry, and takes it off again.
import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as watchpotReact from "watchpot/react";
import * as watchpotUi from "watchpot/ui";
import { Code, Controls, choice, definePage, ExamplePage, Note, Panel, StartOver, Term, Try } from "../kit";

function ThePantry() {
  return (
    <Panel title="The pantry">
      <ExamplePage label="What the example's page draws" />
      <StartOver />
    </Panel>
  );
}

export default definePage({
  title: "Several pages in React.",
  idea: (
    <>
      A game with more than one page: a screen for each, a rail of tabs that opens them, and the chrome drawn
      once around whichever is open.
    </>
  ),
  game: {
    file: "guide-screens.tsx",
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
  params: {
    fourth: choice({
      at: "EXTRA",
      find: "= []",
      token: "[]",
      label: "The rail's fourth entry",
      options: [
        { label: "Not on the rail", code: "[]" },
        { label: "The tins", code: '[{ id: "tins", label: "The tins" }]' },
      ],
    }),
  },
  code: {
    screen: { at: "Shelf" },
    screens: { at: "SCREENS" },
    extra: { at: "EXTRA" },
    rail: { at: "TABS" },
    app: { at: "App" },
  },
  Panel: ThePantry,
  Body: () => (
    <>
      <p>
        Every page so far was one screen: a count, a few buttons, all of it at once. A game soon needs more
        than that — the thing you press on one page and the way you grow on another — and the engine's own
        games take the shape every game site uses: a tab for each page, the open one beside it or below.
      </p>
      <p>
        The panel is a small game with three pages and a fourth that is finished and not on the rail yet.
        Press a tab: the count above stays where it is, because it belongs to the page around the screens, not
        to any one of them.
      </p>

      <h2>A screen is a component</h2>
      <Code id="screen" />
      <p>
        A screen is an ordinary component that reads what it needs from the <Term id="store">store</Term> and
        calls its own <Term id="action">actions</Term>. It draws no title and no tabs: everything around it is
        the page's. A screen never knows which tab it is on, and two screens can read the same figure without
        sharing anything but the store.
      </p>
      <p>The screens are gathered into one table, by the name of the tab that opens them:</p>
      <Code id="screens" />
      <p>
        The names in that table are the game's page names, so TypeScript refuses a rail entry that has no
        screen. It does not insist the other way round: a screen with no entry is what "off the rail" means,
        and the tins are one.
      </p>

      <h2>The rail is data</h2>
      <p>
        The fourth screen — the tins — is written and typechecked and on no tab. It is the same kind of
        component as the others; what it does not have is an entry in the rail:
      </p>
      <Code id="extra" />
      <Code id="rail" />
      <p>
        The rail is a list, one entry a tab, in the order a player meets them, and the page draws it and
        nothing else. Adding the fourth page is adding its entry: the file, the component and the game's own
        state are already there. Taking it off again is taking the entry out.
      </p>

      <h2>The chrome</h2>
      <Code id="app" />
      <p>
        <code>App</code> is the whole page: the clock started once, the count, the open screen and the rail.
        The open tab is <code>useState</code>, the page's own, not the game's: it is not saved, and a reload
        opens the first tab. Only the open screen is drawn, so leaving one unmounts it and coming back mounts
        it again — a screen that held a half-typed number or a place in a long list starts over. A screen
        whose code is heavy can be handed to React's <code>lazy</code>, which fetches it when its tab first
        opens rather than with the rest of the page.
      </p>
      <p>
        The rail itself is the engine's <code>NavTabs</code>, a <Term id="primitive">primitive</Term> from{" "}
        <code>watchpot/ui</code>: a <code>{"<nav>"}</code> of buttons, one tab stop, the arrow keys moving
        between them, the open one marked <code>aria-current="page"</code>. It is unstyled here, as everything
        from the engine is. The template's page takes these same pieces and adds the parts a real game wants:
        a header that stays put, sheets over the page, and the rail down the side on a wide screen.
      </p>
      <Controls />
      <Try>
        <li>
          Press "The storeroom", then "The ledger". The count does not restart and the game does not stop: the
          tabs switch what is drawn, not what is running.
        </li>
        <li>
          Put up a shelf, then go back to "The shelf". The jars climb faster: the screens read one game.
        </li>
        <li>
          Set "The rail's fourth entry" to "The tins". A fourth tab appears. Open it, open a tin, then open
          "The ledger": the tins you opened are counted there.
        </li>
        <li>
          Set the entry back to "Not on the rail". The tab goes; the tins you opened are still in the state
          and the ledger still counts them. A page is a way into the game, not a part of it.
        </li>
      </Try>
      <Note title="If the game should remember the tab">
        <p>
          The open tab is where the player is, not what the game is, so it goes in the page and not in the
          save. A game that wants to remember it puts the name in a <Term id="transient">transient</Term>{" "}
          field on one of its features: kept while the page is open, gone after a reload.
        </p>
      </Note>

      <h2>Where to go next</h2>
      <p>
        That is getting started: twenty-one steps, one idea each, every one of them with a game running beside
        it. What comes after is your own game, and the chapters that go deeper into the parts this sequence
        kept short.
      </p>
      <ul>
        <li>
          <strong>Make your own.</strong> Chapter 2 of the guide,{" "}
          <a href="../guide/02-your-first-game.html">Your first game</a>, builds the folder by hand, five
          small files; step 19 is the same two files in a project you already have. To start one the way the
          engine's own games start, from a template that already works on a phone, saves across machines and
          proves its pacing, read <a href="../guide/13-from-the-template.html">From the template</a>. If you
          build with an AI coding agent, the engine ships a skill for it: <code>/watchpot-init</code> asks
          about your game and scaffolds it from that template.
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
          Chapters 1 to 6 of the guide cover the same ground as these twenty-one steps, in one long read each,
          and a little more: chapter 6 also shows the foam on the pot, the big bubbles and the boost they
          start, which run underneath Simmer without a part of the pages above to show them. Read it when you
          want them; chapter 7 picks up from Simmer as it stands here.
        </p>
      </Note>
    </>
  ),
  // Getting started ends here: the old chapters and the reference shelf carry on from this point.
  next: {
    href: "../guide/07-the-first-reset.html",
    title: "The first reset",
    label: "Continue in the guide",
  },
});
