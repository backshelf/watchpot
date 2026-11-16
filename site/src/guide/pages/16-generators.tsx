// Getting started, step 16: generators from a factory. Simmer's kettles on `defineGenerators`: the reader picks a buy
// mode and buys, and each row's count, price and rate follow; the output doubles at ten. Sliders move a kettle's rate
// and what a milestone multiplies by.
import { useState } from "react";
import { fmt, fmtRate, type StateOf } from "watchpot/core";
import type { BuyMode } from "watchpot/ui";
import type * as FirstPage from "../../../../docs/examples/guide-first-page";
import {
  Act,
  Code,
  Controls,
  definePage,
  Note,
  Panel,
  PanelChoice,
  Readout,
  Readouts,
  Shortcut,
  StartOver,
  slider,
  Term,
  Try,
  useExample,
  useSnapshot,
} from "../kit";

type S = StateOf<typeof FirstPage.game.features>;
type Example = typeof FirstPage;

const MODES: readonly { value: BuyMode; label: string }[] = [
  { value: 1, label: "×1" },
  { value: 10, label: "×10" },
  { value: "next", label: "Next" },
  { value: "max", label: "Max" },
];

function Rows({ mode }: { mode: BuyMode }) {
  const { kettles, kettleRow } = useExample<Example>();
  const { state } = useSnapshot();
  const s = state as S;
  return (
    <ul className="buyrows">
      {kettles.def.list.map((def) => {
        const row = kettleRow(s, def.id, mode, s.clock.lastSeen);
        return (
          <li key={def.id} className="buyrows__row">
            <span className="buyrows__name">
              {def.name} <span className="num buyrows__count">× {row.owned}</span>
            </span>
            <Act<S>
              call="kettles.buy"
              args={[def.id, Math.max(1, row.count)]}
              ready={(g) => kettleRow(g, def.id, mode, g.clock.lastSeen).canBuy}
            >
              Buy {Math.max(1, row.count)}: <span className="num">{row.price}</span>
            </Act>
            <span className="num buyrows__line">
              {row.perSecond}/s
              {row.untilNext === null ? ", every milestone passed" : `, doubles in ${row.untilNext}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TheKettles() {
  const [mode, setMode] = useState<BuyMode>(1);
  return (
    <Panel title="Simmer's kettles">
      <Readouts>
        <Readout<S> big label="Bubbles" select={(s) => fmt(s.wallet.bubbles).text} />
        <Readout<S> label="The kettles make" select={(s) => fmtRate(s.kettles.perSecond.bubbles ?? 0)} />
      </Readouts>
      <Shortcut
        call="wallet.credit"
        args={["bubbles", 1000]}
        note="The wallet's credit: no waiting on this page."
      >
        Add 1,000 bubbles
      </Shortcut>
      <PanelChoice title="Each press buys" options={MODES} value={mode} onChange={setMode} />
      <Rows mode={mode} />
      <StartOver />
    </Panel>
  );
}

export default definePage({
  title: "Buildings from a factory: generators",
  idea: (
    <>
      The engine writes generators for you. Describe what can be bought, and it does the prices, buying many
      at once, the milestones and the pay while the player is away.
    </>
  ),
  game: { file: "guide-first-page.ts", keep: "local", clock: true },
  params: {
    rate: slider({
      at: "kettles",
      find: "rate: 5,",
      token: "5",
      min: 1,
      max: 20,
      step: 1,
      unit: "a second",
      label: "A kettle makes",
    }),
    milestone: slider({
      at: "DOUBLINGS",
      find: "mult: 2",
      token: "2",
      min: 1,
      max: 5,
      step: 0.5,
      code: (value) => String(value),
      label: "A milestone multiplies by",
    }),
  },
  code: {
    kettles: { at: "kettles", omit: ["mult"] },
    doublings: { at: "DOUBLINGS" },
    row: { at: "kettleRow" },
  },
  Panel: TheKettles,
  Body: () => (
    <>
      <p>
        You wrote the burner by hand: a price, a buy action, a step that pays. Most idle games have a whole
        row of such things, and they all need the same machinery: a price that grows, a button that buys one
        or ten or as many as you can afford, a bonus at certain counts, pay while the player is away. The
        engine writes all of it from a description.
      </p>
      <p>
        A function that writes a feature for you from a description is a <Term id="factory">factory</Term>.
        You have used two already, <code>defineCurrencies</code> and <code>defineStats</code>.{" "}
        <code>defineGenerators</code> is the one for generators. Here is Simmer's shelf of kettles, from
        chapter 6's game:
      </p>
      <Code id="kettles" />
      <p>
        <code>wallet</code> is where the kettles are paid for and where they pay. Each entry of{" "}
        <code>list</code> is one generator: its <code>id</code>, a <code>name</code> of your own (the engine
        carries it along), a <code>cost</code> with a base and a growth exactly like the burner's, the
        currency it <code>pays</code> with and the one it <code>makes</code> (words from the vocabulary), and
        its <code>rate</code>: bubbles a second for each one owned. The game's own multiplier is folded away
        here; it reads the shop and a boost.
      </p>
      <Code id="doublings" />
      <p>
        A <Term id="milestone">milestone</Term> is a count at which a generator's output is multiplied: at 10,
        25, 50 and 100 of one kind, that kind doubles. <code>global</code> triples every kind once each has
        25. <code>away</code> says what the kettles pay while the player is gone: half, for eight hours at
        most.
      </p>
      <Controls />
      <Try>
        <li>Add 1,000 bubbles, then buy a kettle. It makes 5 a second.</li>
        <li>Slide a kettle's rate to 10: the row's rate doubles at once, for the kettles already bought.</li>
        <li>
          Pick "×10". The button's count and price change: the engine adds up ten prices along the curve. Buy
          them. Past 10 kettles the row's rate doubles, and the next milestone is 25. Slide what a milestone
          multiplies by to 4, and the jump at 10 is four times instead.
        </li>
        <li>
          Pick "Next": it buys exactly enough to reach the next milestone. Pick "Max": as many as the wallet
          covers.
        </li>
        <li>Buy a cauldron: a second kind, dearer and faster, from the same description.</li>
      </Try>

      <h2>What the factory hands back</h2>
      <p>
        <code>kettles</code> is a feature like the stove. List it in the game, and <code>s.kettles</code> is
        its slice (how many of each kind are owned), with <code>kettles.buy(id, count)</code> beside it. It
        also hands back questions under <code>kettles.select</code>, for a page to ask. The panel's rows come
        from this helper in the example:
      </p>
      <Code id="row" />
      <p>
        <code>select.row</code> answers for a buy mode at once: how many the button buys, at what price, and
        whether the wallet covers it. The price for ten is not ten times the price of one: it adds up the next
        ten steps of the curve, each dearer than the last.
      </p>
      <Note title="The burner stays as it is">
        <p>
          Nothing is wrong with the hand-written burner, and Simmer keeps it. A factory earns its place when
          you have a list: three kinds of kettle cost no more to write than one.
        </p>
      </Note>
    </>
  ),
});
