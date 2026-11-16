import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  BIG_STEP,
  burst,
  Flash,
  isTopTier,
  roomStep,
  tierInk,
  tierOf,
  useRevealSequence,
  useShake,
} from "watchpot/kit";
import { cx, Dialog, Portal, usePageLayout, VisuallyHidden } from "watchpot/ui";
import { Button } from "./Button";
import { usePageRoot } from "./pageRoot";
import s from "./Reveal.module.css";

/** Where a pull stands in the reveal: a back in the hand, the one in the centre, or filed on the shelf. */
export type RevealRole = "deck" | "stage" | "shelf";

/** What a pull's faces are told: where it stands, whether it has turned, whether it is charging face down. */
export interface RevealFace {
  role: RevealRole;
  turned: boolean;
  /** Lifted face down in the centre while the room takes its rung's colour. */
  charging: boolean;
  reduced: boolean;
}

/** Everything the reveal says around the pulls, in the game's words. */
export interface RevealWords {
  /** The Skip button. */
  skip: string;
  /** After the title while more than one pull: how far along ("3 of 10"). */
  count: (shown: number, total: number) => string;
  /** The line at the foot once a face holds the centre, with this many still to turn ("Tap for the next."). */
  next: (left: number) => ReactNode;
  /** Under reduced motion while the backs are dealt (no hand is drawn): what waits ("10 more in the kit"). */
  waiting: (left: number) => ReactNode;
}

/** Props of `Reveal`: the open, the ladder and the pulls, their faces and words, the closing lot and the moments. */
export interface RevealProps<R extends string, P extends { rarity: R }> {
  /** One open: a new value (open again) starts the sequence over in the same render. */
  result: unknown;
  /** The dialog's name ("Graft kit reveal"). */
  label: string;
  /** The title in the reveal's head ("Graft kit"). */
  title: ReactNode;
  /** The game's rarity ladder, lowest first. */
  ladder: readonly R[];
  /** What the open dealt, in order. Keep the array stable for the open. */
  payloads: readonly P[];
  /** The box on the dark stage, closed or with its lid lifting; absent, the pulls arrive already dealt. */
  box?: (state: "closed" | "opening") => ReactNode;
  /** A pull's face and back, drawn at the card's width (`--w`, inherited). */
  front: (payload: P, index: number, face: RevealFace) => ReactNode;
  back: (payload: P, index: number, face: RevealFace) => ReactNode;
  /** Under (narrow) or beside (wide) the face in the centre: what it does. */
  panel?: (payload: P, index: number, ctx: { reduced: boolean }) => ReactNode;
  /** What the live region says as pull `index` shows. */
  faceWords: (payload: P, index: number) => string;
  /** The live region's last word, at the closing lot. */
  closingWords: string;
  words: RevealWords;
  /** The closing lot, in its block at the foot of the room. */
  summary: (ctx: { best: R; reduced: boolean; close: () => void }) => ReactNode;
  /** Escape, and any close the summary wires. */
  onClose: () => void;
  /** The lid lifts (its sound). */
  onOpening?: () => void;
  /** A big rung lifts face down and charges (its swell). */
  onCharge?: (payload: P, index: number) => void;
  /** A face starts to turn (its sting). */
  onTurn?: (payload: P, index: number) => void;
}

/** The hand of backs, in card units (x a share of the card's width, y of its height): a fan held from below. */
const FAN = { stepDeg: 5, radius: 1.25, rise: 0.89, deckY: 0.54, deckScale: 0.55 };
/** The centre: a little above the stage's middle. The shelf: a row of small faces along the top. */
const STAGE_Y = -0.1;
const SHELF = { y: -0.89, step: 0.133, scale: 0.22 };
/** Where the confetti starts: the centre face's heart, as a share of the room. */
const BURST_ORIGIN = { x: 0.5, y: 0.42 };

const POSE_SPRING = { type: "spring", stiffness: 240, damping: 24, mass: 0.9 } as const;
const TURN = { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] } as const;
const pct = (share: number) => `${Math.round(share * 1000) / 10}%`;

interface Pose {
  x: string;
  y: string;
  scale: number;
  rotate: number;
  z: number;
}

