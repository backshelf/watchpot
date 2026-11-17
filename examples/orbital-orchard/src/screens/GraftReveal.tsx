import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { fmt } from "watchpot/core";
import { type RarityTier, tierOf } from "watchpot/kit";
import { cx } from "watchpot/ui";
import { effectText } from "../app/effects";
import { useGameState, useGameStore } from "../app/hooks";
import { glyphOf } from "../app/icons";
import { useOpenSheet } from "../app/sheets";
import { playCharge, playKit, playReveal } from "../app/sound";
import { BOX, BOX_NAME, ITEMS, type ItemDef, RARITY_NAME } from "../content/gacha";
import { knobs } from "../content/knobs";
import { CURRENCY, NAME, PREMIUM, type Rarity, WORDS } from "../content/words";
import { Button, Chest, RarityChip, Reveal, type RevealWords } from "../ui";
import r from "./reveal.module.css";

const LADDER = WORDS.rarities.ids;
const TOP = LADDER[LADDER.length - 1] as Rarity;
const ITEM = new Map(ITEMS.map((it) => [it.id, it]));
const tier = (rarity: Rarity): RarityTier => ({ ...tierOf(LADDER, rarity), label: RARITY_NAME[rarity] });
/** Half the turn: the words under a face wait for it to show. */
const HALF_TURN_S = 0.3;

/** What the reveal says around the grafts. */
const REVEAL_WORDS: RevealWords = {
  skip: "Skip",
  count: (shown, total) => `${shown} of ${total}`,
  next: (left) =>
    left > 0 ? (
      <>
        Tap for the next. <span className="num">{left}</span> left.
      </>
    ) : (
      "Tap to finish."
    ),
  waiting: (left) => (
    <>
      <span className="num">{left}</span> more in the kit
    </>
  ),
};

/** One graft off the bench: the item, and whether it is the first of the top rung the orchard has ever taken. */
interface Graft {
  rarity: Rarity;
  item: ItemDef;
  first: boolean;
}

/** The grafts the last pull took, the first top-rung one marked: read once per open. */
function graftsOf(last: readonly string[], owned: Readonly<Record<string, number>>): Graft[] {
  const topOwned = ITEMS.filter((it) => it.rarity === TOP).reduce((n, it) => n + (owned[it.id] ?? 0), 0);
  const topHere = last.filter((id) => ITEM.get(id)?.rarity === TOP).length;
  let firstLeft = topOwned === topHere && topHere > 0;
  return last.flatMap((id) => {
    const item = ITEM.get(id);
    if (!item) return [];
    const first = firstLeft && item.rarity === TOP;
    if (first) firstLeft = false;
    return [{ rarity: item.rarity, item, first }];
  });
}

/**
 * A graft's face: the rung, the fruit on its scion in the rung's colour, the name, drawn at the card's width (`--w`).
 * The first heirloom's bud swells once its face has turned (`data-turned`), its halo opening in rose with a ring
 * going out to the glass.
 */
function GraftFace({ graft, turned }: { graft: Graft; turned: boolean }) {
  return (
    <div
      className={r.face}
      data-rarity={graft.rarity}
      data-first={graft.first || undefined}
      data-turned={turned || undefined}
    >
      <p className={r.rung}>{RARITY_NAME[graft.rarity]}</p>
      <svg className={r.art} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle className={r.halo} cx="56" cy="46" r="34" />
        {graft.first && <circle className={r.ring} cx="58" cy="44" r="30" />}
        <path className={r.scion} d="M18 92C30 74 38 64 50 56M34 72c-8-2-14-8-16-16 9 1 15 6 16 16Z" />
        <circle className={r.fruit} cx="58" cy="44" r="16" />
        <path className={r.leaf} d="M60 28c4-10 12-14 22-14-2 10-10 16-22 14Z" />
      </svg>
      <p className={r.name}>{graft.item.name}</p>
    </div>
  );
}

/** The back of a graft: the station's seal on the dark, its edge taking the rung's colour while the room charges. */
function GraftBack({ rarity, charging }: { rarity: Rarity; charging: boolean }) {
  return (
    <div
      className={r.back}
      data-charging={charging || undefined}
      style={{ "--hue": `var(--rarity-${rarity})` }}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <ellipse cx="50" cy="50" rx="34" ry="12" />
        <circle cx="50" cy="50" r="6" />
      </svg>
      <p className={r.backName}>{NAME}</p>
    </div>
  );
}

