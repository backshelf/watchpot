// Getting started, step 19: the two ways into a game — the engine added to a project you already have, or a project
// scaffolded from the template — and the page both end at, running in the panel. The reader compares two file trees,
// reads the smallest game and its page, and presses its buttons.
import type { ReactNode } from "react";
import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as watchpotReact from "watchpot/react";
import { Code, definePage, ExamplePage, Note, Panel, StartOver, Term, Try } from "../kit";

function ThePage() {
  return (
    <Panel title="The bakery, as a player has it">
      <ExamplePage label="What the example's page draws" />
      <StartOver />
    </Panel>
  );
}

/** One line of a file tree: a name, what it is, and the folder under it. */
function Branch({ name, note, children }: { name: string; note?: string; children?: ReactNode }) {
  return (
    <li>
      <code>{name}</code>
      {note ? <> — {note}</> : null}
      {children ? <ul>{children}</ul> : null}
    </li>
  );
}

export default definePage({
  title: "Two ways in: add it to an existing project, or start from one.",
  idea: (
    <>
      The engine goes into a project you already have, or it writes the project for you. Both end at the same
      thing: a game file, and a page that draws it.
    </>
  ),
  // The example's own page, drawn as its `start()` would in a `main.tsx`.
  game: {
    file: "guide-two-ways.tsx",
    externals: { react, "react/jsx-runtime": jsxRuntime, "watchpot/react": watchpotReact },
    start: "start",
    clock: "example",
    keep: "local",
  },
  code: {
    bakery: { at: "bakery" },
    game: { at: "game" },
    page: { at: "App" },
    start: { at: "start" },
  },
  Panel: ThePage,
  Body: () => (
    <>
      <p>
        There are two ways to start a game. The first is to add the engine to a project you already have: an
        app with a page and a folder, where the game is one file among others. The second is to let the engine
        write the project: one command, a short list of questions, and a working game in a new folder.
      </p>
      <p>
        Whichever you pick, the game is the same kind of thing, and the page is the same kind of thing. The
        panel is both, running: a real game on the engine, drawn by its own React components, saving in this
        browser.
      </p>

      <h2>The game</h2>
      <p>
        This is the smallest game in the README, and it is all of the game: the engine brings the clock, the{" "}
        <Term id="save">save</Term> and the time away. One <Term id="feature">feature</Term>: loaves, the
        ovens that bake them, two <Term id="action">actions</Term> and a <Term id="step">step</Term> that runs
        as time passes.
      </p>
      <Code id="bakery" />
      <p>
        A <Term id="derived-value">derived value</Term> works the rate out from the ovens, and the step pays
        it times the time that passed. Nothing here knows about a page: no React, no colours, no buttons.
      </p>
      <Code id="game" />
      <p>
        <code>defineGame</code> gives it an id, where it <Term id="save">saves</Term> and which features it is
        made of. That export, and the file it is in, is the same in both ways in.{" "}
        <a href="../start-a-game.html">Start a game</a> is the same four steps without the story.
      </p>

      <h2>The page</h2>
      <Code id="page" />
      <p>
        A <Term id="store">store</Term> holds the running game, and <code>useGameState</code> reads one value
        out of it for one component. <code>useGameClock</code> starts the clock, once, at the top.
      </p>
      <Code id="start" />
      <p>
        <code>start()</code> makes the store and draws the page. In a game of your own it is the last line of{" "}
        <code>main.tsx</code>, and the panel does exactly that, inside this page.
      </p>
      <Try>
        <li>Press "Bake a loaf". One loaf, and the count climbs on its own from the oven.</li>
        <li>
          Press "Buy an oven". The rate doubles: the derived value reads the ovens at once. Nothing is paid
          for it here: a price is the first thing this small game leaves out.
        </li>
        <li>Press "Start over". The save is forgotten, and the game begins again at nought and one oven.</li>
      </Try>

      <h2>The two trees</h2>
      <p>
        The same game and page, in a project you already have. Two new files, and one line in the file that
        already starts your app:
      </p>
      <ul>
        <Branch name="package.json" note="watchpot added to it" />
        <Branch name="index.html" note="yours, as it is" />
        <Branch name="src/">
          <Branch name="game.ts" note="new: the game above" />
          <Branch name="App.tsx" note="new: the page above" />
          <Branch name="main.tsx" note="your entry, now drawing the game" />
        </Branch>
      </ul>
      <p>
        The same game and page, in a project the engine wrote. The two files are in it, among what a game you
        mean to keep also needs:
      </p>
      <ul>
        <Branch name="package.json" note="the scripts: dev, verify, gates, sim" />
        <Branch name="design/tokens.json" note="your palette and type, compiled to CSS" />
        <Branch name="src/content/" note="the words and the numbers, apart from the rules" />
        <Branch name="src/game/" note="game.ts, wallet.ts, stats.ts, the core and the systems you chose" />
        <Branch name="src/app/" note="App.tsx, the header, the tabs, settings" />
        <Branch name="src/screens/" note="one file a screen" />
        <Branch name="src/ui/" note="the look: your own button, panel and sheet" />
        <Branch name="src/shaders/" note="a backdrop" />
        <Branch name="sim/" note="a headless player and the pacing contract" />
        <Branch name="test/" note="a game test and a page test" />
      </ul>
      <p>
        Into an existing project, it is <code>bun add watchpot</code> (Bun 1.4.3 or later), or the release's
        git <Term id="tag">tag</Term> while that release is not on npm; then two files and one line. For a
        folder of its own, it is <code>bun create watchpot</code>: it asks the game's name and a few
        questions, and writes the <Term id="template">template</Term> into a new folder with your answers,
        installing as it goes.
      </p>

      <h2>Which one</h2>
      <ul>
        <li>
          <strong>An existing React app</strong>, with a page, a look and maybe routes: add it. Your page
          stays yours; the game is one file, and <code>App.tsx</code> draws the part of it that is the game.
        </li>
        <li>
          <strong>A jam, or an evening</strong>: add it. Two files and one line is the shortest way to a
          working page, and the engine brings the clock and the save.
        </li>
        <li>
          <strong>A prototype of one mechanic</strong>: add it, and throw the folder away after. Nothing is
          generated that you would have to keep.
        </li>
        <li>
          <strong>A game you intend to keep</strong>: start from the template. Settings, sound, a page that
          works on a phone and a desktop, tokens, a sim that proves the pacing and tests are all written
          already, and the scaffold cuts out the systems you did not choose.
        </li>
      </ul>
      <p>
        The guide's last chapter, <a href="../guide/13-from-the-template.html">From the template</a>, walks
        the scaffold through: the answers file, the <code>{"// @if"}</code> markers in the template's own
        code, and the loop you work in after. <a href="../installing.html">Installing</a> has the
        requirements, the peers and how a game takes an engine change.
      </p>
      <Note title="The same game can be both">
        <p>
          Nothing stops a game starting as the two files and growing into the bigger shape. The features, the
          actions and the steps do not change; what a game you keep adds is everything around them.
        </p>
      </Note>
    </>
  ),
});
