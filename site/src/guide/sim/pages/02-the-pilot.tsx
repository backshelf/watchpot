// Sim, step 2: the pilot. The auto-player, the moves a feature declares, what a move's worth is and where it comes
// from, and the schedules that decide how much of a day is played and how much waited.
import * as Sim from "watchpot/sim";
import { Code, Controls, definePage, Note, Panel, slider, Term, Try } from "../../kit";
import { PilotPanel } from "../demos/pilot";

export default definePage({
  title: "The pilot: what plays the game",
  idea: (
    <>
      Every number the sim has comes from someone playing. The pilot is that someone: it looks, buys the move
      worth the most for what it costs, and takes what is free.
    </>
  ),
  game: {
    file: "sim-oven.ts",
    store: false,
    keep: "memory",
    clock: false,
    externals: { "watchpot/sim": Sim },
  },
  params: {
    worth: slider({
      at: "ALMANAC_WORTH",
      find: "ALMANAC_WORTH = 5",
      token: "5",
      min: 0,
      max: 10,
      step: 0.5,
      label: "The almanac is worth",
    }),
  },
  code: {
    moves: { at: "oven > moves" },
    worth: { at: "ALMANAC_WORTH" },
    look: { at: "lookOnce" },
    active: { at: "ACTIVE" },
  },
  Panel: () => (
    <Panel title="One look, and a day of looks">
      <PilotPanel />
    </Panel>
  ),
  Body: () => (
    <>
      <p>
        A fit plays a game thousands of times faster than a person. Somebody has to make the purchases, and it
        cannot be you. The <Term id="auto-player">auto-player</Term> is the sim's stand-in: no code of your
        own, no script per game. It reads what the game says a player could do right now, and does the best of
        it.
      </p>
      <p>
        What a player could do is a <Term id="move">move</Term>, declared by the feature that owns it: an id,
        what it costs, and a function that plays it through the store's own actions. The oven's are here. A
        fitting costs what the fit table says, so before a fit prices it, it costs <code>BLOCKED</code> and
        the pilot cannot touch it.
      </p>
      <Code id="moves" />
      <p>
        Most of those moves have no <code>worth</code> written beside them. The burner's and a fitting's are
        worked out: the pilot buys the move on a trial copy of the state and asks what it did to the{" "}
        <Term id="objective">objective</Term>, the one number the player is trying to grow. Here that is what
        the oven makes a second. A fitting doubles it, so a fitting is worth its own rate; a burner is worth
        one.
      </p>
      <p>
        The almanac is the odd one, and it is the move to look at. It pays the whole time the tab is closed
        instead of half, and nothing about that moves the rate, so the objective comes to nothing and the move
        would never be taken. A move that changes something the objective cannot see states its own worth.
        Here that number is a constant, and the page's control moves it:
      </p>
      <Code id="worth" />
      <p>The panel's look is one call, on a fresh world with sixty bubbles in hand:</p>
      <Code id="look" />
      <Controls />
      <Try>
        <li>
          Press "Let the pilot look". With nothing to buy on the shelf it buys the almanac and one burner, and
          that is all 60 bubbles reach.
        </li>
        <li>
          Slide the almanac's worth to 10 and look again: still the almanac, first. Slide it to 2 and look:
          the pilot leaves it on the shelf and buys four burners instead.
        </li>
        <li>
          Work out the boundary. The almanac costs 40 and the first burner 10: the pilot buys the better worth
          per bubble it has, so at a worth of 4 the almanac is worth exactly what a burner is, and past it the
          almanac wins.
        </li>
        <li>
          A move worth nothing or less is never taken, which is why setting the worth to 0 leaves the almanac
          alone for good.
        </li>
      </Try>

      <h2>How much of a day is played</h2>
      <p>
        The pilot decides what to buy; the <Term id="schedule">schedule</Term> decides when it is at the game.
        This is the other half of pacing, and the half that catches people out. A day has 24 hours; a person
        at the game has far fewer.
      </p>
      <Code id="active" />
      <p>
        <code>activeSchedule</code> is a player at the game around the clock, a look every ten seconds, so
        every hour of the run is an hour played. That is what a fit and a contract measure, because nobody
        starts an idle game and goes idle. The panel also plays a day of two other people: one with the tab
        open from 08:00 to 23:00, and one who looks in five times and sleeps. The played and waited columns
        are the point: the tab-open day has 15 hours to earn in and 9 to wait, the checker's about 1 to earn
        in and 23 to wait, and no price change makes up for the difference.
      </p>
      <p>
        Which is why the schedule is never mixed into a fit. A fit plays every minute as a played minute; a
        session schedule answers a different question, about a week, and its hours include sleep.
      </p>
      <Note title="One look, one day, not a run">
        <p>
          The numbers on this page come from one look and one day's plan, and neither is a run. The look is a
          single call, the day is arithmetic on a schedule. Both are what the engine does between the presses,
          and both are what the pages after this one build on.
        </p>
      </Note>
    </>
  ),
});
