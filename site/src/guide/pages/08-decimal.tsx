// Getting started, step 8: the Decimal. Not a game: the panel calls two small functions from the example, rebuilt
// with the reader's values. Ten to a power, as a JavaScript number and as a Decimal, on a scale with JavaScript's
// limit drawn on it; and whether a balance covers a price, asked thirty-one times.
import { D } from "watchpot/core";
import type * as Words from "../../../../docs/examples/guide-words-and-numbers";
import { Code, Controls, choice, definePage, Note, Panel, slider, Term, Try, useExample } from "../kit";

type Example = typeof Words;

/** Where a JavaScript number gives up: about 1.8e308, so ten to the 309th is the first power past it. */
const LIMIT = 308;
const MAX = 1000;

function TooBig() {
  const { tenToThe, ZEROS } = useExample<Example>();
  const { plain, decimal } = tenToThe();
  const past = !Number.isFinite(plain);
  const at = (zeros: number) => `${(zeros / MAX) * 100}%`;
  return (
    <div className="numbers">
      <div className="numbers__pair">
        <div className="readout" data-broken={past ? "" : undefined}>
          <span className="readout__label">
            A JavaScript number <code className="readout__code">10 ** ZEROS</code>
          </span>
          {/* `10 ** n` is not exact, and engines differ in its last digit: the build's says 1e+300 where Edge's
              says 1.0000000000000006e+300. What the reader's browser works out is the one to show. */}
          <span className="readout__value num numbers__value" suppressHydrationWarning>
            {String(plain)}
          </span>
        </div>
        <div className="readout">
          <span className="readout__label">
            A Decimal <code className="readout__code">D(10).pow(ZEROS)</code>
          </span>
          <span className="readout__value num numbers__value">{decimal.toString()}</span>
        </div>
      </div>
      <div className="numbers__scale" aria-hidden="true">
        <div className="numbers__beyond" style={{ left: at(LIMIT) }}>
          <span className="numbers__beyond-text">A JavaScript number is Infinity here</span>
        </div>
        <div className="numbers__limit" style={{ left: at(LIMIT) }} />
        <div className="numbers__here" style={{ left: at(Number(ZEROS)) }} />
      </div>
      <div className="numbers__ticks" aria-hidden="true">
        <span className="num">1</span>
        <span className="num" style={{ left: at(LIMIT) }}>
          308
        </span>
        <span className="num">{MAX} zeros</span>
      </div>
    </div>
  );
}

const PRICE = 10;
const BALANCES = Array.from({ length: 31 }, (_, i) => i);

function Covers() {
  const { covers } = useExample<Example>();
  const answers = BALANCES.map((b) => ({ b, says: covers(D(b), D(PRICE)), right: b >= PRICE }));
  const wrong = answers.filter((a) => a.says !== a.right).length;
  return (
    <div className="covers">
      <p className="panel__label">Does a balance cover a price of {PRICE}?</p>
      <ol className="covers__row">
        {answers.map(({ b, says, right }) => (
          <li
            key={b}
            className="covers__cell num"
            data-yes={says ? "" : undefined}
            data-wrong={says !== right ? "" : undefined}
            title={`${b}: ${says ? "yes" : "no"}${says !== right ? " (wrong)" : ""}`}
          >
            {b}
          </li>
        ))}
      </ol>
      <p className="strip__note">
        Inked: <code>covers</code> said yes.{" "}
        {wrong === 0 ? (
          "Every answer is right."
        ) : (
          <>
            Struck through: it said yes, and is wrong.{" "}
            <strong>
              {wrong} of {BALANCES.length} answers are wrong.
            </strong>
          </>
        )}
      </p>
    </div>
  );
}

function TheNumbers() {
  return (
    <Panel title="Two kinds of number">
      <TooBig />
      <Covers />
    </Panel>
  );
}

