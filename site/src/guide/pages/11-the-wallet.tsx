// Getting started, step 11: money with a name. The bubbles move out of the pot into a wallet the engine writes from
// the game's words: the reader earns, spends and resets the run, and watches the balance and the running total part;
// a switch adds a second currency, and the wallet grows a balance for it and nothing else changes.
import { fmt, type StateOf } from "watchpot/core";
import type * as Simmer from "../../../../docs/examples/simmer/game-wallet";
import {
  Act,
  Actions,
  Code,
  Controls,
  choice,
  definePage,
  Note,
  Panel,
  Readout,
  Readouts,
  StartOver,
  StateTree,
  Term,
  Try,
  Value,
} from "../kit";

type S = StateOf<typeof Simmer.game.features>;

function TheWallet() {
  return (
    <Panel title="Simmer's wallet">
      <Readouts>
        <Readout<S> big label="Bubbles" select={(s) => fmt(s.wallet.bubbles).text} />
        <Readout<S> label="Earned this run" select={(s) => fmt(s.wallet.earned).text} />
        <Readout<S> label="Burners lit" select={(s) => s.stove.burners} />
      </Readouts>
      <Actions>
        <Act call="pot.tap">Tap the pot</Act>
        <Act<S> call="stove.buyBurner" ready={(s) => s.wallet.bubbles.gte(s.stove.nextPrice)}>
          Light a burner: <Value<S> select={(s) => fmt(s.stove.nextPrice).text} />
        </Act>
        <Act call="resetRun">Reset the run</Act>
      </Actions>
      <StateTree only={["wallet"]} label="The wallet's slice" />
      <StartOver />
    </Panel>
  );
}

export default definePage({
  title: "Money with a name: the wallet",
  idea: (
    <>
      A game names its money once, in its words, and keeps every balance in one feature the engine writes: a
      wallet. It pays in, pays out, and keeps running totals.
    </>
  ),
  game: { file: "simmer/game-wallet.ts", keep: "local", clock: true },
  params: {
    currencies: choice({
      at: "WORDS",
      find: 'currencies: ["bubbles"]',
      token: '["bubbles"]',
      label: "The game's currencies",
      options: [
        { label: "Bubbles", code: '["bubbles"]' },
        { label: "Bubbles and steam", code: '["bubbles", "steam"]' },
      ],
    }),
  },
  code: {
    words: { at: "WORDS" },
    wallet: { at: "wallet" },
    pot: { at: "pot", omit: ["steps"] },
    buy: { at: "stove > actions > buyBurner" },
  },
  Panel: TheWallet,
  Body: () => (
    <>
      <p>
        Until now the bubbles lived in the pot, as <code>s.pot.bubbles</code>. That is fine for one kind of
        money kept in one place. Games grow more: a second currency, a shop that takes either, a total of
        everything ever made for a reward. Each would be a field in some feature, and everything that pays or
        charges would have to know which.
      </p>
      <p>
        So from this page on, Simmer names its money once and keeps every balance in one feature. The names
        come first:
      </p>
      <Code id="words" />
      <p>
        <code>vocab</code> declares the game's <Term id="vocabulary">vocabulary</Term>: the words the engine
        knows it by. <code>currencies</code> lists each kind of money, each a{" "}
        <Term id="currency">currency</Term>. Simmer has one, <code>bubbles</code>. (<code>stats</code> names
        something three pages on.) TypeScript reads the list, so from here on a currency spelt wrong is an
        error before the game ever runs.
      </p>

      <h2>The wallet</h2>
      <Code id="wallet" />
      <p>
        <code>defineCurrencies</code> writes the feature for you from that description: a{" "}
        <Term id="wallet">wallet</Term>, with one balance for every currency in the words (
        <code>s.wallet.bubbles</code>, a Decimal), and any running totals you ask for.{" "}
        <code>{'earnedThisRun: { bubbles: "earned" }'}</code> asks for one: <code>s.wallet.earned</code>,
        every bubble paid in since the run began. Spending never lowers it.
      </p>
      <Controls />
      <Try>
        <li>Tap the pot a few times. The bubbles and the earned total go up together.</li>
        <li>
          Light a burner. The bubbles drop by its price, and the earned total stays put: it counts what came
          in, not what is left.
        </li>
        <li>
          Reset the run. Both go to 0, and the burners with them: the run is over, and everything starts
          again. A reset that pays you for starting over is a later chapter's subject.
        </li>
        <li>
          Switch the currencies to "Bubbles and steam". The wallet grows a second balance, <code>steam</code>,
          at 0, and nothing else changes. Adding money to a game is one word.
        </li>
      </Try>

      <h2>Paying in</h2>
      <Code id="pot" />
      <p>
        The pot no longer holds the bubbles: it pays them into the wallet. Its slice keeps only a count of
        taps. <code>wallet.draft.credit(s, "bubbles", 1)</code> is the wallet's credit, written for use inside
        another feature's action: it takes the draft <code>s</code> first, and adds to the balance and to the
        earned total in one go, which a bare <code>s.wallet.bubbles = …</code> would not. The pot names the
        wallet in its reach, as the stove named the pot on the last page.
      </p>

      <h2>Paying out</h2>
      <Code id="buy" />
      <p>
        <code>debit</code> takes the price if the balance covers it and says whether it did: <code>true</code>
        , and the bubbles are gone; <code>false</code>, and nothing changed. So the whole purchase is two
        lines.
      </p>
      <p>
        The price it charges is <code>s.stove.nextPrice</code>, a number nobody stores. Where it comes from is
        the next page.
      </p>
      <Note title="A reset, in a sentence">
        <p>
          The store's <code>resetRun()</code> ends the run: each feature goes back to where it started, unless
          it says to keep something. <code>earned</code> is a total for this run, so it goes too. A wallet can
          also keep a total that outlives every reset (<code>earnedEver</code>); chapter 4 shows it.
        </p>
      </Note>
    </>
  ),
});
