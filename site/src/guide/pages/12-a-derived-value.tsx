// Getting started, step 12: a derived value, alone. The next burner's price, worked out from the burners and never
// kept: the reader moves the growth and watches the price follow at once, while a copy written at each buy (what
// keeping the price in the state would do) goes stale beside it.
import { useEffect, useRef, useState } from "react";
import { fmt, isDecimal, type StateOf } from "watchpot/core";
import type * as Simmer from "../../../../docs/examples/simmer/game-wallet";
import {
  Act,
  Actions,
  AgainstCopy,
  Code,
  Controls,
  definePage,
  Note,
  Panel,
  Readout,
  Readouts,
  SaveText,
  SliceFields,
  StartOver,
  slider,
  Term,
  Try,
  useView,
  Value,
} from "../kit";

type S = StateOf<typeof Simmer.game.features>;

const print = (value: unknown) =>
  isDecimal(value) ? fmt(value).text : typeof value === "string" ? JSON.stringify(value) : String(value);

/**
 * The derived price beside a copy of it that only a purchase writes, as a field in `initial` set by `buyBurner`
 * would be. The panel keeps the copy itself; the game has no such field.
 */
function PriceAndCopy() {
  const burners = useView((s) => (s as S).stove.burners);
  const price = useView((s) => fmt((s as S).stove.nextPrice).text);
  const [copy, setCopy] = useState(price);
  const seen = useRef(burners);
  useEffect(() => {
    if (seen.current === burners) return;
    seen.current = burners;
    setCopy(price);
  }, [burners, price]);
  return (
    <AgainstCopy
      live={price}
      copy={copy}
      liveLabel="The price, worked out"
      copyLabel="A copy, written at each buy"
    />
  );
}

function ThePrice() {
  return (
    <Panel title="The stove's price">
      <Readouts>
        <Readout<S> big label="Bubbles" select={(s) => fmt(s.wallet.bubbles).text} />
        <Readout<S> label="Burners lit" select={(s) => s.stove.burners} />
      </Readouts>
      <Actions>
        <Act call="pot.tap">Tap the pot</Act>
        <Act<S> call="stove.buyBurner" ready={(s) => s.wallet.bubbles.gte(s.stove.nextPrice)}>
          Light a burner: <Value<S> select={(s) => fmt(s.stove.nextPrice).text} />
        </Act>
      </Actions>
      <PriceAndCopy />
      <SliceFields slice="stove" title="The stove's slice, and what the save holds" print={print} />
      <SaveText />
      <StartOver />
    </Panel>
  );
}