export default definePage({
  title: "Numbers too big for JavaScript: Decimal",
  idea: (
    <>
      Idle numbers grow by multiplying, and soon pass the largest number JavaScript can hold. A Decimal does
      not stop there. It never changes in place, and it is compared with methods, never with {"<"} or {">"}.
    </>
  ),
  game: { file: "guide-words-and-numbers.ts", store: false, keep: "memory", clock: false },
  params: {
    zeros: slider({
      at: "ZEROS",
      find: "= 300",
      token: "300",
      min: 1,
      max: MAX,
      step: 1,
      label: "Zeros",
    }),
    compare: choice({
      at: "covers",
      find: "return balance.gte(price);",
      token: "balance.gte(price)",
      label: "Compare with",
      options: [
        { label: "balance.gte(price)", code: "balance.gte(price)" },
        { label: "balance >= price", code: "balance >= price" },
      ],
    }),
  },
  code: {
    zeros: { at: "ZEROS" },
    tenToThe: { at: "tenToThe" },
    covers: { at: "covers" },
    habits: { at: "decimals" },
  },
  Panel: TheNumbers,
  Body: () => (
    <>
      <p>
        An idle game grows by multiplying. A burner costs 15% more for each one you own, so the fiftieth costs
        about 10,800 bubbles and the two hundredth about 14 trillion. Income multiplies the same way, and so
        do the bonuses on it. A few hours into a good idle game, the numbers have dozens of digits; a long one
        goes far past that.
      </p>
      <p>
        JavaScript's own numbers stop at about 1.8 followed by 308 zeros. Past that, a number is{" "}
        <code>Infinity</code>, and a game whose balance is <code>Infinity</code> is broken: every price is
        affordable and every sum stays the same.
      </p>

      <h2>A number with no ceiling</h2>
      <p>
        So the engine keeps anything that can grow without limit in a <Term id="decimal">Decimal</Term>, a
        number type from the <code>break_eternity.js</code> library that reaches far past JavaScript's. Here
        are both, made from the same power of ten:
      </p>
      <Code id="zeros" />
      <Code id="tenToThe" />
      <p>
        <code>D(10)</code> makes a Decimal from a plain number, and <code>pow</code> raises it to a power. A
        Decimal has a method for each sum: <code>add</code>, <code>sub</code>, <code>mul</code>,{" "}
        <code>div</code>, <code>pow</code>. You cannot use <code>+</code> or <code>*</code> on one.
      </p>
      <p>
        Neither kind keeps every digit of a number this long: each keeps the first sixteen or so, which is why
        the JavaScript number may print as <code>1.0000000000000006e+300</code>. For a game that is plenty.
        The difference is how far each can go.
      </p>
      <Controls names={["zeros"]} />
      <Try>
        <li>Slide the zeros to 308. Both still give an answer.</li>
        <li>One more, 309: the JavaScript number is Infinity. The Decimal carries on.</li>
        <li>Slide all the way to 1000. The Decimal does not mind.</li>
      </Try>

      <h2>Comparing: with methods</h2>
      <p>
        Here is the question every shop asks: can the player pay? The example answers it for one balance and
        one price:
      </p>
      <Code id="covers" />
      <p>
        <code>gte</code> is "greater than or equal". Decimals have one method for each comparison:{" "}
        <code>lt</code>, <code>lte</code>, <code>gt</code>, <code>gte</code> and <code>eq</code>. The panel
        asks <code>covers</code> about every balance from 0 to 30 against a price of 10.
      </p>
      <Controls names={["compare"]} />
      <Try>
        <li>
          With <code>gte</code>, 10 and up are inked, and nothing is wrong.
        </li>
        <li>
          Switch to <code>{"balance >= price"}</code>. Now 2 to 9 "cover" a price of 10. No error, no warning:
          just wrong answers.
        </li>
      </Try>
      <p>
        Why? A Decimal is an object, and when JavaScript compares two objects with <code>{">="}</code> it
        first turns each into a plain value. A Decimal turns into its text, so JavaScript compares{" "}
        <code>"9"</code> with <code>"10"</code> the way a dictionary would, letter by letter. <code>"9"</code>{" "}
        comes after <code>"1"</code>, so 9 wins. TypeScript does not stop you, so the rule is simply: compare
        Decimals with their methods, every time.
      </p>

      <h2>The habits, in one place</h2>
      <Code id="habits" />
      <p>
        One more you have met already, on page 3: a Decimal never changes in place.{" "}
        <code>balance.sub(price)</code> on a line of its own works out an answer and throws it away; keep it
        by assigning it. And <code>take</code> does a price check and a payment in one: the balance after
        paying, or <code>null</code> when it cannot cover the price.
      </p>
      <Note title="Not everything is a Decimal">
        <p>
          Ask whether a number can grow by multiplying. Bubbles, prices and rates can, so they are Decimals. A
          count of burners grows by one at a time and never gets near the limit, so it is a plain number:{" "}
          <code>burners: 0</code> in the stove's state. When the two meet, <code>D(n)</code> turns the plain
          number into a Decimal.
        </p>
      </Note>
    </>
  ),
});
