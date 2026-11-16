// Getting started, step 15: the stove's rate is a derived value that reads heat. The reader turns the lid, the
// burners and the lid's multiplier and watches flame × heat = rate; a switch makes the rate stop reading heat, and
// the lid goes on doubling a number nothing reads.
import type { ReactNode } from "react";
import { fmt, fmtRate, type StateOf } from "watchpot/core";
import type * as Simmer from "../../../../docs/examples/simmer/game-wallet";
import {
  Act,
  Actions,
  Controls,
  choice,
  definePage,
  Note,
  Panel,
  Readout,
  Readouts,
  slider,
  stepper,
  Try,
  useExample,
  useView,
} from "../kit";
import { CodeName, figure, Listing } from "../kit/more";

type S = StateOf<typeof Simmer.game.features>;
type Example = typeof Simmer;

/** flame × heat = rate, as three figures in a row. */
function Product() {
  const { flameOf } = useExample<Example>();
  const flame = useView((s) => fmt(flameOf((s as S).stove.burners)).text);
  const heat = useView((s) => figure((s as S).stats.heat));
  const rate = useView((s) => fmtRate((s as S).stove.perSecond));
  const cell = (label: ReactNode, value: string) => (
    <div className="readout">
      <span className="readout__label">{label}</span>
      <span className="readout__value num">{value}</span>
    </div>
  );
  const op = (sign: string, said: string) => (
    <span className="num" style={{ alignSelf: "end", fontSize: "1.25rem", color: "var(--ink-soft)" }}>
      <span aria-hidden="true">{sign}</span>
      <span className="visually-hidden">{said}</span>
    </span>
  );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr auto 1.2fr",
        gap: "0.6rem",
        alignItems: "end",
      }}
    >
      {cell("Flame", flame)}
      {op("×", "times")}
      {cell("Heat", heat)}
      {op("=", "is")}
      {cell(<CodeName>perSecond</CodeName>, rate)}
    </div>
  );
}

function TheRate() {
  const lidOn = useView((s) => (s as S).lid.on);
  return (
    <Panel title="The stove's rate">
      <Readouts>
        <Readout<S> big label="Bubbles" select={(s) => fmt(s.wallet.bubbles).text} />
        <Readout<S> label="Burners lit" select={(s) => s.stove.burners} />
        <Readout<S> label="Lid" select={(s) => (s.lid.on ? "on" : "off")} />
      </Readouts>
      <Product />
      <Actions>
        <Act call="lid.toggle">{lidOn ? "Take the lid off" : "Put the lid on"}</Act>
      </Actions>
    </Panel>
  );
}

export default definePage({
  title: "The rate reads the stat",
  idea: (
    <>
      The stove's rate is a derived value that reads the stat: the burners' own flame, times heat. Nothing
      that changes heat needs to know the stove exists.
    </>
  ),
  game: { file: "simmer/game-wallet.ts", keep: "fresh", clock: true },
  params: {
    burners: stepper({
      at: "stove > initial",
      find: "burners: 0",
      token: "0",
      min: 0,
      max: 20,
      step: 1,
      label: "Burners lit at the start",
    }),
    reads: choice({
      at: "stove > derived",
      find: "flameOf(s.stove.burners).mul(s.stats.heat)",
      token: "s.stats.heat",
      label: "The rate",
      options: [
        { label: "Reads heat", code: "s.stats.heat" },
        { label: "Ignores heat", code: "1" },
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
    rate: { at: "stove > derived > perSecond" },
    flame: { at: "flameOf" },
    burn: { at: "stove > steps > produce > burn" },
    lid: { at: "LID_HEAT" },
    initial: { at: "stove > initial" },
  },
  Panel: TheRate,
  Body: () => (
    <>
      <p>
        Heat is ready. Now the stove reads it. Its rate is one more derived value, in the same first layer as
        the price:
      </p>
      <Listing id="rate" />
      <p>
        <code>flameOf(burners)</code> is the stove's own rate before anything changes it, a bubble a second
        for each burner:
      </p>
      <Listing id="flame" />
      <p>
        Times <code>s.stats.heat</code>, it is the rate the stove pays. <code>s.stats</code> is another
        feature's slice, so the stove names the stats in its reach, as it named the wallet. Heat is the stats'
        derived value and the rate is the stove's, so here a derived value reads another feature's, with no
        layer between them.
      </p>
      <p>The burners the stove starts with, and the lid's multiplier, are yours to set:</p>
      <Listing id="initial" />
      <Listing id="lid" />
      <Controls />
      <Try>
        <li>
          Put the lid on. Heat doubles, and the rate doubles with it. The stove's code did not change, and the
          lid's code never mentions the stove.
        </li>
        <li>Step the burners up. The flame grows, heat holds, and the rate is the two multiplied.</li>
        <li>Slide the lid's multiplier to 4 and put the lid on: four times the rate.</li>
        <li>
          Switch the rate to "Ignores heat". Put the lid on and off: heat still doubles, and the rate never
          moves. A stat does nothing until something reads it.
        </li>
      </Try>

      <h2>Where the rate is spent</h2>
      <Listing id="burn" />
      <p>
        The stove's burn step pays the rate times the time that passed, as the pot's simmer pays its own.
        Because it reads <code>s.stove.perSecond</code>, it pays whatever heat says now, and it will pay
        whatever a shop, a boost or a reward makes heat later, without a line changing here. (This step runs
        on live ticks only; time away is paid by the stove's other step, at half the rate.)
      </p>
      <Note title="An order you never wrote">
        <p>
          The lid's source is read before heat, heat before the rate, and the rate before the step that spends
          it. You never said so: the engine follows what each value reads. Say what a number is made of, once,
          and read it anywhere.
        </p>
      </Note>
    </>
  ),
});
