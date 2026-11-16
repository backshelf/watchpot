// Getting started, step 10: something to buy. The burner and its price: a base times a growth for every one owned,
// drawn as a curve the reader bends with two sliders, and the stove reaching the pot to spend its bubbles.
import { fmt, fmtRate, type StateOf } from "watchpot/core";
import type * as Simmer from "../../../../docs/examples/simmer/game";
import {
  Act,
  Actions,
  Code,
  Controls,
  definePage,
  Note,
  Panel,
  PriceCurve,
  Readout,
  Readouts,
  StartOver,
  slider,
  Term,
  Try,
  useExample,
  useView,
  Value,
} from "../kit";

type S = StateOf<typeof Simmer.game.features>;
type Example = typeof Simmer;

/** How many burners the curve draws. */
const SHOWN = 16;

function TheStove() {
  const { burnerPrice, perSecond } = useExample<Example>();
  const burners = useView((s) => (s as S).stove.burners);
  const prices = Array.from({ length: SHOWN }, (_, i) => burnerPrice(i).toNumber());
  return (
    <Panel title="The pot and the stove">
      <Readouts>
        <Readout<S> big label="Bubbles" select={(s) => fmt(s.pot.bubbles).text} />
        <Readout<S> label="Burners lit" select={(s) => s.stove.burners} />
        <Readout<S> label="Every second" select={(s) => fmtRate(perSecond(s.stove.burners))} />
      </Readouts>
      <Actions>
        <Act call="pot.tap">Tap the pot</Act>
        <Act<S> call="stove.buyBurner" ready={(s) => s.pot.bubbles.gte(burnerPrice(s.stove.burners))}>
          Light a burner: <Value<S> select={(s) => fmt(burnerPrice(s.stove.burners)).text} />
        </Act>
      </Actions>
      <PriceCurve
        prices={prices}
        owned={burners}
        what={["burner", "burners"]}
        print={(price) => fmt(price).text}
      />
      <StartOver />
    </Panel>
  );
}

export default definePage({
  title: "Something to buy: a burner and its price",
  idea: (
    <>
      The thing you buy that makes more is a generator, and each one costs more than the last: a base price,
      times a growth for every one you own. To spend the pot's bubbles, the stove names the pot in its reach.
    </>
  ),
  game: { file: "simmer/game.ts", keep: "local", clock: true },
  params: {
    base: slider({
      at: "BURNER_COST",
      find: "base: 10",
      token: "10",
      min: 1,
      max: 100,
      step: 1,
      unit: "bubbles",
      label: "The first burner's price",
    }),
    growth: slider({
      at: "BURNER_COST",
      find: "growth: 1.15",
      token: "1.15",
      min: 1,
      max: 2,
      step: 0.01,
      code: (value) => value.toFixed(2),
      label: "Each one dearer by ×",
    }),
  },
  code: {
    cost: { at: "BURNER_COST" },
    price: { at: "burnerPrice" },
    stove: { at: "stove", omit: ["steps"] },
  },
  Panel: TheStove,
  Body: () => (
    <>
      <p>
        The pot fills itself at a bubble a second. An idle game starts to be a game when you can spend that
        number on something that makes it grow faster. In Simmer that is a burner: each one lit under the pot
        adds another bubble a second.
      </p>
      <p>
        A thing you buy that makes more of the number is a <Term id="generator">generator</Term>. Every idle
        game has a row of them (a cookie game's grandmas, a factory's machines), and every one has the same
        catch: each costs more than the last. The next one is always a little further off, and that is what
        keeps the game going.
      </p>

      <h2>The price</h2>
      <p>Two numbers decide what every burner costs:</p>
      <Code id="cost" />
      <p>
        <code>base</code> is the price of the first. <code>growth</code> is how much dearer each one makes the
        next: 1.15 means 15% more. One small function turns them into a price:
      </p>
      <Code id="price" />
      <p>
        <code>burnerPrice(owned)</code> is the price of the next burner when <code>owned</code> are already
        lit. <code>costAt</code> is the engine's: base times growth, once for every one owned, rounded up to a
        whole bubble. The first costs 10, the second 10 × 1.15 = 11.5, so 12, the third 13.2, so 14. The panel
        draws the first sixteen.
      </p>
      <Controls />
      <Try>
        <li>
          Tap the pot to 10 and light a burner. Its bar turns solid, the next one lights up, and the button
          asks the next price.
        </li>
        <li>
          Slide the growth to 1.50. The curve bends up hard: by the sixteenth burner the price has passed
          4,000. Growth is the whole pace of an idle game, in one number.
        </li>
        <li>
          Slide it to 1.00. Every burner costs the same, and the game has nowhere to go: more burners never
          get harder to buy.
        </li>
        <li>Move the first price. The whole curve scales up or down, and keeps its shape.</li>
      </Try>

      <h2>Buying one: a feature that reaches another</h2>
      <p>
        The burners are a feature of their own, the stove, with its own slice: <code>burners</code>, a plain
        number (nobody owns a billion burners, so a JavaScript number is enough). Its <code>steps</code> pay a
        bubble a second per burner, as the pot's simmer does; they are folded away here.
      </p>
      <Code id="stove" />
      <p>
        Buying touches two slices at once: the pot's bubbles go down, the stove's burners go up. A feature
        sees its own slice, and the slices of the features it names in <code>reach</code>. The stove says{" "}
        <code>reach: [pot]</code>, so inside its action <code>s.pot</code> is there to read and change. That
        list is the stove's <Term id="reach">reach</Term>. Leave the pot out of it, and <code>s.pot</code> is
        not part of the stove's draft: TypeScript stops you at the line that reads it.
      </p>
      <p>
        <code>buyBurner</code> asks the price, gives up when the pot holds less, and otherwise takes the price
        and lights one more. It returns <code>true</code> or <code>false</code>, and <code>api.set</code>{" "}
        hands that back to whoever pressed, so a button can tell whether it bought.
      </p>
      <Note title="Next: the price, worked out">
        <p>
          Nobody stores the price. It is worked out each time something asks, from how many burners are lit.
          The engine has a name and a place for a number like that, and it is the next page.
        </p>
      </Note>
    </>
  ),
});
