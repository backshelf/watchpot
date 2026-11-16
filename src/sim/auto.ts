import { type AnyMove, type Decimal, type FeatureSpec, type Move, type StateOf, ZERO } from "../core";
import { planDay, type Rng, type Schedule } from "./schedule";
import type { SimWorld } from "./world";

/**
 * The auto-player: plays any game from its features' `moves`, with no persona written for it. At each look it buys
 * the move of the best worth per share of its currency held, again and again while one is affordable, then takes
 * each free move (a claim, an open) once, and goes round again while either did anything.
 *
 * What a purchase is worth is worked out where it can be: the game names one `objective` (what the player is
 * trying to grow, usually income a second), and a purchase's worth is the objective after buying it less the
 * objective before, tried on the state and put back. A move that does not move the objective at once (an unlock,
 * an offline cap, a reset) comes to nothing that way, and says its own `worth`.
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

/** Options for `autoPlayer`: the objective, how to read a balance by currency, and the limits of one look. */
export interface AutoPlayerOptions<S> {
  /**
   * What the player is trying to grow, read off the state: usually income a second. With it, a move that states
   * no `worth` is worth what buying it adds to this. Without it, every move must state its `worth` (the first one
   * that does not is named in the error).
   */
  objective?(state: S): number;
  /**
   * What the state holds of a currency a move's cost names: the auto-player buys only what this covers. Default,
   * when the game has exactly one `currencies` feature, its balance of that currency; otherwise required.
   */
  balance?(state: S, currency: string): Decimal;
  /** The most moves one look makes, against a purchase that never stops going through. Default 1,000. */
  maxMoves?: number;
  /**
   * How many looks a worked-out worth is kept for while nothing is bought (default 10). Every purchase and free
   * move drops what was kept; 1 works each one out afresh at every look.
   */
  worthLooks?: number;
  /** Silences the warning for features that look purchasable and declare no moves. */
  quiet?: boolean;
  /** What an earlier auto-player remembered (`remember()`, kept in a snapshot): this one carries on from it. */
  memory?: AutoPlayerMemory;
}

/**
 * What an auto-player carries between looks: the worths it worked out and keeps, how many looks they are kept for
 * yet, which moves' worked-out worth ever came above nothing, and whether it has warned. Plain data, kept in a
 * snapshot, so a run resumed from one buys what the run that took it would have.
 */
export interface AutoPlayerMemory {
  readonly kept: readonly (readonly [string, number])[];
  readonly keptFor: number;
  readonly worked: readonly (readonly [string, boolean])[];
  readonly warned: boolean;
}

/** The balance reader of a game's one `currencies` feature (`state[key][currency]`); throws on none or several. */
function currencyBalance<S>(game: Playable): (state: S, currency: string) => Decimal {
  const wallets = game.features.filter((f) =>
    Array.isArray((f as { def?: { currencies?: unknown } }).def?.currencies),
  );
  const only = wallets[0];
  if (wallets.length !== 1 || !only)
    throw new Error(
      `autoPlayer: the game has ${wallets.length} currencies features; pass \`balance\` to say which holds what`,
    );
  return (state, currency) =>
    (state as Record<string, Record<string, Decimal | undefined>>)[only.key]?.[currency] ?? ZERO;
}

/** What a look did: purchases and free moves taken. */
export interface LookResult {
  bought: number;
  free: number;
}

/**
 * A store whose state the auto-player reads (the game's state `S`); a move's `apply` gets it whole. `trial`, when
 * the store has one (the plain store does), runs something and puts the state back; without it the auto-player
 * keeps the state it read and sets it back, which a store of immutable states (the real one) allows.
 */
export interface AutoStore<S> {
  getState(): S;
  trial?<T>(run: () => T): T;
}

/** The auto-player `autoPlayer` makes. */
export interface AutoPlayer<S> {
  /** Plays one look. */
  look(store: AutoStore<S>): LookResult;
  /**
   * The moves with no `worth` of their own whose worked-out worth has never come above nothing: the auto-player
   * has never bought them, and each wants a hand-written `worth`. Read it at the end of a run.
   */
  blind(): readonly string[];
  /** What it carries between looks, as plain data: pass it as `memory` to carry on from here. */
  remember(): AutoPlayerMemory;
}

/** Whether a move costs nothing. */
const isFree = <S extends object>(move: Move<S>): boolean => !move.cost || move.cost.amount.lte(0);

/**
 * The auto-player for a game: `look(store)` plays one look. A purchase's score is its worth over the share of its
 * currency it spends (`amount / balance`), so a gem and a gold purchase compare; ties go to the first declared. A
 * move whose `apply` refuses is not tried again in the look; one worth nothing or less is never taken; a free
 * move is taken once a look unless it says `repeat`.
 */
