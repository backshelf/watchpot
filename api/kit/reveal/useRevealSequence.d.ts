import { type KeyboardEvent, type ReactNode } from "react";
import { type RarityTier } from "../fx/rarity";
import { type RevealState } from "./sequence";
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
export interface RevealSequenceOptions<R extends string, P extends {
    rarity: R;
}> {
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
export interface RevealSequenceApi<R extends string, P extends {
    rarity: R;
}> {
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
    stage: {
        payload: P;
        index: number;
    } | null;
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
/** The reveal sequence as a hook: see the module comment. */
export declare function useRevealSequence<R extends string, P extends {
    rarity: R;
}>(options: RevealSequenceOptions<R, P>): RevealSequenceApi<R, P>;
/** Props of `RevealSequence`: the hook's options and a render function. */
export interface RevealSequenceProps<R extends string, P extends {
    rarity: R;
}> extends RevealSequenceOptions<R, P> {
    children: (reveal: RevealSequenceApi<R, P>) => ReactNode;
}
/** `useRevealSequence` as a render prop: the game draws the whole reveal from what it is handed. */
export declare function RevealSequence<R extends string, P extends {
    rarity: R;
}>({ children, ...options }: RevealSequenceProps<R, P>): ReactNode;
