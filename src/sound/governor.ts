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
  | { action: "play"; db: number; vary: number }
  /** It does not sound. */
  | { action: "skip" }
  /** It joins its cue's roll: one sustained voice the engine keeps for the cue (`rolls` says how it sounds). */
  | { action: "roll" };

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
export const RATE_MS = 1000;
/** How long a roll's rate must stay down before the roll ends, ms. */
export const ROLL_FALL_MS = 300;
/** dB on a roll's voice per doubling of its rate since it began (and as much down per halving). */
export const ROLL_DB_PER_DOUBLING = 3;
/** Cents on a roll's voice per doubling of its rate since it began. */
export const ROLL_CENTS_PER_DOUBLING = 200;
/** How far a roll's voice moves from where it began: dB down, dB up, and cents either way. */
const ROLL_DB_RANGE = [-12, 6] as const;
const ROLL_CENTS_RANGE = 700;
/** Repetition: dB a play, the floor, how long a play counts in full and how long it takes to fade, ms. */
export const REPEAT_DB = 1.5;
export const REPEAT_FLOOR_DB = 9;
export const REPEAT_MINE_FLOOR_DB = 3;
const REPEAT_HOLD_MS = 2000;
const REPEAT_FADE_MS = 2000;
/** The default loudness of a cue, dB, and how long a voice's loudness takes to let go after it ends, ms. */
export const DEFAULT_LOUDNESS = 60;
export const LOUDNESS_RELEASE_MS = 1500;
/** The most asks, plays and held voices kept: enough for any rule to saturate, so a flood costs no more. */
const KEEP = 512;

/** A voice the loudness window holds: how loud, and when it stops sounding (ms on the audio clock). */
interface Held {
  loudness: number;
  end: number;
}

interface Roll {
  /** The cue's `roll.above` when it was last asked for. */
  above: number;
  /** The rate when it began: its level and pitch are relative to this. */
  from: number;
  /** When the rate was first seen down by the count (the gap is measured from the last ask), or null. */
  down: number | null;
  /** It ended and `rolls` has not said so yet. */
  ended: boolean;
  /** The roll's voice in the loudness window. */
  held: Held;
}

interface CueRecord {
  /** Every ask in the last second, oldest first. */
  asks: number[];
  /** Every sounding play in the last 4 seconds, oldest first. */
  plays: number[];
  /** When it last sounded, or -Infinity. */
  last: number;
  roll: Roll | null;
}

const finite = (n: number | undefined, fallback: number): number =>
  n !== undefined && Number.isFinite(n) ? n : fallback;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Appends `t`, dropping what is older than `span` before it and the oldest past {@link KEEP}. */
function push(list: number[], t: number, span: number): void {
  prune(list, t, span);
  list.push(t);
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
}

function prune(list: number[], now: number, span: number): void {
  let drop = 0;
  while (drop < list.length && (list[drop] as number) <= now - span) drop++;
  if (drop) list.splice(0, drop);
}

