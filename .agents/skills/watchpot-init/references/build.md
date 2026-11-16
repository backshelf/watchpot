# The build

The scaffold produces a game that runs, saves, paces and passes its gates in a few minutes. It is not the game: it is
a skeleton with the right words on it, and it looks and plays like every other scaffold. The build is where the game
gets made, and it is most of the work. The new game's own `.claude/CLAUDE.md` lists the seven passes with a "done
when" for each; this file is how to do each one well. Do them in order, commit after each (`feat(<area>): …`,
`bun run verify` green), and keep going until every "done when" holds. The engine is what makes this affordable:
mechanism, behaviour, saving, pacing and the shader container are already written, so the hours go into what only
this game has.

Before the first pass, add four short sections to the game's `.claude/specs/concept.md` (the scaffold wrote the
fiction, the loop, the look and the moment from the interview) so every later decision has something to answer to:
**the shape** (the loop in one paragraph: what the player does in a minute, in ten, in a day), **the surface** (the
shader language, `shaders.md`), **the invention** (the one mechanic no other game on the engine has), and **the
pacing plan** (played hours the game should last, and what the player is doing in each stretch).

## 1. Shape: make the loop this game's

- Add every system the interview chose that the scaffold does not wire, from its recipe page (`systems.md`): a content
  file in `src/content/`, the factory call in `src/game/`, a line in `defineGame`, a screen, a row in the pacing
  contract. A factory's own moves reach the sim without more code; check with `bun run sim` that the auto-player
  buys from it (it warns once about a feature with a `buy…` action and no moves).
- Build every connection with the engine's: a feature reads another through `reach`, a computed value is `derived`,
  an effect is a contribution or a source on the game's `stats` feature, a reset layer is `definePrestige` (its pace
  and peak are the layer's). `src/game/` holding a hand-written fold, a copied price loop, a second copy of a number
  that a step keeps in step, or a whole-game state type is the sign the engine's own was missed.
- Take out what the game does not want. A template tab nobody chose is clutter.
- **Build the invention.** Decide whether it is generic (then it is built in the engine and released before the game
  uses it: `systems.md` › When the engine lacks it) or the game's own, a `defineFeature()` shaped like
  `examples/invention.ts`: derived values, a `produce` step that names its pass, moves for the sim.
- Re-pace: `bun run sim -- --contract`. Move a band only on purpose, and say why in the commit. For a move that does
  not pay at once (an unlock, a cap), state its `worth`; `autoPlayer`'s `objective` is income a second unless the
  game's loop wants something else (`examples/sim-and-tests.ts`).
- **Tests earn their place.** Test what can break in the game's own logic (an ordering, an invariant, a boundary) and
  one failing test per bug fix. No tests for content, strings, shader text or a retune: happy-dom cannot judge a look,
  the sim judges pacing, and every test runs at every gate. The scaffold already runs two checks worth keeping green:
  `test/decimals.test.ts` (no two Decimals compared with `<` or `===`; use `.lt()`, `.gte()`, `.eq()`) and
  `test/parity.test.ts` (`plainParity`: the sim's plain store and the page's real store play one seed identically).
  A feature that fails parity usually keeps something outside the state; fix the feature, not the test.

## 2. Content: depth, in the voice

- The scaffold writes the minimum. A game wants eight to twelve producers, not five; an upgrade list with a reason to
  pick an order; an achievement wall of at least four full rows (the wall is a promise of how much game there is, so
  write names that make the player want the next one, and include a few secret ones); flavour that changes as the game
  goes on (the ticker, the journal of time away).
- Every name and line is written for this fiction, in the voice, specific and short. Nothing called "Upgrade 3". No
  line that would fit another game.
- All of it lives in `src/content/`. A number is content too: tune it there, then run the contract. Effects are
  `{ stat, add }` or `{ stat, mul }` typed to the game's stat ids; an upgrade with more than one rank says its
  `costGrowth`; cost curves round up unless told `round: "none"`.

## 3. Identity: the page

- The components in `src/ui/` arrive as plain skeletons on the engine's headless primitives, reading a small token
  contract (`src/ui/README.md`). They are the game's now: restyle every one. Start from the tokens
  (`design/tokens.json`, then `bun run tokens`), then each component's CSS, then delete what the game does not use.
- Compose the main screen around the hero surface and the moment, not as a stack of panels. Where does the eye rest?
  What is the biggest thing on the page, and is it the thing the game is about?
- If an `impeccable` skill is installed, use it for this pass (`shape` for the brief if the look is not yet decided,
  then `craft`; `bolder` if it came out timid, `polish` at the end), giving it the game's concept and voice.
- Phone and desktop both: the shell's wide and narrow layouts are different compositions, not one squeezed.
- Icons and glyphs are drawn for the game (inline SVG), not picked from the template's set.

## 4. Shaders: the surface

Follow `shaders.md`. The floor is a backdrop that is the place, a hero surface, light as feedback, and the moment;
each with a `still`, a reduced-motion frame and a budget, each fed by the game's numbers.

