// Getting started, step 17: a shop. Simmer's kitchen, an upgrade tree with one or a few ranks per node: the reader
// buys salt and a whisk and watches the stir stat gain a row for each and the stir pay more. The panel runs chapter
// 6's game as bundled with the page (see `kit/bundled.tsx`).
import { fmt, foldContributions, type StateOf } from "watchpot/core";
import * as FirstPage from "../../../../docs/examples/guide-first-page";
import {
  Act,
  Actions,
  definePage,
  Note,
  Panel,
  Readout,
  Readouts,
  StartOver,
  Term,
  Try,
  useExample,
  useSnapshot,
} from "../kit";
import { Bundled, BundledHost } from "../kit/bundled";
import { Breakdown, Listing, Shortcut } from "../kit/more";

type S = StateOf<typeof FirstPage.game.features>;
type Example = typeof FirstPage;

const SOURCE = { file: "guide-first-page.ts", href: "../examples/guide-first-page.ts.html" };
const make = () =>
  new BundledHost({ page: "17-a-shop", game: FirstPage.game, exports: FirstPage, keep: "local" });

function Shelf() {
  const { shelf, kitchen } = useExample<Example>();
  const { state } = useSnapshot();
  // The ladle raises big bubbles to catch, a part of chapter 6 this panel has no place for.
  const items = shelf(state as S).filter((item) => item.id !== "ladle");
  return (
    <ul style={{ display: "grid", gap: "0.7rem", margin: 0, padding: 0, listStyle: "none" }}>
      {items.map((item) => {
        const node = kitchen.def.nodes.find((n) => n.id === item.id);
        const ranks = node?.maxLevel ?? 1;
        return (
          <li
            key={item.id}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: "0.2rem 0.75rem",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 560 }}>
              {item.name}
              {ranks > 1 ? (
                <span className="num" style={{ fontWeight: 400, color: "var(--ink-soft)" }}>
                  {" "}
                  {item.owned}/{ranks}
                </span>
              ) : null}
            </span>
            <Act<S>
              call="kitchen.buy"
              args={[item.id]}
              ready={(s) => shelf(s).find((i) => i.id === item.id)?.canBuy ?? false}
            >
              {item.price === null ? (
                "Bought"
              ) : (
                <>
                  Buy: <span className="num">{item.price}</span>
                </>
              )}
            </Act>
            <span style={{ gridColumn: "1 / -1", fontSize: "0.875rem", color: "var(--ink-soft)" }}>
              {node?.line}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TheStir() {
  const { kitchen } = useExample<Example>();
  const { state } = useSnapshot();
  const explained = foldContributions(kitchen.select.contributions(state as S) as never, {
    base: () => 1,
  }).explain("stir" as never);
  const nameOf = (source: string) =>
    kitchen.def.nodes.find((n) => `kitchen:${n.id}` === source)?.name ?? source;
  return (
    <Breakdown
      title="Where the stir comes from"
      base={fmt(explained.base).text}
      rows={explained.parts.map((part) => ({
        label: part.times > 1 ? `${nameOf(part.label)}, ${part.times} ranks` : nameOf(part.label),
        gives: `${part.op === "mul" ? "×" : "+"}${fmt(part.value).text}`,
      }))}
      total={{ label: "Stir", value: fmt(explained.value).text }}
    />
  );
}

function TheKitchen() {
  return (
    <Bundled make={make} source={SOURCE}>
      <Panel title="Simmer's kitchen">
        <Readouts>
          <Readout<S> big label="Bubbles" select={(s) => fmt(s.wallet.bubbles).text} />
        </Readouts>
        <Actions>
          <Act call="spoon.click">Stir the pot</Act>
        </Actions>
        <Shortcut
          call="wallet.credit"
          args={["bubbles", 1000]}
          note="The wallet's credit: no waiting on this page."
        >
          Add 1,000 bubbles
        </Shortcut>
        <Shelf />
        <TheStir />
        <StartOver />
      </Panel>
    </Bundled>
  );
}

export default definePage({
  title: "A shop: the upgrade tree",
  idea: (
    <>
      Things you buy once that change a number. An upgrade tree whose upgrades have one rank each is a shop,
      and each upgrade is an effect on a stat.
    </>
  ),
  // The panel runs guide-first-page.ts as bundled with the page (kit/bundled.tsx); the kit's own host runs this
  // small file only because a page must name one.
  game: { file: "simmer/game-wallet.ts", keep: "memory", clock: false },
  code: {
    upgrades: { at: "UPGRADES", file: "guide-first-page.ts" },
    kitchen: { at: "kitchen", file: "guide-first-page.ts" },
    stat: { at: "statOf", file: "guide-first-page.ts" },
  },
  Panel: TheKitchen,
  Body: () => (
    <>
      <p>
        A shop sells things you buy once: a pinch of salt, a whisk. Each changes a number for good. Simmer's
        changes the stir: what a stir of the pot pays.
      </p>
      <p>
        The engine's shop is an <Term id="upgrade-tree">upgrade tree</Term>: a list of upgrades, each with a
        price, how many times it can be bought (its ranks), what must be bought first, and its effects. When
        every upgrade has one rank and needs nothing first, the tree is a plain shop. Here is Simmer's
        kitchen, as data:
      </p>
      <Listing id="upgrades" />
      <p>
        <code>id</code>, <code>name</code> and <code>line</code> are yours. <code>cost</code> is the price, in
        a currency from the vocabulary. <code>maxLevel</code> is the ranks: the whisk can be bought five
        times, each rank twice the price of the last (<code>costGrowth</code>), and only once the salt is
        bought (<code>requires</code>). <code>effects</code> are the same kind of effect the lid has on heat,
        on a stat called <code>stir</code> this time: salt multiplies it by 2, each rank of the whisk adds 1.
      </p>
      <Listing id="kitchen" />
      <p>
        <code>defineUpgradeTree</code> is one more factory: the nodes, and the wallet that pays. (
        <code>open</code> keeps the copper kettles off the shelf until there is a kettle to put it on.) It
        hands back <code>kitchen.buy(id)</code>, its slice (the ranks bought of each), and questions under{" "}
        <code>kitchen.select</code>: whether a node is on offer, what it costs, and every effect the ranks
        bought so far give.
      </p>
      <Try>
        <li>
          Add 1,000 bubbles. The whisk's button stays dashed all the same: it requires the salt, and the tree
          will not sell it first.
        </li>
        <li>Buy the salt. The stir goes from 1 to 2, and its breakdown gains a row.</li>
        <li>
          Buy the whisk twice. Each rank adds 1, and the breakdown counts the ranks in one row: (1 + 2) × 2 =
          6, the adds summed onto the base, then the multiplier, as heat's were.
        </li>
        <li>
          Stir. A stir pays at least the stir, so the same button pays more after each upgrade. (The ladle in
          the list above is not on the panel's shelf: it raises big bubbles to catch, a part of chapter 6's
          page this one leaves out.)
        </li>
      </Try>

      <h2>From effects to the number</h2>
      <Listing id="stat" />
      <p>
        <code>statOf</code> folds the kitchen's effects into the stat's number: a base of 1, the adds, the
        multipliers. It is the stats feature's job, done by hand with the engine's{" "}
        <code>foldContributions</code> so you can see it; chapter 8 hands the shop's effects to the game's
        stats feature instead, beside the lid.
      </p>
      <Note title="What a stir pays">
        <p>
          The spoon is a button the engine also writes for you (chapter 6 has it): it pays the stir stat, plus
          a small share of what the pot makes each second, and more with foam on the pot. The stir is the part
          the shop raises.
        </p>
      </Note>
    </>
  ),
});
