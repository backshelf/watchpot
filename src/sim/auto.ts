import type { AnyMove, Decimal, FeatureSpec, Move } from "../core";
import { planDay, type Rng, type Schedule } from "./schedule";
import type { SimWorld } from "./world";

/**
 * The auto-player: plays any game from its features' `moves`, with no persona written for it. At each look it buys
 * the move of the best value per share of its currency held, again and again while one is affordable, then takes
 * every free move (a claim, an open), and goes round again while either did anything.
 */

/** What the auto-player reads of a game: its features (a `Game` is one). */
export interface Playable {
  readonly features: readonly FeatureSpec[];
}

/** Every feature's moves now, in the game's feature order. */
export function movesOf<S extends object>(game: Playable, state: S): Move<S>[] {
  const out: Move<S>[] = [];
  for (const f of game.features) {
    const read = f.moves as ((state: S) => readonly AnyMove[]) | undefined;
    if (read) out.push(...(read(state) as readonly Move<S>[]));
  }
  return out;
}

/** Options for `autoPlayer`: how to read a balance by currency, and the most moves one look may make. */
export interface AutoPlayerOptions<S> {
  /** What the state holds of a currency a move's cost names: the auto-player buys only what this covers. */
  balance(state: S, currency: string): Decimal;
  /** The most moves one look makes, against a move that never stops going through. Default 1,000. */
  maxMoves?: number;
}

/** What a look did: purchases and free moves taken. */
export interface LookResult {
  bought: number;
  free: number;
}

/** A store whose state the auto-player reads (the game's state `S`); a move's `apply` gets it whole. */
export interface AutoStore<S> {
  getState(): S;
}

/**
 * The auto-player for a game: `look(store)` plays one look. A purchase's worth is its `value` over the
 * share of its currency it spends (`amount / balance`), so a gem and a gold purchase compare; ties go to the first
 * declared. A move whose `apply` refuses is not tried again in the look; one valued at or below 0 is never taken.
 */
export function autoPlayer<S extends object>(
  game: Playable,
  { balance, maxMoves = 1_000 }: AutoPlayerOptions<S>,
): { look(store: AutoStore<S>): LookResult } {
  return {
    look(store) {
      const refused = new Set<string>();
      const done: LookResult = { bought: 0, free: 0 };
      const total = () => done.bought + done.free;
      const take = (move: Move<S>): boolean => {
        const ok = move.apply(store as never);
        if (ok) return true;
        refused.add(move.id);
        return false;
      };
      for (let round = true; round && total() < maxMoves; ) {
        round = false;
        // Purchases: the best affordable, re-read after each, while one is.
        while (total() < maxMoves) {
          const state: S = store.getState();
          let best: { move: Move<S>; score: number } | null = null;
          for (const move of movesOf(game, state)) {
            if (!move.cost || move.cost.amount.lte(0) || refused.has(move.id)) continue;
            const held = balance(state, move.cost.currency);
            if (held.lt(move.cost.amount)) continue;
            const worth = move.value(state);
            if (!(worth > 0)) continue;
            const score = worth / move.cost.amount.div(held).toNumber();
            if (!best || score > best.score) best = { move, score };
          }
          if (!best) break;
          if (take(best.move)) {
            done.bought++;
            round = true;
          }
        }
        // Free moves: every one worth taking, best first, until none goes through.
        while (total() < maxMoves) {
          const state: S = store.getState();
          const free = movesOf(game, state)
            .filter((m) => (!m.cost || m.cost.amount.lte(0)) && !refused.has(m.id))
            .map((move) => ({ move, worth: move.value(state) }))
            .filter((m) => m.worth > 0)
            .sort((a, b) => b.worth - a.worth);
          const next = free[0];
          if (!next) break;
          if (take(next.move)) {
            done.free++;
            round = true;
          }
        }
      }
      return done;
    },
  };
}

/** One look's place in the days: its day, its session (from 0, across the run), its index in the session. */
export interface LookAt {
  day: number;
  session: number;
  look: number;
  /** The schedule's keypresses at this look. */
  presses: number;
}

/** Options for `playDays`: the world, the schedule, how many days, the rng and the look and day-end callbacks. */
export interface PlayDaysOptions<W extends SimWorld> {
  world: W;
  schedule: Schedule;
  days: number;
  /** The first morning (epoch ms): day `d` starts `d` days after it. */
  start: number;
  /** The behaviour stream the days are planned from. */
  rng: Rng;
  /** One look at the game. */
  look(at: LookAt): void;
  /** After a look and the play to the next (a sampler's `look`). */
  afterLook?(): void;
  /** The close of a day played (from 1); a skipped day has none. */
  dayEnd?(day: number): void;
}

/**
 * Days of play on a schedule (`planDay`): before each session the gap is a closed tab (`away`) or, when the session
 * before left it open, play in the background; a session is looks at its cadence, the time between them played,
 * until its attended time runs out.
 */
export function playDays<W extends SimWorld>({
  world,
  schedule,
  days,
  start,
  rng,
  look,
  afterLook,
  dayEnd,
}: PlayDaysOptions<W>): void {
  let session = -1;
  let tabOpen = false;
  for (let day = 0; day < days; day++) {
    const dayStart = start + day * 86_400_000;
    const plan = planDay(rng, schedule, day, new Date(dayStart).getUTCDay(), dayStart);
    for (const planned of plan) {
      const gap = planned.startMs - world.now();
      if (gap > 0) {
        if (tabOpen) world.play(gap);
        else world.away(gap);
      }
      tabOpen = planned.tabOpenAfter;
      session++;
      const end = world.now() + planned.attendMs;
      for (let i = 0; world.now() < end; i++) {
        look({ day, session, look: i, presses: planned.pressesAt(i) });
        world.play(Math.min(planned.lookEveryMs, end - world.now()));
        afterLook?.();
      }
    }
    if (plan.length > 0) dayEnd?.(day + 1);
  }
}
