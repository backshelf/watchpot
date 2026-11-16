import { type ReactNode, useState } from "react";
import {
  dueMilestones,
  eventCurrencyCap,
  eventNodeCost,
  fmt,
  msUntilRegen,
  resolveWindow,
  secondsUntil,
  ZERO,
} from "watchpot/core";
import { useClockNow } from "watchpot/react";
import { cx } from "watchpot/ui";
import { useGameState } from "../app/hooks";
import { playCast, playCatch, playClaim, playRaise } from "../app/sound";
import {
  NETS,
  SHARDS,
  SHOWER,
  type ShowerReward,
  SKY,
  SKY_COLUMNS,
  type SkyTokenId,
} from "../content/shower";
import { CURRENCY, PREMIUM, TAB_NAMES } from "../content/words";
import type { Catch } from "../game/events/shower/rules";
import { showerBag, showerMods } from "../game/events/shower/rules";
import { Badge, Button, Panel, ProgressBar, Timer } from "../ui";
import s from "./screens.module.css";
import w from "./shower.module.css";

const TOKEN = new Map(SKY.map((t) => [t.id, t]));

/** A token as the glass shows it: a fleck, a streak, a fireball, a seed pod, or nothing. */
function TokenMark({ id }: { id: SkyTokenId }) {
  const marks: Record<SkyTokenId, ReactNode> = {
    glint: <circle cx="12" cy="12" r="2" fill="currentColor" />,
    streak: <path d="M5 19 17 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
    fireball: (
      <>
        <path d="M3 21 11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        <circle cx="14" cy="10" r="5" fill="currentColor" />
      </>
    ),
    pod: <path d="M12 4c3.5 2 5 5.5 5 8a5 5 0 0 1-10 0c0-2.5 1.5-6 5-8Z" fill="currentColor" />,
    dark: (
      <circle
        cx="12"
        cy="12"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2 3"
      />
    ),
  };
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      {marks[id]}
    </svg>
  );
}

/** What a milestone pays, in words. */
const rewardText = (r: ShowerReward) =>
  r.kind === "seeds"
    ? `${fmt(r.amount).text} ${CURRENCY[PREMIUM].plural.toLowerCase()}`
    : r.kind === "sunlight"
      ? `${r.minutes} minutes of sunlight`
      : r.count === 1
        ? "a graft kit"
        : `${r.count} graft kits`;

/** What a node of the shower's tree does, a rank. */
const effectText = (e: (typeof SHOWER.upgrades)[number]["effects"][number]) =>
  e.kind === "catch"
    ? `Catch ×${e.mult} a rank`
    : e.kind === "scope"
      ? `Nets back ${Math.round((e.mult - 1) * 100)}% sooner a rank`
      : `+${e.add} net held a rank`;

/** The line a catch leaves under the sky. */
const catchLine = (c: Catch) => {
  const t = TOKEN.get(c.token);
  if (!t) return "";
  if (c.token === "dark") return t.line;
  if (c.token === "pod") return `${t.name}. ${c.seeds} seeds.`;
  return `${t.name}. ${c.shards} ${c.shards === 1 ? "shard" : "shards"}.`;
};

/**
 * The meteor shower: the sky while it falls (a net cast at a cell brings back what is there), the nets' tree bought
 * with shards, and the milestones the catch reaches. Between showers, the countdown and the record.
 */