export default definePage({
  title: "A number worked out from the state: a derived value",
  idea: (
    <>
      Some numbers are not remembered but worked out from what is. Declared once beside the state, a derived
      value is there to read like any field, is never saved, cannot be written, and is current the moment
      anything it reads changes.
    </>
  ),
  game: { file: "simmer/game-wallet.ts", keep: "local", clock: true },
  params: {
    growth: slider({
      at: "BURNER_COST",
      find: "growth: 1.15",
      token: "1.15",
      min: 1,
      max: 2,
      step: 0.01,
      code: (value) => value.toFixed(2),
      label: "Each burner dearer by ×",
    }),
  },
  code: {
    initial: { at: "stove > initial" },
    derived: { at: "stove > derived" },
    cost: { at: "BURNER_COST" },
  },
  Panel: ThePrice,
  Body: () => (
    <>
      <p>
        The last page charged <code>s.stove.nextPrice</code> for a burner, and nothing ever set it. The price
        is a number the game needs all the time (the button shows it, the purchase charges it), but it never
        has to remember it. Tell it how many burners are lit, and it can work the price out.
      </p>
      <p>
        A number worked out from the state, instead of kept in it, is a{" "}
        <Term id="derived-value">derived value</Term>. You declare it once, beside the state, and from then on
        it is simply there: <code>s.stove.nextPrice</code>, read like any other field.
      </p>

      <h2>Declaring one</h2>
      <p>What the stove keeps is two fields: how many burners are lit, and a switch a later chapter uses.</p>
      <Code id="initial" />
      <p>
        What it works out sits beside that, under <code>derived</code>:
      </p>
      <Code id="derived" />
      <p>
        Three values are declared there. This page is about the first, <code>nextPrice</code>: a function from
        the state to a number, <code>(s) =&gt; burnerPrice(s.stove.burners)</code>, the burner's price from
        page 10. The engine calls it, and whatever it returns is <code>s.stove.nextPrice</code>. The other
        two, and why they sit in two groups, are the next three pages.
      </p>
      <p>The price reads the growth from page 10, which you can move again here:</p>
      <Code id="cost" />
      <Controls />
      <Try>
        <li>
          Light a burner. <code>nextPrice</code> moves at once, and so does the button. Nothing told either of
          them: they read the state.
        </li>
        <li>
          Slide the growth to 1.50, the kind of change a game's update makes. <code>nextPrice</code> follows
          at once, for the burners already lit, and the button asks the new price. The copy beside it still
          says the old one: it was written at your last buy, and nothing has written it since.
        </li>
        <li>
          Light another burner. The copy catches up, because buying writes it. That is the trouble with
          keeping a copy: everything that changes what it depends on has to remember to rewrite it.
        </li>
        <li>
          Open "The save, as stored". The stove's slice holds <code>burners</code> and <code>off</code>. No
          price is in it.
        </li>
      </Try>

      <h2>Four things true of every derived value</h2>
      <ul>
        <li>
          <strong>It is there on the state.</strong> <code>s.stove.nextPrice</code> inside an action,{" "}
          <code>store.getState().stove.nextPrice</code> on a page. Its type is whatever the function returns,
          a Decimal here, and you never write the type down.
        </li>
        <li>
          <strong>It is never saved.</strong> The save holds what the price is worked out from, and when the
          game loads, the price comes back from it. The panel marks each field of the slice by whether the
          save has it.
        </li>
        <li>
          <strong>It cannot be written.</strong> Inside an action, <code>s.stove.nextPrice = D(5)</code>{" "}
          throws: the engine says it "is a derived value: it is worked out from the state, never written". To
          change it, change what it reads: light a burner.
        </li>
        <li>
          <strong>It is current the moment anything changes.</strong> The engine works it out again when
          something it read has changed (here, <code>burners</code>), and leaves it alone otherwise.
        </li>
      </ul>

      <Note title="Inside an action, it is as of the start">
        <p>
          There is one place "current" does not reach: the middle of an action. While your function runs, a
          derived value is what it was when the action began, and it catches up when the action returns:
        </p>
        <pre className="guide-snippet">
          <code>{`api.set((s) => {
  s.stove.burners += 1;
  s.stove.nextPrice; // still the price before this burner
});`}</code>
        </pre>
        <p>
          So read a derived value before you change what it reads. <code>buyBurner</code> does: it charges{" "}
          <code>nextPrice</code> first, then lights the burner.
        </p>
      </Note>

      <h2>Why not keep the price in the state?</h2>
      <p>
        You could: put a <code>price</code> in <code>initial</code>, and have <code>buyBurner</code> set it
        after each purchase. It works until something else changes what the price should be: a new growth in
        an update, a reset that puts the burners out, a second way to get a burner. Each of those has to
        remember to rewrite the copy, and every save made before the change carries the old price forever. A
        derived value has nothing to remember. There is one rule, written once, and everything that needs the
        price reads the rule.
      </p>
      <Note title="What a derived value may read">
        <p>
          The state, and nothing else: its own feature's slice and the slices it reaches. It must not change
          anything, read the clock or roll a random number, because the engine decides when to work it out,
          and the answer has to be the same whenever it does.
        </p>
      </Note>
    </>
  ),
});