## 5. Feel: every action answers

- A sound for every action the player takes on purpose, designed for the fiction: retune the template's zzfx voices,
  or build a pack from recordings (`buildPack`, `docs/sound-packs.md`) and give each cue `takes` with the zzfx voice
  kept until the pack has loaded. Quiet enough to hear a thousand times; the mix on buses (`docs/sound-mix.md`).
- A press or a buy shows what it did where it happened. `docs/feel.md` is the mechanism: `createGestures` knows whose
  doing a change was, `createMarks` and `kick` answer it at the point, `Count` counts a figure up, `createDirector`
  rations what plays when the machine makes hundreds of things a minute. `FloatingNumbers` and the rest of the
  headless primitives are in `docs/ui.md`. Big events (a milestone, an achievement, a top-rung pull) get more: a
  shake, a toast, a `u_pulse` (`createPulse`).
- Coming back after time away says what happened while the player was gone (`docs/time-away.md`).
- Reduced motion turns all of it down to state changes; nothing is lost but the movement.

- **Played by a person.** For every active mechanic, state the real-minute wait between payoffs and keep it under
  about two minutes; long waits belong only to idle and offline progress. Every extreme a UI shows must be reachable
  in normal play. The sim measures pacing, not boredom: check both, and state the wait from a sim line.
- **Pacing is in played hours.** Plan, measure and report pacing as hours a person spends actively playing, for a
  player who no-lifes it. Nobody starts an idle game and goes idle: the first three or four hours are played straight
  whatever the session length (which shapes only what comes after), unless being idle is the game's gimmick. Measure
  with the engine's `activeSchedule`, not a session schedule, and state the played hours in the report.
- **A long target is filled, not stretched.** "A page a day" means a day's worth of things to do on that page, not
  prices raised until it takes a day. When a stretch runs short of its target, add content there (upgrades, a
  mechanic, a goal); slow a number only when it is out of line with the content around it.
- **The length is what the content makes it.** A target length is a guess at how much there is to do, never a quota.
  When a stretch plays shorter than planned, add things worth doing there or let the game be shorter; never slow a
  rate, raise a price or throttle an automation to reach the target, and never pad with filler ranks either.
- **A currency that compounds drains its shop at a steady rate.** When a currency grows by a share of itself (a market
  trader, interest), geometric prices turn that into a constant number of buys an hour: too timid and the page is dead
  for hours, bold and the whole shop is bought in an afternoon and its multipliers land early. Measure buys per played
  hour on `activeSchedule` before shipping the page, and size the shop to the rate that feels right.
- **Nobody times trades by hand.** A buy-low-sell-high loop the player must watch is a chore: give a market its
  `trader` from the open (or a different shape), so the player only spends.
- **Check the page at its extremes.** The longest figure the game can print on one line, a row at its max rank, the
  tallest screen's content inside the window: look at each in the browser before calling a screen done.
- **A big game is fitted, not tuned by hand.** Once there are more gates than prices can be set by feel, write the
  plan (the minute each gate should open) and let the sim price them: `docs/plan-and-fit.md`, then `docs/fit-kit.md`
  for a long run (`fitTable`, snapshots and resuming, `proveFit`, the profiler `profileSim`). Three things before
  trusting a fit: the proof replays the fit's own run, at the fit's quality (fit at `exact` to prove; a `quick` draft
  is unproved); a table that is to be proved takes `priceAbove`, not `nicePrice`; and a `derived` value that reads
  the fit table is not recomputed when the fit writes a price, so read the table in a step or a `select`.

## 6. The moment

Build the interview's one memorable moment for real: the mechanics that make it happen, the shader that carries it,
the sound, the words, and a way to replay it in development (`#dev` on the engine's `DevPanel`, which warps time and
edits the save; `pinShaderClock` holds every canvas on one instant for a screenshot; a URL flag on a throwaway save).
It is the thing the player will describe to someone else.

## 7. Proof

- `bun run gates:full` once (typecheck, lint, every test, the build, the slow tier, the pacing contract).
- In a browser (`bun run dev`; one tab, closed when done): every screen at desktop and at phone width, a clean
  console, the save surviving a reload, the main loop playable by keyboard alone, the OS reduced-motion setting
  honoured, a light and a dark scheme if the game has both. The checks do not run a browser: a shader that fails to
  compile and a blank page both pass them.
- **The engine sweep.** Read the game's `src/` for anything generic (the test in `systems.md`) and move it to the
  engine, released, before calling the game done.
- The game's `.claude/CLAUDE.md` describes the code as it now is: its map, its rules, its commands.

## The report

A few lines, under the game's spoiler rule (the player has not played it yet: describe by area and count, never by
content): where it is, what shape it has, what was invented and whether it went into the engine (and in which
release), the sim's day-7 row (`bun run sim -- --sessions`), the commands. Then one question: create the GitHub
repository and push, or play first.
