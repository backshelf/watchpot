import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useReducedMotion } from "../fx/motion";
import { type RarityTier, tierOf } from "../fx/rarity";
import { BIG_STEP, bestOf, ROOM_STEPS, roomStep, rungAtLeast } from "./ladder";
import {
  chargeMs,
  initialReveal,
  nextDelay,
  REVEAL_TIMING,
  type RevealState,
  reduceReveal,
} from "./sequence";

/**
 * The reveal's director without a look: the queue that plays a game's payloads in order, the timers that move the
 * box, the lid, the deal and a charge on by themselves, the tap that turns the next face (never before the last one
 * has shown), Skip, and the best rung so far. The game draws every element and plays every effect from the
 * callbacks; nothing here renders.
 */

/** What a face's landing is told: its rung, the reveal step that rung lands on (`roomStep`), and whether it is big. */
export interface RevealLanding {
  tier: RarityTier;
  /** 0 for the lowest rung to `ROOM_STEPS - 1` for the top of any ladder. */
  step: number;
  /** From `BIG_STEP`: the rung that charges before it turns and lands loud. */
  big: boolean;
  /** The ladder's top step. */
  top: boolean;
}

/** Options of `useRevealSequence`: the open, the ladder, the payloads, and the moments the game hears. */
export interface RevealSequenceOptions<R extends string, P extends { rarity: R }> {
  /** One open: a new value (open again) starts the sequence over in the same render. */
  result: unknown;
  /** The game's rarity ladder, lowest first. */
  ladder: readonly R[];
  /** What the open dealt, in order. Keep the array stable for the open: a new one is read as new pulls. */
  payloads: readonly P[];
  /** No box: the pulls arrive already dealt (a reward). */
  gift?: boolean;
  /** Reduced motion; the kit's reduced-motion store by default. */
  reduced?: boolean;
  /** How long a rung charges before it turns, ms; `chargeMs` by default (the big steps only). */
  charge?: (tier: RarityTier) => number;
  /** The lid lifts. */
  onOpening?: () => void;
  /** A big rung lifts face down and charges (play its swell). */
  onCharge?: (payload: P, index: number) => void;
  /** A face starts to turn (play its sting). */
  onTurn?: (payload: P, index: number) => void;
  /** The face has turned into view, half a turn later (or at once under reduced motion): its burst, its words. */
  onLand?: (payload: P, index: number, landing: RevealLanding) => void;
  /** The closing lot is up. */
  onSummary?: () => void;
}