export function ShowerScreen() {
  const now = useClockNow(1000);
  const rt = useGameState((st) => st.events.runtime);
  const sky = useGameState((st) => st.events.sky);
  const ever = useGameState((st) => st.events.caughtEver);
  const cast = useGameState((st) => st.events.cast);
  const buyNode = useGameState((st) => st.events.buyNode);
  const claim = useGameState((st) => st.events.claim);
  const [last, setLast] = useState<Catch | null>(null);
  const span = resolveWindow(SHOWER.schedule, now);
  const live = span.active && rt.cycleStart === span.start;
  const bag = showerBag(rt);
  const nets = Math.floor((rt.currencies[NETS] ?? ZERO).toNumber());
  const cap = eventCurrencyCap(SHOWER, NETS, bag)?.toNumber() ?? nets;
  const shards = rt.currencies[SHARDS] ?? ZERO;
  const nextNet = live ? msUntilRegen(SHOWER, rt, NETS, now, bag) : null;
  const caught = rt.stats.caught ?? 0;
  const due = new Set(dueMilestones(SHOWER, rt).map((m) => m.id));
  const catchMult = showerMods(rt).catchMult;
  // The first milestone waiting is the screen's one primary; while the shower falls, the sky is the play.
  const firstDue = SHOWER.milestones.find((m) => due.has(m.id))?.id;
  // Between showers the glass stays up, every pane empty.
  const cells = live ? sky.cells : sky.cells.map(() => null);

  const throwAt = (cell: number) => {
    playCast();
    const c = cast(cell);
    setLast(c);
    if (c) playCatch(c.token);
  };

  return (
    <div className={s.screen}>
      <div className={w.head}>
        <h1 className={s.title}>{TAB_NAMES.event}</h1>
        <Timer
          variant="pill"
          label={span.active ? "Ends in" : "Next in"}
          endedLabel="Ended"
          warnUnder={600}
          secondsLeft={secondsUntil(span.active ? span.end : span.start, now)}
        />
      </div>
      <p className={cx("body", s.muted)}>
        {span.active ? SHOWER.tagline : "The sky is quiet. It won't be for long."}
      </p>

      <Panel
        heading={live ? `Wave ${sky.wave}` : "The glass"}
        aside={
          live ? (
            <span className="small">
              <span className="num">{nets}</span> of <span className="num">{cap}</span> nets
              {nextNet !== null && <span className={s.muted}> · next in {fmtClock(nextNet)}</span>}
            </span>
          ) : undefined
        }
      >
        <ul
          className={w.sky}
          style={{ "--sky-cols": SKY_COLUMNS }}
          aria-label="The sky"
          data-live={live || undefined}
        >
          {cells.map((token, i) => (
            <li key={i}>
              {token ? (
                <div className={w.cell} data-token={token}>
                  <TokenMark id={token} />
                  <span className="small">{TOKEN.get(token)?.name}</span>
                </div>
              ) : (
                <button
                  type="button"
                  className={w.cell}
                  data-open=""
                  disabled={!live || nets < 1}
                  aria-label={`Cast a net at cell ${i + 1}`}
                  onClick={() => throwAt(i)}
                />
              )}
            </li>
          ))}
        </ul>
        <p className={cx("small", w.catch)} aria-live="polite">
          {!live ? (
            <>
              <span className="num">{fmt(ever).text}</span> shards caught, every shower so far.
            </>
          ) : last ? (
            catchLine(last)
          ) : nets < 1 ? (
            "Out of nets. They come back on their own."
          ) : (
            "Pick a patch of sky."
          )}
        </p>
      </Panel>

      <Panel
        heading="The nets"
        aside={
          <span className="small">
            <span className="num">{fmt(shards).text}</span> {shards.eq(1) ? "shard" : "shards"} · catch ×
            {catchMult.toFixed(2)}
          </span>
        }
      >
        {!live && <p className={cx("small", s.muted)}>Nets are mended while the shower falls.</p>}
        <ul className={s.list}>
          {SHOWER.upgrades.map((node) => {
            const rank = rt.upgrades[node.id] ?? 0;
            const locked = node.requires.some((r) => !(rt.upgrades[r] ?? 0));
            const [price] = rank < node.maxLevel ? eventNodeCost(node, rank) : [];
            const affordable = price ? shards.gte(price.amount) : false;
            return (
              <li key={node.id} className={w.node}>
                <div>
                  <p className="body-strong">
                    {node.name}{" "}
                    <span className={cx("small num", s.muted)}>
                      {rank}/{node.maxLevel}
                    </span>
                  </p>
                  <p className={cx("small", s.muted)}>
                    {node.line} {node.effects.map(effectText).join(", ")}.
                  </p>
                </div>
                {price ? (
                  <Button
                    variant="paper"
                    disabled={!affordable || !live || locked}
                    cost={fmt(price.amount).text}
                    unit="shards"
                    onClick={(event) => buyNode(node.id) && playRaise(event.currentTarget)}
                  >
                    {locked ? "Needs a wider net" : "Mend"}
                  </Button>
                ) : (
                  <span className={cx("small", s.muted)}>As good as it gets</span>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel heading="What the catch earns" badge={<Badge count={due.size} words={(n) => `${n} waiting`} />}>
        <ul className={s.list}>
          {SHOWER.milestones.map((m) => {
            const claimed = rt.milestonesClaimed.includes(m.id);
            return (
              <li key={m.id} className={w.milestone}>
                <div className={w.milestoneText}>
                  <p className="body-strong">{m.name}</p>
                  <p className={cx("small", s.muted)}>{m.rewards.map(rewardText).join(", ")}</p>
                  {!claimed && !due.has(m.id) && (
                    <ProgressBar
                      thin
                      value={Math.min(caught, m.threshold)}
                      max={m.threshold}
                      label={`${m.name}: ${caught} of ${m.threshold} shards`}
                    />
                  )}
                </div>
                {claimed ? (
                  <span className={cx("small", s.muted)}>Claimed</span>
                ) : due.has(m.id) ? (
                  <Button
                    variant={m.id === firstDue ? "primary" : "paper"}
                    onClick={(event) => claim(m.id) && playClaim(event.currentTarget)}
                  >
                    Claim
                  </Button>
                ) : (
                  <span className={cx("small num", s.muted)}>
                    {caught}/{m.threshold}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

/** Minutes and seconds, for the next net. */
function fmtClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
