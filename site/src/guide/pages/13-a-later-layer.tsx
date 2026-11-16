// Getting started, step 13: one derived value reading another. The stove's `derived` in a code box: the reader takes
// out the second layer, types it back, adds a value of their own beside it, and meets the one mistake the engine
// refuses (two values that read each other).
import { fmt, isDecimal, type StateOf } from "watchpot/core";
import type * as Simmer from "../../../../docs/examples/simmer/game-wallet";
import {
  Act,
  Actions,
  CodeBox,
  definePage,
  Note,
  Panel,
  Readout,
  Readouts,
  StartOver,
  StateTree,
  Try,
} from "../kit";
import { CodeName } from "../kit/more";

type S = StateOf<typeof Simmer.game.features>;

/** A value the reader may have taken out, or not yet typed. */
type Stove = S["stove"] & { shortBy?: unknown; canBuy?: unknown };

const asked = (value: unknown) =>
  value === undefined ? "not there" : isDecimal(value) ? fmt(value).text : value === true ? "yes" : "no";

function TheLayers() {
  return (
    <Panel title="The stove's derived values">
      <Readouts>
        <Readout<S> big label="Bubbles" select={(s) => fmt(s.wallet.bubbles).text} />
        <Readout<S>
          label={<CodeName>nextPrice</CodeName>}
          select={(s) => asked((s.stove as Stove).nextPrice)}
        />
        <Readout<S> label={<CodeName>canBuy</CodeName>} select={(s) => asked((s.stove as Stove).canBuy)} />
        <Readout<S> label={<CodeName>shortBy</CodeName>} select={(s) => asked((s.stove as Stove).shortBy)} />
      </Readouts>
      <Actions>
        <Act call="pot.tap">Tap the pot</Act>
        <Act<S> call="stove.buyBurner" ready={(s) => (s.stove as Stove).canBuy === true}>
          Light a burner
        </Act>
      </Actions>
      <StateTree only={["stove"]} label="The stove's slice" />
      <StartOver />
    </Panel>
  );
}

export default definePage({
  title: "One derived value reading another, in a later layer",
  idea: (
    <>
      <code>derived</code> can be a list of layers. A value in a later layer reads the ones before it as
      plainly as it reads the state.
    </>
  ),
  game: {
    file: "simmer/game-wallet.ts",
    keep: "memory",
    clock: true,
    edit: { at: "stove > derived", trial: ["pot.tap", "stove.buyBurner"] },
  },
  Panel: TheLayers,
  Body: () => (
    <>
      <p>
        The stove has a second question to answer all the time: can the player afford the next burner? The
        button lights up on the answer. It is worked out from the wallet and from the next price, and the next
        price is itself a derived value. So one derived value reads another.
      </p>
      <p>
        Here is the stove's <code>derived</code> again, in a box you can edit. It is the code the panel runs:
        a moment after you stop typing, the game picks up your version.
      </p>
      <CodeBox label="The stove's derived values" />
      <p>
        The square brackets make <code>derived</code> a list, and each pair of curly braces in it is a{" "}
        <em>layer</em>. The first layer works from the saved state alone: <code>nextPrice</code> from the
        burners, and <code>perSecond</code>, the stove's rate, which is two pages on. The second layer, with{" "}
        <code>canBuy</code>, reads the wallet and <code>s.stove.nextPrice</code> from the first.
      </p>
      <Try>
        <li>
          Delete the second layer: its comment and the whole line <code>{"{ canBuy: … },"}</code>. Stop
          typing. The panel's <code>canBuy</code> says "not there", and the button goes dashed however many
          bubbles you have: it lights up on <code>s.stove.canBuy</code>, and there is no such thing now.
        </li>
        <li>
          Type it back, as its own layer after the first:
          <pre className="guide-snippet">
            <code>{"{ canBuy: (s) => s.wallet.bubbles.gte(s.stove.nextPrice) },"}</code>
          </pre>
        </li>
        <li>
          Give that layer a second value, how many bubbles you are short of the next burner, so the line
          becomes:
          <pre className="guide-snippet">
            <code>{`{
  canBuy: (s) => s.wallet.bubbles.gte(s.stove.nextPrice),
  shortBy: (s) => s.stove.nextPrice.sub(s.wallet.bubbles).max(0),
},`}</code>
          </pre>
          <code>shortBy</code> appears in the panel and in the stove's slice. It counts down as the pot fills,
          reaches 0 as the button lights, and jumps back up when you buy.
        </li>
        <li>
          Make a value read itself ("once it could buy, it always can"):
          <pre className="guide-snippet">
            <code>{"canBuy: (s) => s.stove.canBuy || s.wallet.bubbles.gte(s.stove.nextPrice),"}</code>
          </pre>
          The box refuses it and says why, and the game keeps running your last version that worked.
        </li>
      </Try>

      <h2>Why layers</h2>
      <p>
        A value reads only from the layers before its own. The layers are for TypeScript: it works out each
        layer's types from the ones before, so in the second layer <code>s.stove.nextPrice</code> is known to
        be a Decimal. Put <code>shortBy</code> in the first layer instead, beside <code>nextPrice</code>, and
        your editor underlines it: "Property 'nextPrice' does not exist" on the stove's saved fields.
      </p>
      <p>
        The box here strips the types without checking them, so a value in the same layer still runs in it.
        That is because the engine itself never needed the order: it works a value out when something reads
        it, and follows what that value reads in turn. You never say which goes first. What it cannot do is
        follow a loop. Two values that read each other, in any layers, have no answer, and the engine refuses
        the game with the loop named: <code>stove.canBuy → stove.canBuy</code>.
      </p>
      <Note title="One layer is the usual case">
        <p>
          Most features have one plain block, <code>derived: {"{ … }"}</code>, with no square brackets: their
          values each read the state and nothing else. Reach for a second layer only when a value reads a
          value of the same feature, as <code>canBuy</code> reads <code>nextPrice</code>. A value that reads{" "}
          <em>another</em> feature's derived value needs no layer at all; the next pages have one.
        </p>
      </Note>
      <p>
        That is derived values: say once what a number is made of, read it anywhere, and never store it. The
        next page uses them for something bigger: one number that everything which makes the stove hotter
        feeds into.
      </p>
    </>
  ),
});
