// Getting started, step 9: printing a number. Not a game: the panel calls the example's `onScreen` and
// `everyNotation`, rebuilt with the reader's count (a slider over forty powers of ten) and notation.
import type * as Words from "../../../../docs/examples/guide-words-and-numbers";
import { Code, Controls, choice, definePage, Note, Panel, slider, Term, Try, useExample } from "../kit";

type Example = typeof Words;

function OnScreen() {
  const { onScreen, everyNotation, NOTATION, BUBBLES } = useExample<Example>();
  const { shown, exact } = onScreen();
  // Past 2^53 a Decimal no longer holds every digit, and fmtFull prints nonsense there (`1e20` for 1.23e16).
  const exactOk = BUBBLES.lt(Number.MAX_SAFE_INTEGER);
  const head = shown.text.slice(0, shown.text.length - shown.suffix.length);
  return (
    <>
      <div className="printed">
        <p className="panel__label">What the player reads</p>
        <p className="printed__text num" aria-live="off">
          {head}
          {shown.suffix ? <span className="printed__suffix">{shown.suffix}</span> : null}
        </p>
        <dl className="printed__parts">
          <div>
            <dt>mantissa</dt>
            <dd className="num">{String(shown.mantissa)}</dd>
          </div>
          <div>
            <dt>suffix</dt>
            <dd className="num">{shown.suffix ? JSON.stringify(shown.suffix) : '""'}</dd>
          </div>
          <div>
            <dt>Every digit (fmtFull)</dt>
            <dd className={exactOk ? "num" : undefined}>
              {exactOk
                ? exact
                : "Too many to keep: past about 9e15, a Decimal holds only the first sixteen or so."}
            </dd>
          </div>
        </dl>
      </div>
      <div className="notations">
        <p className="panel__label">The same bubbles in each notation</p>
        <table className="notations__table">
          <tbody>
            {everyNotation().map(({ notation, text }) => (
              <tr key={notation} data-chosen={notation === NOTATION ? "" : undefined}>
                <th scope="row">{notation}</th>
                <td className="num">{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ThePrinter() {
  return (
    <Panel title="A number, printed">
      <OnScreen />
    </Panel>
  );
}

/** How a count is written in the code, as the string `D` reads: plain under 100,000, then as a power of ten. */
const written = (v: number) => JSON.stringify(v < 1e5 ? String(v) : v.toExponential().replace("e+", "e"));

export default definePage({
  title: "Printing a number for a player",
  idea: (
    <>
      A player reads 1.52M, not 1520000. <code>fmt</code> prints a number for a person, and rounds down, so
      the screen never promises bubbles the player does not have.
    </>
  ),
  game: { file: "guide-words-and-numbers.ts", store: false, keep: "memory", clock: false },
  params: {
    bubbles: slider({
      at: "BUBBLES",
      find: 'D("1.52e6")',
      token: '"1.52e6"',
      min: 1,
      max: 1e40,
      step: 0.01,
      log: true,
      digits: 4,
      code: written,
      label: "Bubbles",
    }),
    notation: choice({
      at: "NOTATION",
      find: '= "suffix"',
      token: '"suffix"',
      label: "The player picked",
      options: [
        { label: "suffix", code: '"suffix"' },
        { label: "scientific", code: '"scientific"' },
        { label: "engineering", code: '"engineering"' },
        { label: "letters", code: '"letters"' },
        { label: "logarithm", code: '"logarithm"' },
      ],
    }),
  },
  code: {
    bubbles: { at: "BUBBLES" },
    notation: { at: "NOTATION" },
    onScreen: { at: "onScreen" },
    printing: { at: "printing" },
  },
  Panel: ThePrinter,
  Body: () => (
    <>
      <p>
        A Decimal holds a number; it does not decide how a player should read it. <code>1529000</code> is hard
        to read at a glance, and <code>1.529e+6</code> is worse. Idle games print big numbers short, with a
        suffix: <code>1.52M</code>. The engine's printer for that is <code>fmt</code>.
      </p>
      <Code id="onScreen" />
      <p>
        <code>fmt</code> does not hand back a string. It hands back the printed text and its parts:{" "}
        <code>text</code> (what you show), <code>mantissa</code> (the number in front, as a plain number) and{" "}
        <code>suffix</code>. Most of the time you want <code>.text</code>; the parts are there for a page that
        sets the suffix smaller, or counts the number up. Writing <code>{"{fmt(bubbles)}"}</code> in a
        component is an error, and <code>{"{fmt(bubbles).text}"}</code> is right. <code>fmtFull</code> is the
        other printer here: every digit, never a suffix, for a figure that is not too big. (Past about 9e15 a
        Decimal keeps only its first sixteen or so digits, so there are no more digits to print.)
      </p>
      <p>
        The panel prints these bubbles, in the <Term id="notation">notation</Term> the player picked: the way
        a number too long to read is written short.
      </p>
      <Code id="bubbles" />
      <Code id="notation" />
      <Controls />
      <Try>
        <li>
          Slide the bubbles down below 100,000. They print as plain digits, with commas: a suffix starts at
          100,000.
        </li>
        <li>
          Find a count like <code>1.529e6</code>. It prints as <code>1.52M</code>, not 1.53M: <code>fmt</code>{" "}
          rounds down.
        </li>
        <li>Slide up past 1e36. The suffixes run out, and it prints as a power of ten.</li>
        <li>Pick each notation, and watch the table mark the one the player picked.</li>
      </Try>

      <h2>Why it rounds down</h2>
      <p>
        Suppose a burner costs 1,000 bubbles and the player has 999.6. Rounded to the nearest, the screen says
        1,000, and the button refuses them. Rounded down, it says 999, which is true. So <code>fmt</code>{" "}
        always rounds down: the screen never promises bubbles the player does not have. Prices, for the same
        reason, are worked out in whole numbers (page 10 shows one).
      </p>

      <h2>Letting the player choose</h2>
      <p>
        Past the plain digits, numbers can be written several ways, and idle game players often have a
        favourite notation, so games let them pick one in their settings. The engine has five; the table in
        the panel shows the same bubbles in each.
      </p>
      <p>
        Passing the notation to every <code>fmt</code> on the page would be tiresome. A{" "}
        <Term id="formatter">formatter</Term> takes the player's choices once and hands back the printers,
        each of which returns plain text:
      </p>
      <Code id="printing" />
      <p>
        A game makes its formatter from the player's saved choice and hands it to its page. Its other printers
        are for the other kinds of number a page shows: a rate (<code>2.5/s</code>), a multiplier (
        <code>×3.20</code>) and a count with its word (<code>1 bubble</code>, <code>2 bubbles</code>).
      </p>
      <Note title="Next: something to spend them on">
        <p>
          You have a number that grows, ticks, saves, pays for time away, and prints. The next page gives the
          player something to buy with it: a burner, at a price that grows.
        </p>
      </Note>
    </>
  ),
  // Until page 10 is written, the way on is the guide's chapter that buys the first burner.
  next: {
    href: "../guide/02-your-first-game.html#step-6-a-burner-you-can-buy",
    title: "Your first game, from step 6: a burner you can buy",
    label: "Continue in the guide",
  },
});