/**
 * The reveal on the engine's headless sequence (`useRevealSequence`): a modal room (a `Dialog` portalled to the body,
 * the page inert), the box with its lid, then the pulls dealt as a hand of backs and turned one at a time in order in
 * the centre, a big rung charging the room in its colour first. A tap, Enter, Space or the right arrow moves on, never
 * before the face has shown; Skip goes straight to the closing lot; a live region says each face. The room's light
 * climbs with the best rung shown and never falls back; the top rung lights every pane of the glass.
 */
export function Reveal<R extends string, P extends { rarity: R }>(props: RevealProps<R, P>) {
  const { result, label, title, ladder, payloads, box, words, onClose } = props;
  const page = usePageRoot();
  const { wide } = usePageLayout();
  const room = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [stageRef, shake] = useShake<HTMLDivElement>();
  const [said, setSaid] = useState("");
  const [flash, setFlash] = useState(0);
  const latest = useRef(props);
  latest.current = props;
  const reducedRef = useRef(false);

  // A new open says nothing until its first face shows.
  const [current, setCurrent] = useState(result);
  if (current !== result) {
    setCurrent(result);
    setSaid("");
  }

  const reveal = useRevealSequence<R, P>({
    result,
    ladder,
    payloads,
    gift: box === undefined,
    onOpening: () => latest.current.onOpening?.(),
    onCharge: (p, i) => latest.current.onCharge?.(p, i),
    onTurn: (p, i) => latest.current.onTurn?.(p, i),
    onLand: (p, i, landing) => {
      setSaid(latest.current.faceWords(p, i));
      if (landing.big) {
        setFlash((n) => n + 1);
        shake(landing.top ? "hard" : "soft");
      }
      if (!reducedRef.current)
        burst(landing.tier, {
          canvas: canvas.current ?? undefined,
          scope: room.current,
          origin: BURST_ORIGIN,
        });
    },
    onSummary: () => setSaid(latest.current.closingWords),
  });
  const { state, reduced } = reveal;
  reducedRef.current = reduced;

  // The room holds the keys (Enter on it taps), so focus stays inside it: whenever a phase change or a new open
  // removes the focused button (Skip at the closing lot, Open again), it comes back to the room.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on the changes that unmount focused buttons
  useEffect(() => {
    const el = room.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [state.phase, result]);

  const total = payloads.length;
  const summary = state.phase === "summary";
  const cards = state.phase === "cards";
  const showBox = box !== undefined && (state.phase === "chest" || state.phase === "opening");
  // The centre's index (turned, or charging face down), the first back still in the hand, and the shelf's length.
  const stageAt = cards ? (state.charging ? state.revealed : state.revealed - 1) : -1;
  const deckFrom = cards ? (state.charging ? state.revealed + 1 : state.revealed) : 0;
  const shelved = summary ? total : Math.max(0, stageAt);
  const roleOf = (i: number): RevealRole =>
    summary ? "shelf" : !cards ? "deck" : i < stageAt ? "shelf" : i === stageAt ? "stage" : "deck";
  const turnedOf = (i: number) => summary || (cards && i < state.revealed);
  const poseOf = (i: number, role: RevealRole): Pose => {
    if (role === "stage") return { x: "0%", y: pct(STAGE_Y), scale: 1, rotate: 0, z: 300 };
    if (role === "shelf")
      return {
        x: pct((i - (shelved - 1) / 2) * SHELF.step),
        y: pct(SHELF.y),
        scale: SHELF.scale,
        rotate: 0,
        z: 200 + i,
      };
    const held = total - deckFrom;
    const j = i - deckFrom;
    const off = j - (held - 1) / 2;
    const a = off * FAN.stepDeg;
    const r = (a * Math.PI) / 180;
    return {
      x: pct(Math.sin(r) * FAN.radius),
      y: pct(FAN.deckY + (1 - Math.cos(r)) * FAN.rise),
      scale: FAN.deckScale,
      rotate: a,
      z: 100 - Math.round(Math.abs(off) * 2),
    };
  };

  // The room's light: dim on the closed box, the signal as the lid lifts, then the best rung shown (or charging).
  const toneTier = reveal.tone === null ? null : tierOf(ladder, reveal.tone);
  const tone =
    state.phase === "chest"
      ? "var(--ui-ink-muted)"
      : state.phase === "opening" || toneTier === null
        ? "var(--ui-accent)"
        : tierInk(toneTier);
  const step = toneTier && !showBox ? roomStep(toneTier) : 0;
  const top = toneTier !== null && !showBox && isTopTier(toneTier);
  const stage = reveal.stage;

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      inertTarget={page}
      initialFocus={room}
    >
      <Portal>
        <Dialog.Panel
          ref={room}
          className={s.room}
          data-phase={state.phase}
          data-step={step}
          data-top={top ? "" : undefined}
          data-charging={reveal.charging !== undefined ? "" : undefined}
          data-reduced={reduced ? "" : undefined}
          data-wide={wide ? "" : undefined}
          style={{ "--tone": tone }}
          onKeyDown={reveal.onKeyDown}
        >
          <div className={s.pool} aria-hidden="true" />
          <div className={s.rays} aria-hidden="true" />
          <div className={s.glass} aria-hidden="true" />
          <canvas ref={canvas} className={s.confetti} />
          <Flash trigger={flash} className={s.flash} />
          <Dialog.Title asChild>
            <VisuallyHidden>{label}</VisuallyHidden>
          </Dialog.Title>
          {/* Each face as it shows, then the closing lot's line: mounted empty, only its words change. */}
          <VisuallyHidden aria-live="polite">{said}</VisuallyHidden>

          <div className={s.top}>
            <p className={s.title}>
              {title}
              {total > 1 && (
                <span className={s.count}> {words.count(Math.min(total, state.revealed), total)}</span>
              )}
            </p>
            {!summary && (
              // On its own ground block, as the title: the ghost button is see-through and the room runs under it.
              <span className={s.skip}>
                <Button variant="ghost" onClick={reveal.skip}>
                  {words.skip}
                </Button>
              </span>
            )}
          </div>

          <div ref={stageRef} className={s.stage} onClick={reveal.tap}>
            <div className={s.poses}>
              <AnimatePresence>
                {showBox && (
                  // The centring transform lives on this wrapper; motion writes its own on the element it animates.
                  <div key="box" className={s.box}>
                    <motion.div
                      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -40, scale: 0.9 }}
                      transition={reduced ? { duration: 0.2 } : { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                    >
                      {box(state.phase === "opening" ? "opening" : "closed")}
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
              {!showBox &&
                payloads.map((p, i) => {
                  const role = roleOf(i);
                  if (reduced && role === "deck") return null;
                  const turned = turnedOf(i);
                  const face: RevealFace = { role, turned, charging: role === "stage" && !turned, reduced };
                  const { z, ...place } = poseOf(i, role);
                  const big = roomStep(tierOf(ladder, p.rarity)) >= BIG_STEP;
                  return (
                    <motion.div
                      key={i}
                      className={s.card}
                      data-role={role}
                      data-turned={turned ? "" : undefined}
                      data-pop={big ? "" : undefined}
                      style={{ zIndex: z }}
                      initial={
                        reduced
                          ? { ...place, opacity: 0 }
                          : { opacity: 0, x: "0%", y: "30%", scale: 0.4, rotate: 0 }
                      }
                      animate={{ ...place, opacity: 1 }}
                      transition={reduced ? { duration: 0, opacity: { duration: 0.2 } } : POSE_SPRING}
                    >
                      <div className={s.lift}>
                        <motion.div
                          className={s.flipper}
                          animate={{ rotateY: turned && !reduced ? 180 : 0 }}
                          transition={reduced ? { duration: 0 } : TURN}
                        >
                          <div className={s.face} style={reduced ? { opacity: turned ? 0 : 1 } : undefined}>
                            {props.back(p, i, face)}
                          </div>
                          <div
                            className={cx(s.face, s.front)}
                            style={reduced ? { opacity: turned ? 1 : 0 } : undefined}
                          >
                            {props.front(p, i, face)}
                          </div>
                        </motion.div>
                      </div>
                    </motion.div>
                  );
                })}
            </div>
            {stage && props.panel && (
              <div key={`panel-${state.revealed}`} className={s.panel}>
                {props.panel(stage.payload, stage.index, { reduced })}
              </div>
            )}
            {cards && reveal.charging === undefined && state.revealed === 0 && reduced && (
              <p className={s.foot}>{words.waiting(reveal.remaining)}</p>
            )}
            {stage && <p className={s.foot}>{words.next(reveal.remaining)}</p>}
          </div>

          {summary && reveal.best !== undefined && (
            <div className={s.summary}>{props.summary({ best: reveal.best, reduced, close: onClose })}</div>
          )}
        </Dialog.Panel>
      </Portal>
    </Dialog.Root>
  );
}