/** A governor for a sound with `voices` voices. `window` is the loudness window in dB (default 40). */
export function createGovernor(options: { voices: number; window?: number }): Governor {
  const voices = Math.max(1, Math.floor(finite(options.voices, 64)));
  const window = Math.max(0, finite(options.window, 40));
  const cues = new Map<string, CueRecord>();
  let held: Held[] = [];
  let latest = -Infinity;

  /** A clock that runs backwards is a new clock (a new context): nothing remembered still holds. */
  function clock(now: number): void {
    if (now < latest) {
      cues.clear();
      held = [];
    }
    latest = now;
  }

  function record(key: string): CueRecord {
    let entry = cues.get(key);
    if (!entry) {
      entry = { asks: [], plays: [], last: -Infinity, roll: null };
      cues.set(key, entry);
    }
    return entry;
  }

  /** What a held voice still weighs at `now`: its loudness while it sounds, falling `window` dB as it lets go. */
  function weight(voice: Held, now: number): number {
    if (now <= voice.end) return voice.loudness;
    const gone = (now - voice.end) / LOUDNESS_RELEASE_MS;
    return gone >= 1 ? -Infinity : voice.loudness - window * gone;
  }

  function top(now: number): number {
    held = held.filter((voice) => now - voice.end < LOUDNESS_RELEASE_MS);
    let loudest = -Infinity;
    for (const voice of held) loudest = Math.max(loudest, weight(voice, now));
    return loudest;
  }

  function hold(loudness: number, end: number): Held {
    const voice = { loudness, end };
    held.push(voice);
    if (held.length > KEEP) {
      // The voice that lets go soonest gives way.
      let soonest = 0;
      for (let i = 1; i < held.length; i++) {
        if ((held[i] as Held).end < (held[soonest] as Held).end) soonest = i;
      }
      held.splice(soonest, 1);
    }
    return voice;
  }

  /** dB the repetition rule takes off the next play of a cue at `now`. */
  function repetition(entry: CueRecord, now: number): number {
    prune(entry.plays, now, REPEAT_HOLD_MS + REPEAT_FADE_MS);
    let count = 0;
    for (const t of entry.plays) {
      const age = now - t;
      count += age <= REPEAT_HOLD_MS ? 1 : Math.max(0, 1 - (age - REPEAT_HOLD_MS) / REPEAT_FADE_MS);
    }
    return Math.min(REPEAT_FLOOR_DB, REPEAT_DB * count);
  }

  /** The rate of a cue at `now`, asks a second: the last second's count, held down by the gap since the last ask. */
  function rateAt(entry: CueRecord, now: number): number {
    prune(entry.asks, now, RATE_MS);
    const count = entry.asks.length;
    const lastAsk = entry.asks[entry.asks.length - 1];
    if (lastAsk === undefined) return 0;
    const gap = now - lastAsk;
    return gap > 0 ? Math.min(count, RATE_MS / gap) : count;
  }

  /** Moves a roll's fall on and says whether it has ended at `now`. */
  function settle(entry: CueRecord, roll: Roll, now: number): boolean {
    if (roll.ended) return true;
    const { above } = roll;
    prune(entry.asks, now, RATE_MS);
    if (entry.asks.length <= above) roll.down ??= now;
    else roll.down = null;
    const lastAsk = entry.asks[entry.asks.length - 1] ?? -Infinity;
    const byGap = above > 0 ? lastAsk + RATE_MS / above : lastAsk;
    const down = Math.min(roll.down ?? Infinity, byGap);
    if (now - down >= ROLL_FALL_MS) {
      roll.ended = true;
      roll.held.end = Math.min(roll.held.end, now);
    }
    return roll.ended;
  }

  function play(entry: CueRecord, cue: Cue, options: PlayOptions, now: number, seconds: number): Admission {
    const cut = Math.min(repetition(entry, now), options.mine ? REPEAT_MINE_FLOOR_DB : REPEAT_FLOOR_DB);
    const db = cut > 0 ? -cut : 0;
    push(entry.plays, now, REPEAT_HOLD_MS + REPEAT_FADE_MS);
    entry.last = now;
    hold(finite(cue.loudness, DEFAULT_LOUDNESS) + finite(options.db, 0) + db, now + seconds * 1000);
    return { action: "play", db, vary: 1 + cut / REPEAT_FLOOR_DB };
  }

  return {
    admit(key, cue, options, now, seconds) {
      clock(now);
      const span = Math.max(0, finite(seconds, 0));
      const entry = record(key);
      push(entry.asks, now, RATE_MS);
      const loudness = finite(cue.loudness, DEFAULT_LOUDNESS) + finite(options.db, 0);

      // The roll: a cue asked for faster than `above` becomes one sustained voice.
      const above = cue.roll ? Math.max(0, finite(cue.roll.above, Infinity)) : Infinity;
      const roll = entry.roll;
      if (roll) roll.above = above;
      if (roll && settle(entry, roll, now) && entry.asks.length > above) {
        // It ended but the engine has not heard yet, and the rate is back up: it carries on.
        roll.ended = false;
        roll.down = null;
      }
      if (options.mine) return play(entry, cue, options, now, span);
      if (entry.roll && !entry.roll.ended) {
        entry.roll.held.end = Math.max(entry.roll.held.end, now + span * 1000);
        return { action: "roll" };
      }
      if (entry.asks.length > above && !entry.roll) {
        const voice = hold(loudness, now + Math.max(span * 1000, ROLL_FALL_MS));
        entry.roll = { above, from: entry.asks.length, down: null, ended: false, held: voice };
        return { action: "roll" };
      }

      const cooldown = Math.max(0, finite(cue.cooldownMs, 0));
      if (cooldown > 0 && now - entry.last < cooldown) return { action: "skip" };

      const loudest = top(now);
      if (loudness < loudest - window) return { action: "skip" };
      const sounding = held.filter((voice) => voice.end > now);
      if (sounding.length >= voices && sounding.every((voice) => loudness < voice.loudness)) {
        return { action: "skip" };
      }
      return play(entry, cue, options, now, span);
    },

    rolls(now) {
      clock(now);
      const out: RollState[] = [];
      for (const [key, entry] of cues) {
        const roll = entry.roll;
        if (!roll) continue;
        if (settle(entry, roll, now)) {
          out.push({ key, db: 0, rate: 1, ended: true });
          entry.roll = null;
          continue;
        }
        const ratio = Math.max(rateAt(entry, now), 1) / Math.max(roll.from, 1);
        const doublings = Math.log2(ratio);
        out.push({
          key,
          db: clamp(ROLL_DB_PER_DOUBLING * doublings, ROLL_DB_RANGE[0], ROLL_DB_RANGE[1]),
          rate: 2 ** (clamp(ROLL_CENTS_PER_DOUBLING * doublings, -ROLL_CENTS_RANGE, ROLL_CENTS_RANGE) / 1200),
          ended: false,
        });
      }
      return out;
    },
  };
}
