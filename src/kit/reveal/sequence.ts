import type { RarityTier } from "../fx/rarity";
import { BIG_STEP, ROOM_STEPS, roomStep } from "./ladder";

/**
 * The reveal as a state machine. Pure: the host dispatches `tap`, `timer` and `skip`, reads the next delay from
 * `nextDelay`, and draws each pull by `cardRole`. It knows no rarity: each pull carries only how long it charges the
 * room before it turns (`chargeMs`, 0 for one that turns at once). Tested in test/kit/reveal/sequence.test.ts.
 *
 * chest    the closed box on black, the light gathering
 * opening  the lid lifts
 * cards    the fan of backs; `revealed` pulls have been turned and the last of them holds the centre until the
 *          player advances; a big one first lifts face down while the room charges (`charging`)
 * summary  every pull on the shelf and the lot of what came out
 */
type RevealPhase = "chest" | "opening" | "cards" | "summary";

/** The sequence's state: phase, cards turned, whether the next is charging, and the charge times. */
export interface RevealState {
  phase: RevealPhase;
  total: number;
  /** Cards turned so far. In the cards phase, card `revealed - 1` is on the stage and the rest wait as backs. */
  revealed: number;
  /** Card `revealed` is lifted face down on the stage while the room takes its colour; the next step turns it. */
  charging: boolean;
  /** How long each card charges the room before it turns, ms by index; 0 for one that turns at once. */
  charges: readonly number[];
  /** Reduced motion: no fan, no turn, no shake; every step a fade. */
  reduced: boolean;
  /**
   * Faces that have shown: the turn has carried card `printed - 1` past edge-on (`face`). Behind `revealed` for
   * the moment a turn takes to show its face; a skip shows the rest whole and never moves it.
   */
  printed: number;
}

/** An event the reveal's reducer takes: a tap, a timer landing, skip, a face turned into view, or reset. */
export type RevealEvent =
  | { type: "tap" }
  | { type: "timer" }
  | { type: "skip" }
  /** Card `index`'s face has turned into view. */
  | { type: "face"; index: number }
  | { type: "reset"; charges: readonly number[]; reduced: boolean; gift?: boolean };

/** Milliseconds. The holds are the player's: a turned card waits for a tap, however long. */
export const REVEAL_TIMING = {
  /** The chest sits on black before the lid moves. */
  chestHold: 900,
  /** The lid's --dur-reveal plus a beat of light. */
  lidOpen: 1000,
  /** The fan deals out before the first card lifts on its own. */
  deal: 900,
  /** The held beat before a big card turns: the room takes its colour, then the face; the top rung's longer. */
  charge: { big: 1000, top: 1500 },
  /** Every pre-card step under reduced motion, the charge included. */
  reducedStep: 600,
  /** The card's turn, for the effects that land when the face shows. */
  turn: 600,
} as const;

/** How long a rung's face charges the room before it turns, ms: the big steps only, the top the longest; else 0. */
export function chargeMs(tier: RarityTier): number {
  const step = roomStep(tier);
  if (step >= ROOM_STEPS - 1) return REVEAL_TIMING.charge.top;
  return step >= BIG_STEP ? REVEAL_TIMING.charge.big : 0;
}

/** A gift (a card that arrived as a reward) has no chest: it starts with the backs dealt. */
export function initialReveal(charges: readonly number[], reduced: boolean, gift = false): RevealState {
  return {
    phase: gift ? "cards" : "chest",
    total: charges.length,
    revealed: 0,
    charging: false,
    charges,
    reduced,
    printed: 0,
  };
}

function advance(state: RevealState): RevealState {
  switch (state.phase) {
    case "chest":
      return { ...state, phase: "opening" };
    case "opening":
      return { ...state, phase: "cards", revealed: 0, charging: false };
    case "cards":
      // The charged card turns.
      if (state.charging) return { ...state, charging: false, revealed: state.revealed + 1 };
      // The last card has been seen: the closing lot.
      if (state.revealed >= state.total) return { ...state, phase: "summary" };
      // The next card: a big one lifts face down and the room charges first; the rest turn as they lift.
      if ((state.charges[state.revealed] ?? 0) > 0) return { ...state, charging: true };
      return { ...state, revealed: state.revealed + 1 };
    case "summary":
      return state;
  }
}

