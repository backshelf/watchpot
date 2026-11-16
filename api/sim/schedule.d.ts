/**
 * When a simulated player is at the game: a day as a list of sessions. A session is a run of looks a minute or two
 * apart; between sessions the tab is closed (`world.away`) or left open behind something else (`world.play`). The
 * session-shaped personas draw their days from a seeded behaviour RNG (`rngFor`), so a run stays reproducible and
 * another seed varies the behaviour as well as the cards. `fixedSchedule` is the old day (the tab open from the wake
 * hour to the sleep hour, a look every N minutes, the same presses at each): one session a day, no draws.
 */
/** Uniform between `min` and `max`. */
export interface Range {
    min: number;
    max: number;
}
/** Log-normal around `median` (`spread` is sigma), clamped to `min` and `max`. */
export interface LogNormal {
    median: number;
    spread: number;
    min: number;
    max: number;
}
/** The old day: the tab open from `wakeHour` to `sleepHour`, a look every `everyMin`, `presses` at each. */
export interface FixedSchedule {
    kind: "fixed";
    wakeHour: number;
    sleepHour: number;
    everyMin: number;
    presses: number;
}
/** A schedule of sessions a day: wake and sleep hours, session counts and lengths, cadence, skipped days and decay. */
export interface SessionSchedule {
    kind: "sessions";
    /** Jittered per day; the first day's first session opens at the run's start. */
    wakeHour: Range;
    sleepHour: Range;
    /** Day one's sessions; later days scaled by `decay`. */
    sessionsPerDay: Range;
    /** Minutes attended per session; later days scaled by `lengthDecay`. */
    sessionMin: LogNormal;
    /** Minutes between looks inside a session, drawn per session. */
    lookEveryMin: Range;
    /** Chance the tab stays open between two sessions of a day (else closed); always closed overnight. */
    tabLeftOpen: number;
    /** Chance a weekday, or a weekend day, is skipped entirely (never the first day). */
    skipDay: number;
    skipWeekendDay: number;
    /** Multiplier on `sessionsPerDay` by day index; the last value repeats. */
    decay: readonly number[];
    /** Multiplier on `sessionMin` by day index; the last value repeats. */
    lengthDecay: readonly number[];
    /** Keypresses a session, spent in a burst on its first one to three looks. */
    pressesPerSession: Range;
    /** Extra sessions on day one. */
    firstDayBonusSessions: number;
    /** The schedule from day two on (the binger becomes a checker); its decay still reads the day's index. */
    afterDayOne?: SessionSchedule;
}
/** When the tab is open: a `FixedSchedule` or a `SessionSchedule`. */
export type Schedule = FixedSchedule | SessionSchedule;
/** One session: when it opens, how long it is attended, its look cadence and its presses by look. */
export interface Session {
    startMs: number;
    attendMs: number;
    lookEveryMs: number;
    /** Keypresses at the session's look `i` (0 past the burst). */
    pressesAt: (look: number) => number;
    /** The tab stays open after the session, until the next one; false: closed. */
    tabOpenAfter: boolean;
}
/** A function returning a float in [0, 1), the sim's seeded behaviour stream. */
export type Rng = () => number;
/** A small seeded PRNG (mulberry32): floats in [0, 1). */
export declare function mulberry32(seed: number): Rng;
/** The behaviour RNG for one persona on one seed: `${seed}:${personaId}` hashed (FNV-1a) into `mulberry32`. */
export declare function rngFor(seed: string, personaId: string): Rng;
/** Draws a number uniformly from a `{ min, max }` range with `rng`. */
export declare const drawRange: (rng: Rng, r: Range) => number;
/** A log-normal draw (Box-Muller), clamped. */
export declare function drawLogNormal(rng: Rng, d: LogNormal): number;
/** A schedule with one session a day, awake from `wakeHour` to `sleepHour`, a look every `everyMin` minutes and `presses` keypresses per look. */
export declare function fixedSchedule(wakeHour: number, sleepHour: number, everyMin: number, presses: number): FixedSchedule;
/**
 * A player who no-lifes the game: at it around the clock, a look every `lookEverySec` seconds and `presses` keypresses
 * at each, so every hour of the run is a played hour. Pacing is planned and measured on this: nobody starts an idle
 * game and goes idle, and "a page a day" means a day of played content, not a day of waiting.
 */
export declare function activeSchedule(lookEverySec?: number, presses?: number): FixedSchedule;
/** The hour the run's first morning opens at: the fixed wake hour, or the middle of the session range. */
export declare const nominalWakeHour: (s: Schedule) => number;
/**
 * Day `day`'s sessions. `dayStart` is the day's nominal wake time (the run's start plus whole days); `weekday` is 0
 * for Sunday. A fixed schedule is one session from the wake hour to the sleep hour, the tab closed after; a session
 * schedule draws its count, lengths, cadences and bursts, spreads the sessions over the waking day (one to an equal
 * slot of it, started at random inside the slot) and returns none on a skipped day.
 */
export declare function planDay(rng: Rng, schedule: Schedule, day: number, weekday: number, dayStart: number): Session[];
