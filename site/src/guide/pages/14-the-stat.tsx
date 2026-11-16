// Getting started, step 14: the stat. Heat as the one place every multiplier on the stove meets: the lid as a source
// with one effect, a second source the reader adds with a switch, and the breakdown that says where the number came
// from (adds summed onto the base, then the multipliers).
import type { StateOf } from "watchpot/core";
import type * as Simmer from "../../../../docs/examples/simmer/game-wallet";
import {
  Act,
  Actions,
  Breakdown,
  type BreakdownRow,
  Code,
  Controls,
  choice,
  definePage,
  figure,
  Note,
  Panel,
  Readout,
  Readouts,
  slider,
  Term,
  Try,
  useExample,
  useSnapshot,
  useView,
} from "../kit";

type S = StateOf<typeof Simmer.game.features>;
type Example = typeof Simmer;

/** An effect's amount as a breakdown writes it. */
const gives = (op: "add" | "mul", value: unknown) => `${op === "mul" ? "×" : "+"}${figure(value)}`;

function WhereHeatComesFrom() {
  const { stats, LID_HEAT } = useExample<Example>();
  const { state } = useSnapshot();
  const explained = stats.select.explain(state, "heat");
  const lidOn = (state as S).lid.on;
  const rows: BreakdownRow[] = explained.parts.map((part) => ({
    label: part.label,
    gives: gives(part.op, part.value),
  }));
  // A source that is not counting is not in the engine's breakdown: list the lid anyway, ruled through.
  if (!lidOn) {
    const lid = LID_HEAT.effects[0];
    rows.unshift({ label: LID_HEAT.label, gives: gives("mul", lid.mul), off: "off: not counting" });
  }
  return (
    <Breakdown
      title="Where heat comes from"
      base={figure(explained.base)}
      rows={rows}
      total={{ label: "Heat", value: figure(explained.value) }}
    />
  );
}

function TheStat() {
  const lidOn = useView((s) => (s as S).lid.on);
  return (
    <Panel title="Heat, the stat">
      <Readouts>
        <Readout<S> big label="Heat" select={(s) => figure(s.stats.heat)} />
      </Readouts>
      <Actions>
        <Act call="lid.toggle">{lidOn ? "Take the lid off" : "Put the lid on"}</Act>
      </Actions>
      <WhereHeatComesFrom />
    </Panel>
  );
}

export default definePage({
  title: "One place for every multiplier: the stat",
  idea: (
    <>
      When several things change one number, they meet in one place, a stat. Each thing is a source with an
      effect on it, and the stat works out what they come to.
    </>
  ),
  game: { file: "simmer/game-wallet.ts", keep: "local", clock: true },
  params: {
    sources: choice({
      at: "stats",
      find: "sources: [LID_HEAT]",
      token: "[LID_HEAT]",
      label: "Heat's sources",
      options: [
        { label: "The lid", code: "[LID_HEAT]" },
        { label: "The lid and a thick base", code: "[LID_HEAT, THICK_BASE_HEAT]" },
      ],
    }),
    lid: slider({
      at: "LID_HEAT",
      find: "mul: 2",
      token: "2",
      min: 1,
      max: 4,
      step: 0.5,
      code: (value) => String(value),
      label: "The lid multiplies heat by",
    }),
  },
  code: {
    lid: { at: "LID_HEAT" },
    stats: { at: "stats" },
    base: { at: "THICK_BASE_HEAT" },
  },
  Panel: TheStat,
  Body: () => (
    <>
      <p>
        The stove makes a bubble a second for each burner. Soon a lot of things will want to change that: the
        lid, an upgrade from a shop, a boost that lasts thirty seconds, a reward for starting over. If each of
        them changed the stove's rate itself, the stove would grow a line for every one, and each new thing
        would mean finding every number it touches.
      </p>
      <p>
        Instead they all go to one place: a <Term id="stat">stat</Term>, a named number that many things can
        change. Simmer's is <code>heat</code>. It starts at 1, and (on the next page) the stove's rate is
        multiplied by it. Anything that wants the stove hotter changes heat, and never touches the stove.
      </p>

      <h2>A source and its effect</h2>
      <p>Each thing that changes a stat is a source. Here is the lid's:</p>
      <Code id="lid" />
      <p>
        While <code>active</code> says the lid is on, the source applies its <code>effects</code>. It has one,
        and an <Term id="effect">effect</Term> is plain data: which stat, and an amount to multiply by (
        <code>mul</code>) or to add (<code>add</code>). <code>{'{ stat: "heat", mul: 2 }'}</code> doubles
        heat. <code>label</code> is what a breakdown calls the source, and <code>owner</code> the feature it
        belongs to.
      </p>

      <h2>The stats feature</h2>
      <Code id="stats" />
      <p>
        <code>defineStats</code> writes a feature from a description: the stats there are (<code>heat</code>,
        with a base of 1, because it multiplies) and the sources that change them. <code>vocab</code> is the
        game's words from page 11, where <code>heat</code> is named; <code>reach: [lid]</code> lets a source
        read the lid. The feature serves every stat as a derived value: <code>s.stats.heat</code>, a Decimal,
        worked out again when anything a source reads has changed, and never saved.
      </p>
      <Controls />
      <Try>
        <li>Put the lid on. Heat goes from 1 to 2, and the breakdown counts the lid.</li>
        <li>Slide the lid's multiplier to 3. Heat follows at once, while the lid is on.</li>
        <li>
          Take the lid off. Its row stays in the panel's list, ruled through: declared, but not counting now.
        </li>
        <li>
          Switch the sources to "The lid and a thick base", a second source (below). Heat with the lid off is
          1.5; put the lid on and it is 3: (1 + 0.5) × 2. The stat adds every add onto the base first, then
          multiplies by every multiplier, whatever order the sources were listed in.
        </li>
      </Try>
      <Code id="base" />
      <p>
        A source with no <code>active</code> always counts. Adding it to the game was one name in a list:
        nothing else in the game knows it exists, and nothing else had to change.
      </p>
      <Note title="Where sources come from">
        <p>
          Here, sources are written by hand. In a bigger game most come from the engine's other features: each
          upgrade bought in a shop, each running boost, each reward hands the stats an effect, and the stats
          fold them in the same way. Page 17's shop does it for a second stat.
        </p>
      </Note>
    </>
  ),
});
