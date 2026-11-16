// Getting started, step 7: time away. Simmer's own page runs in the panel; the reader leaves for a while and comes
// back to the example's own welcome-back note, and chooses which passes the stove's step runs in.
import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { resolvedSteps } from "watchpot/core";
import * as watchpotReact from "watchpot/react";
import type * as Simmer from "../../../../docs/examples/simmer/game";
import {
  Away,
  Code,
  Controls,
  choice,
  definePage,
  ExamplePage,
  Note,
  Panel,
  StartOver,
  Term,
  Try,
  useExample,
} from "../kit";

/** The steps a pass runs, as the engine lists them, the engine's own clock steps left out. */
function PassSteps() {
  const { game } = useExample<typeof Simmer>("simmer/game.ts");
  if (!game) return null;
  const own = (pass: "tick" | "catchUp") =>
    resolvedSteps(game, pass).filter((id) => !id.startsWith("clock."));
  return (
    <div className="passes">
      <p className="panel__label">The steps each pass runs</p>
      <dl className="passes__list">
        {(
          [
            ["A tick", "tick"],
            ["The catch-up", "catchUp"],
          ] as const
        ).map(([name, pass]) => (
          <div key={pass} className="passes__row">
            <dt>{name}</dt>
            <dd>
              {own(pass).map((id) => (
                <code key={id} className="passes__step">
                  {id}
                </code>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TheReturn() {
  return (
    <Panel title="Simmer, coming back">
      <ExamplePage label="What main.tsx draws" />
      <Away week />
      <PassSteps />
      <StartOver />
    </Panel>
  );
}

export default definePage({
  title: "Time away: the catch-up",
  idea: (
    <>
      When the page opens, the engine first pays for the time it was closed, in one go. Each step that pays
      says whether it runs then.
    </>
  ),
  game: {
    file: "simmer/main.tsx",
    externals: { react, "react/jsx-runtime": jsxRuntime, "watchpot/react": watchpotReact },
    clock: "example",
    keep: "local",
  },
  params: {
    burn: choice({
      file: "simmer/game.ts",
      at: "stove > steps > produce > burn",
      find: 'pass: "both"',
      token: '"both"',
      label: "The stove's burn runs in",
      options: [
        { label: "Both", code: '"both"' },
        { label: "Ticks only", code: '"tick"' },
        { label: "The catch-up only", code: '"catchUp"' },
      ],
    }),
  },
  code: {
    simmer: { at: "pot > steps > produce > simmer", file: "simmer/game.ts" },
    burn: { at: "stove > steps > produce > burn", file: "simmer/game.ts" },
    summarize: { at: "summarize" },
    note: { at: "AwayNote" },
  },
  Panel: TheReturn,
  Body: () => (
    <>
      <p>
        Close an idle game for an hour, open it again, and it has kept going: the hour was paid for. Players
        call this offline progress, and it is most of what makes an idle game idle. In watchpot it is the same
        code as the clock you have met, run once more.
      </p>
      <p>
        When the page opens, the clock does not tick straight away. First it reads from the save when the game
        last ran, works out how long it has been, and runs every step once over that whole gap, with{" "}
        <code>ctx.dtMs</code> set to its length. That one run is the <Term id="catch-up">catch-up</Term>. The
        pot's simmer is handed an hour, multiplies its rate by it as it does for a tenth of a second, and pays
        3,600 bubbles. Page 4's rule, multiply by the time, is what makes that right.
      </p>

      <h2>Which steps run in the catch-up</h2>
      <p>
        A tick and a catch-up are the two kinds of <Term id="pass">pass</Term>: one run of the game's steps
        over some time. Every step that pays says which passes it runs in. The pot's simmer runs in both:
      </p>
      <Code id="simmer" />
      <p>
        <code>{'"both"'}</code> is the plain choice: the step pays the same whether the game is open or not. A
        step can also say <code>{'"tick"'}</code> (only while the game is open) or <code>{'"catchUp"'}</code>{" "}
        (only for time away). The engine makes you write it on every step that pays, so that paying for time
        away is always a choice you made. Here is the stove's step, with the choice yours:
      </p>
      <Code id="burn" />
      <Controls />
      <Try>
        <li>
          Choose an hour and press "Leave and come back". The page's own note appears at the top: the pot made
          3,600 bubbles while you were away.
        </li>
        <li>Light a few burners with them, then leave for an hour again. The burners paid too.</li>
        <li>
          Set the stove's burn to "Ticks only" and leave again. Only the pot paid: the stove waits for you.
          The panel's list shows the burn gone from the catch-up.
        </li>
        <li>
          Try "The catch-up only": the stove pays nothing while you watch, and everything while you are gone.
        </li>
        <li>
          Close this tab for a minute or more and open it again. That is the real thing, and the same note.
        </li>
      </Try>

      <h2>Telling the player</h2>
      <p>
        Paying for the time is half of it; the player should hear about it. Simmer's page has a note at the
        top that appears after an absence. It starts with a function that works out what to say:
      </p>
      <Code id="summarize" />
      <p>
        It is handed the whole state from just before the catch-up (<code>before</code>), the state just after
        it (<code>after</code>) and how long the player was away (<code>ms</code>). The difference in bubbles
        is what the absence made.
      </p>
      <Code id="note" />
      <p>
        <code>useAwayReport</code> is a hook from <code>watchpot/react</code> that listens for the catch-up.
        When one covers 30 seconds or more, it calls <code>summarize</code> and keeps what it returned as{" "}
        <code>report</code> until the player presses the button, which calls <code>dismiss</code>. A shorter
        absence is paid for without a word.
      </p>
      <Note title="Simmer pays for any absence, in full">
        <p>
          Leave for a week and the pot pays a week, at the full rate. That is fine for a first game and wrong
          for most real ones, which pay part of the time, up to a limit.{" "}
          <a href="../time-away.html">Time away</a> in the reference shows how.
        </p>
      </Note>
    </>
  ),
});
