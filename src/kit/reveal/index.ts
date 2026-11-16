// The reveal's mechanism, headless: the sequence's state machine and timing, the rarity ladder's steps, the pity
// ladder, and the director as a hook. Every element and effect is the game's.
export { BIG_STEP, bestOf, ROOM_STEPS, roomStep, rungAtLeast } from "./ladder";
export {
  type Guarantee,
  nearestGuarantee,
  type PityRung,
  pityRungs,
  type ShelfLight,
  shelfLight,
} from "./pity";
export {
  type CardRole,
  cardLayer,
  cardPose,
  cardRole,
  chargeMs,
  FAN,
  initialReveal,
  isTurned,
  nextDelay,
  printKeyOf,
  REVEAL_TIMING,
  type RevealEvent,
  type RevealState,
  reduceReveal,
} from "./sequence";
export {
  type RevealLanding,
  RevealSequence,
  type RevealSequenceApi,
  type RevealSequenceOptions,
  type RevealSequenceProps,
  useRevealSequence,
} from "./useRevealSequence";