/** What `useRevealSequence` hands back: the state, what to draw, and the player's moves. */
export interface RevealSequenceApi<R extends string, P extends { rarity: R }> {
  state: RevealState;
  reduced: boolean;
  /** The best rung whose face has shown (every face at the summary): a light that never falls back. */
  lit: R | null;
  /** The best rung of the whole open. */
  best: R | undefined;
  /** The rung lifted face down and charging now. */
  charging: R | undefined;
  /** The rung the room should take now: the charging one when it is higher than `lit`, else `lit`. */
  tone: R | null;
  /** The payload turned and holding the centre, and its index (-1 for none). */
  stage: { payload: P; index: number } | null;
  /** Payloads not yet turned. */
  remaining: number;
  /** The player's tap: moves on, unless the face in the centre has not shown yet. */
  tap: () => void;
  /** Straight to the closing lot. */
  skip: () => void;
  /** Tell the sequence face `index` has turned into view (a renderer's flip reached edge-on). */
  face: (index: number) => void;
  /** Keys for the stage element: Enter, Space and ArrowRight tap when the stage itself has focus. */
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

const ADVANCE_KEYS = new Set(["Enter", " ", "ArrowRight"]);

/** The reveal sequence as a hook: see the module comment. */
export function useRevealSequence<R extends string, P extends { rarity: R }>(
  options: RevealSequenceOptions<R, P>,
): RevealSequenceApi<R, P> {
  const { result, ladder, payloads, gift = false } = options;
  const osReduced = useReducedMotion();
  const reduced = options.reduced ?? osReduced;
  const chargeOf = options.charge ?? chargeMs;
  const rarities = useMemo(() => payloads.map((p) => p.rarity), [payloads]);
  const charges = useMemo(
    () => rarities.map((r) => chargeOf(tierOf(ladder, r))),
    [rarities, ladder, chargeOf],
  );
  const [state, dispatch] = useReducer(reduceReveal, null, () => initialReveal(charges, reduced, gift));
  const [lit, setLit] = useState<R | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const turnedAt = useRef(Number.NEGATIVE_INFINITY);
  const landed = useRef(-1);
  const charged = useRef(-1);
  const alive = useRef(true);
  const climb = useCallback(
    (rarity: R) => setLit((was) => (was !== null && rungAtLeast(ladder, was, rarity) ? was : rarity)),
    [ladder],
  );

  // A new result starts over in this render, so no commit shows it under the old phase. Only a new result: a motion
  // setting changed mid-reveal must not send it back to the box.
  const [current, setCurrent] = useState(result);
  if (current !== result) {
    setCurrent(result);
    dispatch({ type: "reset", charges, reduced, gift });
    setLit(null);
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: `result` is the trigger, not read
  useLayoutEffect(() => {
    landed.current = -1;
    charged.current = -1;
    turnedAt.current = Number.NEGATIVE_INFINITY;
  }, [result]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // One timer per state: the box, the lid, the deal and a charge move on by themselves; a turned face waits.
  useEffect(() => {
    const delay = nextDelay(state);
    if (delay === null) return;
    const id = setTimeout(() => dispatch({ type: "timer" }), delay);
    return () => clearTimeout(id);
  }, [state]);

  useEffect(() => {
    if (state.phase === "opening") latest.current.onOpening?.();
    if (state.phase === "summary") latest.current.onSummary?.();
  }, [state.phase]);

  // The charge: the room is lit by that rung from here on.
  useEffect(() => {
    if (state.phase !== "cards" || !state.charging || charged.current === state.revealed) return;
    charged.current = state.revealed;
    const payload = payloads[state.revealed];
    if (!payload) return;
    latest.current.onCharge?.(payload, state.revealed);
    climb(payload.rarity);
  }, [state.phase, state.charging, state.revealed, payloads, climb]);

  // What a turn reads, kept current without restarting it: a ladder or payload list that is a new array on a
  // re-render must not cancel a face's landing.
  const inputs = useRef({ payloads, ladder, climb });
  inputs.current = { payloads, ladder, climb };

  // A turn: the sting now; as the face shows, the landing.
  useEffect(() => {
    const k = state.revealed - 1;
    if (state.phase !== "cards" || k < 0 || k <= landed.current) return;
    landed.current = k;
    const { payloads, ladder, climb } = inputs.current;
    const payload = payloads[k];
    if (!payload) return;
    latest.current.onTurn?.(payload, k);
    const tier = tierOf(ladder, payload.rarity);
    const step = roomStep(tier);
    const at = reduced ? 0 : REVEAL_TIMING.turn / 2;
    turnedAt.current = reduced ? Number.NEGATIVE_INFINITY : performance.now();
    const id = setTimeout(() => {
      if (!alive.current) return;
      climb(payload.rarity);
      latest.current.onLand?.(payload, k, { tier, step, big: step >= BIG_STEP, top: step >= ROOM_STEPS - 1 });
    }, at);
    return () => clearTimeout(id);
  }, [state.revealed, state.phase, reduced]);

  const tap = useCallback(() => {
    if (performance.now() - turnedAt.current < REVEAL_TIMING.turn / 2) return;
    dispatch({ type: "tap" });
  }, []);
  const skip = useCallback(() => dispatch({ type: "skip" }), []);
  const face = useCallback((index: number) => dispatch({ type: "face", index }), []);
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget || !ADVANCE_KEYS.has(event.key)) return;
      event.preventDefault();
      tap();
    },
    [tap],
  );

  const best = bestOf(ladder, rarities);
  const shownLit = state.phase === "summary" ? (best ?? null) : lit;
  const charging = state.phase === "cards" && state.charging ? rarities[state.revealed] : undefined;
  const tone =
    charging !== undefined && (shownLit === null || rungAtLeast(ladder, charging, shownLit))
      ? charging
      : shownLit;
  const stageIndex =
    state.phase === "cards" && !state.charging && state.revealed > 0 ? state.revealed - 1 : -1;
  const stagePayload = stageIndex >= 0 ? payloads[stageIndex] : undefined;
  return {
    state,
    reduced,
    lit: shownLit,
    best,
    charging,
    tone,
    stage: stagePayload ? { payload: stagePayload, index: stageIndex } : null,
    remaining: state.phase === "cards" ? payloads.length - state.revealed : payloads.length,
    tap,
    skip,
    face,
    onKeyDown,
  };
}

/** Props of `RevealSequence`: the hook's options and a render function. */
export interface RevealSequenceProps<R extends string, P extends { rarity: R }>
  extends RevealSequenceOptions<R, P> {
  children: (reveal: RevealSequenceApi<R, P>) => ReactNode;
}

/** `useRevealSequence` as a render prop: the game draws the whole reveal from what it is handed. */
export function RevealSequence<R extends string, P extends { rarity: R }>({
  children,
  ...options
}: RevealSequenceProps<R, P>) {
  return children(useRevealSequence(options));
}
