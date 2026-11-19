// Getting started, step 20: an upgrade whose effect is not a number. The workshop's shop node has no effects at all:
// it raises a flag, and the flag both opens a page in the panel and switches a step on. The reader buys it, watches the
// page and the draw appear, then unwrites the flag and watches them go.
import { fmt, fmtRate, type StateOf } from "watchpot/core";
import type * as Flags from "../../../../docs/examples/guide-flags";
import {
  Act,
  Actions,
  Code,
  CodeName,
  Controls,
  choice,
  definePage,
  Note,
  Panel,
  Readout,
  Readouts,
  Shortcut,
  StartOver,
  Term,
  Try,
  useExample,
  useSnapshot,
} from "../kit";

type S = StateOf<typeof Flags.game.features>;
type Example = typeof Flags;

function TheWorkshop() {
  const { grateRow, hasGrate } = useExample<Example>();
  const { state } = useSnapshot();
  const s = state as S;
  const row = grateRow(s);
  const open = hasGrate(s);
  return (
    <Panel title="The workshop">
      <Readouts>
        <Readout<S> big label="Coals" select={(s) => fmt(s.wallet.coals).text} />
        <Readout<S>
          label="The fire draws"
          select={(s) => (hasGrate(s) ? fmtRate(s.numbers.glow) : "nothing")}
        />
        <Readout<S>
          label={<CodeName>{'numbers.flags["second-grate"]'}</CodeName>}
          select={(s) => String(hasGrate(s))}
        />
      </Readouts>
      <Actions>
        <Act call="fire.stoke">Stoke the fire</Act>
      </Actions>
      <Shortcut
        call="wallet.credit"
        args={["coals", 20]}
        note="The wallet's credit: no waiting on this page."
      >
        Add 20 coals
      </Shortcut>
      <div className="panel__row">
        <span>{row.name}</span>
        <Act<S> call="grate.buy" args={["second-grate"]} ready={() => row.canBuy}>
          {row.price === null ? (
            "Bought"
          ) : (
            <>
              Buy: <span className="num">{row.price}</span>
            </>
          )}
        </Act>
      </div>
      {open ? (
        <section aria-label="The second grate">
          <h3>The second grate</h3>
          <p>
            The fire draws {fmtRate(s.numbers.glow)} on its own, without a press. This is the page the flag
            opened.
          </p>
        </section>
      ) : null}
      <StartOver />
    </Panel>
  );
}

export default definePage({
  title: "An upgrade whose effect is not a number.",
  idea: (
    <>
      An upgrade can do something that is not a number: open a page, put a tab on the rail, switch a rule on.
      The engine's name for that is a flag, and a game's rules ask about it.
    </>
  ),
  game: { file: "guide-flags.ts", keep: "local", clock: true },
  params: {
    flag: choice({
      at: "SECOND_GRATE",
      find: 'flags: ["second-grate"]',
      token: '["second-grate"]',
      label: "The flag the source raises",
      options: [
        { label: "Raised", code: '["second-grate"]' },
        { label: "Unwritten", code: "[]" },
      ],
    }),
  },
  code: {
    shop: { at: "grate > nodes" },
    source: { at: "SECOND_GRATE" },
    stats: { at: "numbers" },
    rule: { at: "fire > steps > produce > grate" },
    pay: { at: "fire > actions > stoke" },
  },
  Panel: TheWorkshop,
  Body: () => (
    <>
      <p>
        Every upgrade so far changed a number: the salt doubled the stir, a rank of the whisk added one. An
        upgrade does not have to. It can open a page, put a tab on the rail, or switch a rule on, and change
        no number at all. The engine's name for a switch like that is a flag: a name the game's rules ask
        about, and get yes or no.
      </p>
      <p>
        The workshop is a small game with one such upgrade. A press stokes the fire for coals; the shop sells
        one thing, a second grate. It has no numbers in it:
      </p>
      <Code id="shop" />
      <p>
        <code>effects: []</code> is the whole of it. The upgrade tree is the same{" "}
        <Term id="upgrade-tree">upgrade tree</Term> page 17 used, and this node's list of{" "}
        <Term id="effect">effects</Term> is empty. So what does it do? The flag.
      </p>

      <h2>Where a flag lives</h2>
      <p>
        The engine keeps flags with the <Term id="stats-feature">stats feature</Term>, which page 14 met as
        the one place every multiplier is folded. A source there may raise flags beside its effects, and a
        source with no effects still counts: its flags are raised while it counts. Here is the source that
        reads the rank bought:
      </p>
      <Code id="source" />
      <p>
        <code>active</code> is the question "does this count now", and it counts while the grate is bought.
        Its whole doing is <code>flags: ["second-grate"]</code>. The stats feature is told the name once, so
        every reader gets a typed <code>true</code> or <code>false</code>:
      </p>
      <Code id="stats" />
      <p>
        <code>s.numbers.flags["second-grate"]</code> is true or false, worked out from the ranks on every
        read. (It is a <Term id="derived-value">derived value</Term>: never saved, so a save cannot disagree
        with what was bought.)
      </p>

      <h2>Three places read it</h2>
      <p>
        The page asks, to decide whether to draw the grate's own page. The step asks, to decide whether the
        fire draws at all:
      </p>
      <Code id="rule" />
      <p>
        And a press asks, to pay more for a stoke once the grate is in. A rule is only a rule because
        something asks:
      </p>
      <Code id="pay" />
      <Controls />
      <Try>
        <li>
          Add 20 coals, then buy "A second grate". A page appears under the shop, and the coals start climbing
          without a press.
        </li>
        <li>
          Set "The flag the source raises" to "Unwritten". The page goes and the draw stops, and the readout
          that is the flag itself says <code>false</code>: the grate is still bought, and the flag is what the
          game reads.
        </li>
        <li>Put the flag back. The page and the draw return, with no purchase in between.</li>
        <li>
          Stoke. It pays 2 coals with the flag raised and 1 with it unwritten: the same flag answers the press
          and the step, because both ask it.
        </li>
      </Try>
      <Note title="A rule can be a whole screen">
        <p>
          Here the flag opens a section of the panel. In a game with several pages it opens a tab, and page 21
          shows the rail it appears on. Either way the flag is the same thing: a name, asked by whatever
          decides what the player sees and what the game does.
        </p>
      </Note>
    </>
  ),
});
