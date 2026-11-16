/**
 * The density governor: of everything a game asks to play, what actually sounds. It is to audio what
 * `createDirector` is to celebrations: pure decisions, no audio, no clock of its own (`now` is handed in, in
 * milliseconds on the audio clock).
 *
 * - Cooldown: a cue played less than its `cooldownMs` after its last sounding play is skipped.
 * - Roll: a cue with `roll` asked for more than `roll.above` times in the last second stops retriggering and becomes
 *   one sustained voice (the engine starts it on the `roll` admission). Its level and pitch follow the rate
 *   ({@link ROLL_DB_PER_DOUBLING}, {@link ROLL_CENTS_PER_DOUBLING}); once the rate has stayed at or under `above`
 *   for {@link ROLL_FALL_MS}, `rolls` reports it ended once and the cue plays singly again. The rate falls when the
 *   last second holds no more than `above` asks, or when the gap since the last ask is longer than `1000 / above`.
 * - Repetition: each sounding play of a cue in the last 4 seconds lowers the next by 1.5 dB, to a floor of -9 dB,
 *   and widens its `vary` (up to twice at the floor). A play counts in full for 2 seconds and fades out of the count
 *   over the next 2, so a cue that stops repeating recovers over 2 seconds.
 * - Loudness window: every sounding voice holds its cue's `loudness` (default 60 dB, plus the play's `db` and the
 *   governor's own) until it ends, then lets go over 1.5 s. The window's top is the loudest held; a play more than
 *   `window` dB under it is skipped.
 * - A full pool: with `voices` voices sounding, a play quieter than every one of them is skipped (it could only
 *   steal from something louder).
 * - `mine`: the player's own plays are never skipped and never rolled, and repetition lowers them 3 dB at most.
 */
import type { Cue, PlayOptions } from "./types";
/** What becomes of one play. */
export type Admission = 
/** It plays, `db` louder or quieter, with its cue's `vary` scaled by `vary`. */
{
    action: "play";
    db: number;
    vary: number;
}
/** It does not sound. */
 | {
    action: "skip";
}
/** It joins its cue's roll: one sustained voice the engine keeps for the cue (`rolls` says how it sounds). */
 | {
    action: "roll";
};
/** A cue's roll: what its one sustained voice should sound like now. */
export interface RollState {
    /** The cue that is rolling. */
    key: string;
    /** dB on the roll's voice. */
    db: number;
    /** A ratio on the roll's rate. */
    rate: number;
    /** The rate fell: the engine releases the voice and the cue plays singly again. */
    ended: boolean;
}
export interface Governor {
    /**
     * Decides one play. `now` is milliseconds on the audio clock; `seconds` is how long the cue sounds, so the
     * governor knows what is still ringing.
     */
    admit(key: string, cue: Cue, options: PlayOptions, now: number, seconds: number): Admission;
    /** Every roll in progress, and each that ended since the last call. The engine asks every 50 ms while any runs. */
    rolls(now: number): readonly RollState[];
}
/** The span a cue's rate is counted over, ms. */
export declare const RATE_MS = 1000;
/** How long a roll's rate must stay down before the roll ends, ms. */
export declare const ROLL_FALL_MS = 300;
/** dB on a roll's voice per doubling of its rate since it began (and as much down per halving). */
export declare const ROLL_DB_PER_DOUBLING = 3;
/** Cents on a roll's voice per doubling of its rate since it began. */
export declare const ROLL_CENTS_PER_DOUBLING = 200;
/** Repetition: dB a play, the floor, how long a play counts in full and how long it takes to fade, ms. */
export declare const REPEAT_DB = 1.5;
export declare const REPEAT_FLOOR_DB = 9;
export declare const REPEAT_MINE_FLOOR_DB = 3;
/** The default loudness of a cue, dB, and how long a voice's loudness takes to let go after it ends, ms. */
export declare const DEFAULT_LOUDNESS = 60;
export declare const LOUDNESS_RELEASE_MS = 1500;
/** A governor for a sound with `voices` voices. `window` is the loudness window in dB (default 40). */
export declare function createGovernor(options: {
    voices: number;
    window?: number;
}): Governor;
