// Getting started, step 1: what an idle game is, and what the engine does for one. No code to read yet: the panel
// runs the whole of the first game, and the words point at what each part of it is doing.
import { fmt, fmtCounted, fmtRate, type StateOf } from "watchpot/core";
import type * as Simmer from "../../../../docs/examples/simmer/game";
import {
  Act,
  Actions,
  Away,
  ClockSwitch,
  definePage,
  Panel,
  Readout,
  Readouts,
  SaveText,
  StartOver,
  Term,
  Try,
  useExample,
  Value,
} from "../kit";

type S = StateOf<typeof Simmer.game.features>;
type Example = typeof Simmer;

function ThePot() {
  const { perSecond, burnerPrice } = useExample<Example>();
  return (
    <Panel title="Simmer, the whole game">
      <Readouts>
        <Readout<S> big label="Bubbles" select={(s) => fmt(s.pot.bubbles).text} />
        <Readout<S> label="Every second" select={(s) => fmtRate(perSecond(s.stove.burners))} />
        <Readout<S>
          label="Under the pot"
          select={(s) => fmtCounted(s.stove.burners, ["burner", "burners"])}
        />
      </Readouts>
      <Actions>
        <Act call="pot.tap">Tap the pot</Act>
        <Act<S> call="stove.buyBurner" ready={(s) => s.pot.bubbles.gte(burnerPrice(s.stove.burners))}>
          Light a burner: <Value<S> select={(s) => fmt(burnerPrice(s.stove.burners)).text} />
        </Act>
      </Actions>
      <ClockSwitch />
      <Away<S> measure={(s) => s.pot.bubbles.toNumber()} />
      <SaveText />
      <StartOver />
    </Panel>
  );
}

export default definePage({
  title: "What an idle game is",
  idea: (
    <>
      A number that grows while you watch, and things to spend it on that make it grow faster. Under every
      idle game is the same machinery, and that machinery is what watchpot is.
    </>
  ),
  game: { file: "simmer/game.ts", keep: "local", clock: true },
  Panel: ThePot,
  Body: () => (
    <>
      <p>
        You have probably met an <Term id="idle-game">idle game</Term>: a cookie you click, a number above it,
        and a shop of things that bake cookies for you. The number goes up even when you do nothing. You spend
        it on things that make it go up faster, and then it goes up faster still.
      </p>
      <p>
        The game beside this text is one, as small as they come. Its number is bubbles in a pot. The pot makes
        a bubble a second on its own, and every burner you light under it adds one more. Each burner costs a
        little more than the last.
      </p>
      <Try>
        <li>Tap the pot a few times. Each tap adds a bubble.</li>
        <li>
          Once you have 10 bubbles, light a burner. The count drops by 10, and it now grows by two a second.
        </li>
        <li>
          Stop the clock: nothing grows. Wait a few seconds and start it again. The count jumps: the engine
          pays for the time it missed.
        </li>
        <li>Choose how long to be away, and leave and come back.</li>
      </Try>

      <h2>What the engine does for you</h2>
      <p>Every idle game needs the same four things underneath it. The engine does all four.</p>
      <p>
        <strong>It keeps the numbers.</strong> Everything the game knows (how many bubbles, how many burners)
        sits in one place, as plain data. The next page starts there.
      </p>
      <p>
        <strong>It moves time forward.</strong> Ten times a second the engine runs a{" "}
        <Term id="tick">tick</Term>: it works out how much time has passed and lets each part of the game do
        what it does in that time. The pot adds a tenth of a bubble, each burner another tenth. That is the
        clock in the panel, and the count of ticks beside it.
      </p>
      <p>
        <strong>It saves.</strong> A second after anything changes, the engine writes the game down as text in
        your browser: a <Term id="save">save</Term>. Open "The save, as stored" in the panel and watch it
        change. Reload this page, and the pot is as you left it.
      </p>
      <p>
        <strong>It pays for time away.</strong> When the game opens again, the engine works out how long it
        was closed and pays for all of it at once: the <Term id="catch-up">catch-up</Term>. "Leave and come
        back" does exactly what closing the tab for that long would do. It does not fake the payment: it moves
        this page's clock on and lets the engine run its catch-up, the same code a real return runs.
      </p>

      <h2>What it leaves to you</h2>
      <p>
        The engine draws nothing. It has no colours, no buttons and no words of its own: the panel's look is
        this site's, and your game will have its own. Nor does it know what a bubble is. What your game is
        about, what things cost and what they are called is yours to write.
      </p>
      <p>
        Over the next pages you build this game, one small idea at a time, starting with the number in the
        pot. There is nothing to install until the end: every page runs the real engine in your browser.
      </p>
    </>
  ),
  prev: { href: "../index.html", title: "The docs", label: "Back to" },
});