/** The reveal sequence's pure reducer. */
export function reduceReveal(state: RevealState, event: RevealEvent): RevealState {
  switch (event.type) {
    case "reset":
      return initialReveal(event.charges, event.reduced, event.gift);
    case "skip":
      return state.phase === "summary"
        ? state
        : { ...state, phase: "summary", revealed: state.total, charging: false };
    case "tap":
    case "timer":
      return advance(state);
    case "face":
      // Only the turning card's face, once: a late or stale event (a skip, a reset) changes nothing.
      return state.phase === "cards" && event.index === state.revealed - 1 && state.printed < state.revealed
        ? { ...state, printed: state.revealed }
        : state;
  }
}

/**
 * Card `index`'s print key: it changes once, when its face turns into view, so the renderer's print-in starts as
 * the face appears. A card skipped to the summary keeps its first key and shows whole.
 */
export function printKeyOf(state: RevealState, index: number): number {
  return index < state.printed ? 1 : 0;
}

/**
 * Milliseconds until the sequence moves on by itself; null when it waits for the player: a turned card holds the
 * centre until the next tap, and so does the closing lot.
 */
export function nextDelay(state: RevealState): number | null {
  const step = state.reduced ? REVEAL_TIMING.reducedStep : null;
  switch (state.phase) {
    case "chest":
      return step ?? REVEAL_TIMING.chestHold;
    case "opening":
      return step ?? REVEAL_TIMING.lidOpen;
    case "cards": {
      if (state.charging) return step ?? state.charges[state.revealed] ?? 0;
      if (state.revealed === 0) return step ?? REVEAL_TIMING.deal;
      return null;
    }
    case "summary":
      return null;
  }
}

/** Where a card sits in a reveal: `deck`, `stage` or `shelf`. */
export type CardRole = "deck" | "stage" | "shelf";

/** The first card still in the deck: after the stage card, which is turned or charging. */
function deckStart(state: RevealState): number {
  if (state.phase !== "cards") return 0;
  return state.charging ? state.revealed + 1 : state.revealed;
}

/** Where card `index` sits for a state: waiting as a back, on the stage (turned, or charging face down), or filed on the shelf. */
export function cardRole(state: RevealState, index: number): CardRole {
  if (state.phase === "summary") return "shelf";
  if (state.phase !== "cards") return "deck";
  const stage = state.charging ? state.revealed : state.revealed - 1;
  if (index < stage) return "shelf";
  if (index === stage) return "stage";
  return "deck";
}

/** True once card `index` has been turned face up. A charging card is on the stage but not yet turned. */
export function isTurned(state: RevealState, index: number): boolean {
  return state.phase === "summary" || (state.phase === "cards" && index < state.revealed);
}

interface CardPose {
  x: number;
  y: number;
  /** The card's size as a share of the 240px card: the component draws it at that width, never scaled. */
  scale: number;
  rotate: number;
}

/** The fan: the backs spread like a hand, pivoting about a point well below the stage. */
export const FAN = {
  stepDeg: 5,
  radius: 300,
  deckY: 182,
  deckScale: 0.55,
  stageY: -34,
  shelfY: -300,
  shelfStep: 32,
  shelfScale: 0.22,
} as const;

/**
 * Paint order: the stage card over everything, the shelf in order, and the fan overlapping from its centre
 * outwards like a hand held from below.
 */
export function cardLayer(state: RevealState, index: number): number {
  const role = cardRole(state, index);
  if (role === "stage") return 300;
  if (role === "shelf") return 200 + index;
  const first = deckStart(state);
  const remaining = state.total - first;
  const j = index - first;
  return 100 - Math.round(Math.abs(j - (remaining - 1) / 2) * 2);
}

/** The pose of card `index` in the stage's coordinate space (pixels from the stage's centre). */
export function cardPose(state: RevealState, index: number): CardPose {
  const role = cardRole(state, index);
  if (role === "stage") return { x: 0, y: FAN.stageY, scale: 1, rotate: 0 };
  if (role === "shelf") {
    const onShelf =
      state.phase === "summary" ? state.total : state.charging ? state.revealed : state.revealed - 1;
    const x = (index - (onShelf - 1) / 2) * FAN.shelfStep;
    return { x, y: FAN.shelfY, scale: FAN.shelfScale, rotate: 0 };
  }
  const first = deckStart(state);
  const remaining = state.total - first;
  const j = index - first;
  if (state.reduced) return { x: 0, y: FAN.deckY, scale: FAN.deckScale, rotate: 0 };
  const a = (j - (remaining - 1) / 2) * FAN.stepDeg;
  const r = (a * Math.PI) / 180;
  return {
    x: Math.sin(r) * FAN.radius,
    y: FAN.deckY + (1 - Math.cos(r)) * FAN.radius,
    scale: FAN.deckScale,
    rotate: a,
  };
}