/**
 * The graft reveal: the game's `Reveal` over the graft kit, the graft faces on it. The heirloom rung charges the room
 * in its rose before it turns; the first heirloom the orchard ever takes says so.
 */
export function GraftReveal({ n, onClose }: { n: number; onClose: () => void }) {
  const store = useGameStore();
  const openSheet = useOpenSheet();
  const premium = useGameState((st) => st.wallet[PREMIUM]);
  const tokens = useGameState((st) => st.summon.tokens[BOX] ?? 0);
  const [failure, setFailure] = useState<string | null>(null);
  // The open's grafts, read once per open: the sequence needs a stable array.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new open is a new `n`
  const grafts = useMemo(() => {
    const st = store.getState();
    return graftsOf(st.collection.last, st.collection.owned);
  }, [n]);
  const count = grafts.length;
  const price = knobs.get("pullPrice") * Math.max(0, count - tokens);
  const words = CURRENCY[PREMIUM];

  const openAgain = () => {
    if (!store.getState().collection.pull(count)) {
      setFailure(`Not enough ${words.plural.toLowerCase()} for that.`);
      return;
    }
    setFailure(null);
    openSheet({ kind: "reveal", n: n + 1 });
  };

  return (
    <Reveal<Rarity, Graft>
      result={n}
      label={`${BOX_NAME} reveal`}
      title={BOX_NAME}
      ladder={LADDER}
      payloads={grafts}
      words={REVEAL_WORDS}
      box={(state) => <Chest name={BOX_NAME} state={state} />}
      onOpening={playKit}
      onCharge={playCharge}
      onTurn={(graft) => playReveal(graft.rarity)}
      back={(graft, _i, face) => <GraftBack rarity={graft.rarity} charging={face.charging} />}
      front={(graft, _i, face) => <GraftFace graft={graft} turned={face.turned} />}
      panel={(graft, _i, { reduced }) => (
        <motion.div
          className={r.panelBody}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduced ? 0 : HALF_TURN_S, duration: 0.3 }}
        >
          {/* The words wait for the bud to swell. */}
          {graft.first && (
            <motion.p
              className={r.first}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduced ? 0 : 1.2, duration: 0.6 }}
            >
              The first heirloom. It took.
            </motion.p>
          )}
          <p className="small">{effectText(graft.item.effect)} for every one grafted.</p>
        </motion.div>
      )}
      faceWords={(graft) =>
        `${RARITY_NAME[graft.rarity]}. ${graft.item.name}. ${effectText(graft.item.effect)}.${graft.first ? " The first heirloom." : ""}`
      }
      closingWords={`${count} ${count === 1 ? "graft" : "grafts"} taken.`}
      onClose={onClose}
      summary={({ close }) => (
        <div className={r.summary}>
          <p className={cx("title", r.summaryTitle)}>
            {count === 1 ? "One graft taken" : `${count} grafts taken`}
          </p>
          {grafts.some((g) => g.first) && (
            <p className={cx("small", r.summaryFirst)}>The first heirloom. Something to hand down.</p>
          )}
          <ul className={r.rows}>
            {grafts.map((g, i) => (
              <li key={i} className={r.row} data-rarity={g.rarity}>
                <RarityChip tier={tier(g.rarity)} />
                <span className="body">{g.item.name}</span>
                <span className={cx("small", r.rowMeta)}>{effectText(g.item.effect)}</span>
              </li>
            ))}
          </ul>
          {failure && <p className="small">{failure}</p>}
          <div className={r.actions}>
            <Button
              variant="primary"
              size="large"
              disabled={premium.lt(price)}
              onClick={openAgain}
              cost={price > 0 ? fmt(price).text : undefined}
              glyph={price > 0 ? glyphOf(words.glyph) : undefined}
              currencyWord={words.plural}
            >
              {count === 1 ? "Graft again" : `Graft ${count} again`}
            </Button>
            <Button variant="ghost" size="large" onClick={close}>
              Back to the bench
            </Button>
          </div>
        </div>
      )}
    />
  );
}