export function autoPlayer<F extends readonly FeatureSpec[]>(
  game: { readonly features: F },
  options?: AutoPlayerOptions<StateOf<F>>,
): AutoPlayer<StateOf<F>>;
export function autoPlayer<S extends object>(game: Playable, options?: AutoPlayerOptions<S>): AutoPlayer<S>;
export function autoPlayer<S extends object>(
  game: Playable,
  {
    balance: given,
    maxMoves = 1_000,
    objective,
    worthLooks = 10,
    quiet = false,
    memory,
  }: AutoPlayerOptions<S> = {},
): AutoPlayer<S> {
  const balance = given ?? currencyBalance<S>(game);
  /** Worked-out worths kept between looks, by move id, and the looks left before they are dropped. */
  const kept = new Map<string, number>(memory?.kept);
  let keptFor = memory?.keptFor ?? 0;
  /** Moves with no `worth` of their own, and whether their worked-out worth has ever been above nothing. */
  const worked = new Map<string, boolean>(memory?.worked);
  let warned = quiet || (memory?.warned ?? false);

  const warnMissing = (state: S): void => {
    warned = true;
    const missing = game.features
      .filter((f) => !f.moves)
      .filter((f) =>
        Object.entries((state as Record<string, object | undefined>)[f.key] ?? {}).some(
          ([name, v]) => typeof v === "function" && /^buy/i.test(name),
        ),
      )
      .map((f) => f.key);
    if (missing.length > 0)
      console.warn(
        `autoPlayer: ${missing.map((k) => `"${k}"`).join(", ")} can be bought from and declare${missing.length === 1 ? "s" : ""} no moves, so the auto-player will never buy there. Give the feature \`moves\` (or \`withMoves\`), or pass \`quiet\`.`,
      );
  };

  const trial = <T>(store: AutoStore<S>, run: () => T): T => {
    if (store.trial) return store.trial(run);
    const before = store.getState();
    try {
      return run();
    } finally {
      (store as unknown as { setState(state: S, replace: true): void }).setState(before, true);
    }
  };

  const worthOf = (store: AutoStore<S>, move: Move<S>, state: S): number => {
    if (move.worth) return move.worth(state);
    if (!objective)
      throw new Error(
        `autoPlayer: the move "${move.id}" states no worth and the auto-player was given no objective. Pass \`objective\` (what the player is trying to grow, read off the state), or give the move a \`worth\`.`,
      );
    const hit = kept.get(move.id);
    if (hit !== undefined) return hit;
    const before = objective(state);
    const gain = trial(store, () => (move.apply(store as never) ? objective(store.getState()) - before : 0));
    kept.set(move.id, gain);
    worked.set(move.id, (worked.get(move.id) ?? false) || gain > 0);
    return gain;
  };

  return {
    blind: () => [...worked].filter(([, seen]) => !seen).map(([id]) => id),
    remember: () => ({ kept: [...kept], keptFor, worked: [...worked], warned }),
    look(store) {
      if (!warned) warnMissing(store.getState());
      if (keptFor <= 0) {
        kept.clear();
        keptFor = worthLooks;
      }
      keptFor -= 1;
      const refused = new Set<string>();
      const taken = new Set<string>();
      const done: LookResult = { bought: 0, free: 0 };
      const total = () => done.bought + done.free;
      const take = (move: Move<S>): boolean => {
        const ok = move.apply(store as never);
        if (ok) {
          kept.clear();
          return true;
        }
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
            if (isFree(move) || !move.cost || refused.has(move.id)) continue;
            const held = balance(state, move.cost.currency);
            if (held.lt(move.cost.amount)) continue;
            const worth = worthOf(store, move, state);
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
        // Free moves: each one worth taking, best first, once a look unless it repeats.
        while (total() < maxMoves) {
          const state: S = store.getState();
          const free = movesOf(game, state)
            .filter((m) => isFree(m) && !refused.has(m.id) && (m.repeat || !taken.has(m.id)))
            .map((move) => ({ move, worth: worthOf(store, move, state) }))
            .filter((m) => m.worth > 0)
            .sort((a, b) => b.worth - a.worth);
          const next = free[0];
          if (!next) break;
          taken.add(next.move.id);
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
  /** Stops the run when true, checked after each look's play (a "when does X first happen" probe). */
  until?(): boolean;
  /** Stops the run once this much sim time has passed since `start` (checked like `until`). */
  hours?: number;
}

/**
 * Days of play on a schedule (`planDay`): before each session the gap is a closed tab (`away`) or, when the session
 * before left it open, play in the background; a session is looks at its cadence, the time between them played,
 * until its attended time runs out. `until` or `hours` stops it early, after the look that crossed it; a day cut
 * short has no `dayEnd`.
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
  until,
  hours,
}: PlayDaysOptions<W>): void {
  const stopAt = hours === undefined ? Number.POSITIVE_INFINITY : start + hours * 3_600_000;
  const stop = (): boolean => world.now() >= stopAt || (until?.() ?? false);
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
        if (stop()) return;
      }
    }
    if (plan.length > 0) dayEnd?.(day + 1);
  }
}
