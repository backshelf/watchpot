// Getting started, step 6: the save. Simmer saves itself; the panel draws each change to the state and each write
// of the save on one strip, shows the saved text, reloads the game from it, and starts it over.
import { fmt, type StateOf } from "watchpot/core";
import type * as Simmer from "../../../../docs/examples/simmer/game";
import {
  Act,
  Actions,
  ClockSwitch,
  Code,
  Controls,
  choice,
  definePage,
  Note,
  Panel,
  Readout,
  Readouts,
  Reload,
  SaveStrip,
  SaveText,
  StartOver,
  Term,
  Try,
} from "../kit";

type S = StateOf<typeof Simmer.game.features>;

function TheSave() {
  return (
    <Panel title="Simmer's save">
      <Readouts>
        <Readout<S> big label="Bubbles" select={(s) => fmt(s.pot.bubbles).text} />
      </Readouts>
      <Actions>
        <Act call="pot.tap">Tap the pot</Act>
      </Actions>
      <ClockSwitch />
      <SaveStrip />
      <SaveText open />
      <Reload<S> measure={(s) => s.pot.bubbles.toNumber()} />
      <StartOver />
    </Panel>
  );
}

export default definePage({
  title: "Saving, without writing any",
  idea: (
    <>
      The store saves itself: a second after a change at most, and at once when the page is hidden. A save is
      the state written out as text, with a version.
    </>
  ),
  game: { file: "simmer/game.ts", keep: "local", clock: true },
  params: {
    key: choice({
      at: "game",
      find: 'key: "simmer.save"',
      token: '"simmer.save"',
      label: "Saved under",
      options: [
        { label: '"simmer.save"', code: '"simmer.save"' },
        { label: '"simmer.save.2"', code: '"simmer.save.2"' },
      ],
    }),
  },
  code: {
    game: { at: "game" },
    store: { at: "store" },
    startOver: { at: "startOver", file: "guide-saving.ts" },
  },
  Panel: TheSave,
  Body: () => (
    <>
      <p>
        Reload this page, and the pot is as you left it. So far you have written no code to make that happen,
        and you will not need to: the store saves the game by itself. This page is about what it writes, when,
        and where.
      </p>

      <h2>What a save is</h2>
      <p>
        A <Term id="save">save</Term> is the state written out as text. The panel shows Simmer's as it stands
        in the browser now: the pot's slice, the stove's, and the engine's own <code>clock</code>, which
        remembers when the game last ran. Watch it while the clock ticks: the bubbles in it move on about once
        a second.
      </p>
      <p>Three things in it are worth a look.</p>
      <ul>
        <li>
          The bubbles are written as <code>{'{"$d": "…"}'}</code>. That tag says "this was a Decimal", so the
          number comes back as one when the save is read, not as a piece of text.
        </li>
        <li>
          There is no <code>tap</code> and no <code>buyBurner</code>. Actions are code, not data: only what
          the state holds is saved.
        </li>
        <li>
          At the end is a <code>version</code>, the number the game gave it. That is the line below.
        </li>
      </ul>
      <Code id="game" />
      <p>
        <code>save</code> in the game's description says where to save and in what shape. <code>key</code> is
        the save's name in the browser's storage. <code>version</code> is the version of the state's shape:
        when a later version of your game changes what the state holds, you raise it and tell the engine how
        to bring an old save across. Until then it stays 1.
      </p>
      <Controls />
      <Try>
        <li>Tap the pot a few times, then reload the whole page. The count comes back.</li>
        <li>
          Press "Reload the game". The store writes the save and stops; a new store reads it. The count goes
          on from where it was.
        </li>
        <li>
          Change "Saved under" to <code>"simmer.save.2"</code>. The new store looks for a save under that
          name, finds none, and starts a new game. Change it back: the old save was there all along.
        </li>
        <li>Press "Start over". The save is deleted, and the game starts from nothing.</li>
      </Try>

      <h2>When it writes</h2>
      <p>
        Look at the strip. Each dot on the top line is a change to the state: ten a second while the clock
        ticks. Each bar below is the store writing the save. It does not write on every change, which would be
        ten writes a second for nothing. The first change after a write books the next write for a second
        later, and that write takes whatever the state is by then. So a save is never more than a second
        behind.
      </p>
      <p>
        When the page is hidden, reloaded or closed, the store writes at once. That is why a reload loses
        nothing, even in the middle of a second. Stop the clock and nothing changes, so nothing is written;
        tap once and one write follows, a second later.
      </p>

      <h2>Where it writes</h2>
      <p>
        The text goes to a <Term id="backend">backend</Term>: the place a save is kept. In a browser that is
        its local storage, a small store of text each website gets. You did not choose it: making the store
        with no other instruction picks it.
      </p>
      <Code id="store" />
      <p>
        On these pages each step keeps its game in a corner of local storage of its own, so the pot here is
        not the pot on page 1. (If a browser keeps no local storage at all, as some private windows do, the
        store keeps the save in memory and the game still runs; it forgets when the tab closes.)
      </p>

      <h2>Starting over</h2>
      <p>
        Deleting the save by hand while the game is open does not work: the page writes it again as it closes.
        The engine's <code>clearSave(store)</code> stops the store writing first, then deletes the save. A
        start-over button calls it and reloads the page:
      </p>
      <Code id="startOver" caption="guide-saving.ts" />
      <Note title="Next: the time you were away">
        <p>
          Close this tab for a minute and come back: the count is higher than when you left. The save's{" "}
          <code>lastSeen</code> is how the engine knows how long you were gone. Paying for that time is the
          next page.
        </p>
      </Note>
    </>
  ),
});
