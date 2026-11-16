import type { RarityTier } from "../fx/rarity";
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
export type RevealEvent = {
    type: "tap";
} | {
    type: "timer";
} | {
    type: "skip";
}
/** Card `index`'s face has turned into view. */
 | {
    type: "face";
    index: number;
} | {
    type: "reset";
    charges: readonly number[];
    reduced: boolean;
    gift?: boolean;
};
/** Milliseconds. The holds are the player's: a turned card waits for a tap, however long. */
export declare const REVEAL_TIMING: {
    /** The chest sits on black before the lid moves. */
    readonly chestHold: 900;
    /** The lid's --dur-reveal plus a beat of light. */
    readonly lidOpen: 1000;
    /** The fan deals out before the first card lifts on its own. */
    readonly deal: 900;
    /** The held beat before a big card turns: the room takes its colour, then the face; the top rung's longer. */
    readonly charge: {
        readonly big: 1000;
        readonly top: 1500;
    };
    /** Every pre-card step under reduced motion, the charge included. */
    readonly reducedStep: 600;
    /** The card's turn, for the effects that land when the face shows. */
    readonly turn: 600;
};
/** How long a rung's face charges the room before it turns, ms: the big steps only, the top the longest; else 0. */
export declare function chargeMs(tier: RarityTier): number;
/** A gift (a card that arrived as a reward) has no chest: it starts with the backs dealt. */
export declare function initialReveal(charges: readonly number[], reduced: boolean, gift?: boolean): RevealState;
/** The reveal sequence's pure reducer. */
export declare function reduceReveal(state: RevealState, event: RevealEvent): RevealState;
/**
 * Card `index`'s print key: it changes once, when its face turns into view, so the renderer's print-in starts as
 * the face appears. A card skipped to the summary keeps its first key and shows whole.
 */
export declare function printKeyOf(state: RevealState, index: number): number;
/**
 * Milliseconds until the sequence moves on by itself; null when it waits for the player: a turned card holds the
 * centre until the next tap, and so does the closing lot.
 */
export declare function nextDelay(state: RevealState): number | null;
/** Where a card sits in a reveal: `deck`, `stage` or `shelf`. */
export type CardRole = "deck" | "stage" | "shelf";
/** Where card `index` sits for a state: waiting as a back, on the stage (turned, or charging face down), or filed on the shelf. */
export declare function cardRole(state: RevealState, index: number): CardRole;
/** True once card `index` has been turned face up. A charging card is on the stage but not yet turned. */
export declare function isTurned(state: RevealState, index: number): boolean;
interface CardPose {
    x: number;
    y: number;
    /** The card's size as a share of the 240px card: the component draws it at that width, never scaled. */
    scale: number;
    rotate: number;
}
/** The fan: the backs spread like a hand, pivoting about a point well below the stage. */
export declare const FAN: {
    readonly stepDeg: 5;
    readonly radius: 300;
    readonly deckY: 182;
    readonly deckScale: 0.55;
    readonly stageY: -34;
    readonly shelfY: -300;
    readonly shelfStep: 32;
    readonly shelfScale: 0.22;
};
/**
 * Paint order: the stage card over everything, the shelf in order, and the fan overlapping from its centre
 * outwards like a hand held from below.
 */
export declare function cardLayer(state: RevealState, index: number): number;
/** The pose of card `index` in the stage's coordinate space (pixels from the stage's centre). */
export declare function cardPose(state: RevealState, index: number): CardPose;
export {};
