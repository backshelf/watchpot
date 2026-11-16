import type { Draft } from "immer";
import { D, type Decimal, type DecimalSource } from "./decimal";
import { type Feature, type FeatureApi, feature, type ResetRule } from "./feature";
import { pushLine } from "./journal";

/**
 * Achievements: a wall of things a player can do once, laid in rows of a fixed width. Each is earned at most once and
 * kept for good; the count earned and the rows completed make a global multiplier (`power`), and each one, and each
 * completed row, may carry effects for the stat bus. Most are checked by the feature at the end of every pass
 * (`when`), some must hold for a while first (`forMs`), some are only true at a moment and are checked when the game
 * says that moment came (`on` with `notify`), and the rest the game awards itself (`award`).
 *
 * `achievementBoard({ id, list, columns })` is the rules over an earned record; `achievements({ key, list, columns })`
 * is a feature that owns the record and checks the list.
 */

/** One achievement. `G` is the game state its condition reads; `E` is the game's effect type. */
export interface Achievement<G = never, E = never> {
  readonly id: string;
  readonly name: string;
  /** What earns it, in the game's words. */
  readonly line: string;
  /** What it gives, in the game's words. */
  readonly reward?: string;
  /** Active while it is earned. With the stat bus's `Effect`, `contributions` feeds `busOf`. */
  readonly effects?: readonly E[];
  /** Hidden (name, line and reward) until earned. */
  readonly secret?: boolean;
  /** The condition, read off the whole game state. Left out for one the game awards itself. */
  readonly when?: (state: G, now: number) => boolean;
  /** With `when`: how long the condition must hold without a break before it is earned. */
  readonly forMs?: number;
  /** Event names: the condition is checked only when the game calls `notify` with one of them. */
  readonly on?: readonly string[];
}

/** When each achievement was earned, in game time, by id. One absent is not earned. */
export type Earned = Readonly<Record<string, number>>;

/** One place on the wall. */
export interface AchievementTile<G, E> {
  readonly achievement: Achievement<G, E>;
  readonly earned: boolean;
  /** When it was earned, or null. */
  readonly at: number | null;
  /** A secret not yet earned: a screen shows a blank tile. */
  readonly hidden: boolean;
}

/** One row of the wall: its index from 0 and its tiles; `complete` once every tile in it is earned. */
export interface AchievementRow<G, E> {
  readonly index: number;
  readonly tiles: readonly AchievementTile<G, E>[];
  readonly complete: boolean;
}

/** The global multiplier's bases: `each` per achievement earned, `row` per row complete (default 1). */
export interface AchievementPower {
  readonly each: DecimalSource;
  readonly row?: DecimalSource;
}

/** The definition `achievementBoard` takes. */
export interface AchievementBoardDef<G, E> {
  /** The source prefix on the stat bus: `<id>:<achievement>`, and `<id>:row:<index>` for a row. */
  readonly id: string;
  readonly list: readonly Achievement<G, E>[];
  /** How many achievements one row holds. */
  readonly columns: number;
  /** What a completed row gives, beside its achievements' own effects. */
  readonly rowEffects?: (row: AchievementRow<G, E>) => readonly NoInfer<E>[];
}

/** A wall of achievements' rules, over an earned record the game keeps wherever it saves it. */
export interface AchievementBoard<G, E> {
  readonly id: string;
  readonly list: readonly Achievement<G, E>[];
  readonly columns: number;
  achievement(id: string): Achievement<G, E> | undefined;
  /** The wall as rows of tiles, in list order. A short last row is complete once all of it is earned. */
  rows(earned: Earned): AchievementRow<G, E>[];
  /** How many of the list are earned (an id the list no longer holds is not counted). */
  count(earned: Earned): number;
  rowsComplete(earned: Earned): number;
  /** Every earned achievement's effects, sourced `<id>:<achievement>`, then every complete row's, `<id>:row:<index>`. */
  contributions(earned: Earned): { source: string; effect: E }[];
  /** The global multiplier: `each ^ count × row ^ rowsComplete`. */
  power(earned: Earned, bases: AchievementPower): Decimal;
}

/** The rules of a wall of achievements. Throws on a repeated id or a width below one. */
export function achievementBoard<G, E>(def: AchievementBoardDef<G, E>): AchievementBoard<G, E> {
  const columns = Math.floor(def.columns);
  if (!(columns >= 1)) throw new Error(`achievements "${def.id}": a row must hold at least one`);
  const byId = new Map<string, Achievement<G, E>>();
  for (const a of def.list) {
    if (byId.has(a.id)) throw new Error(`achievements "${def.id}": the id "${a.id}" appears twice`);
    byId.set(a.id, a);
  }

  const rows = (earned: Earned): AchievementRow<G, E>[] => {
    const out: AchievementRow<G, E>[] = [];
    for (let start = 0; start < def.list.length; start += columns) {
      const tiles = def.list.slice(start, start + columns).map((achievement): AchievementTile<G, E> => {
        const at = earned[achievement.id];
        const has = at !== undefined;
        return { achievement, earned: has, at: has ? at : null, hidden: !has && achievement.secret === true };
      });
      out.push({ index: out.length, tiles, complete: tiles.every((t) => t.earned) });
    }
    return out;
  };
  const count = (earned: Earned) => def.list.filter((a) => earned[a.id] !== undefined).length;
  const rowsComplete = (earned: Earned) => rows(earned).filter((r) => r.complete).length;

  return {
    id: def.id,
    list: def.list,
    columns,
    achievement: (id) => byId.get(id),
    rows,
    count,
    rowsComplete,
    contributions: (earned) => {
      const out: { source: string; effect: E }[] = [];
      for (const a of def.list)
        if (earned[a.id] !== undefined)
          for (const effect of a.effects ?? []) out.push({ source: `${def.id}:${a.id}`, effect });
      if (def.rowEffects)
        for (const row of rows(earned))
          if (row.complete)
            for (const effect of def.rowEffects(row))
              out.push({ source: `${def.id}:row:${row.index}`, effect });
      return out;
    },
    power: (earned, bases) =>
      D(bases.each)
        .pow(count(earned))
        .mul(D(bases.row ?? 1).pow(rowsComplete(earned))),
  };
}

/** The achievements feature's saved state. */
export interface AchievementsState {
  /** When each was earned, in game time, by id. */
  earned: Record<string, number>;
  /** Earned and not yet acknowledged, oldest first: what a toast shows. Capped. */
  fresh: string[];
  /** When each `forMs` condition started holding, by id: its timer. */
  holding: Record<string, number>;
}

/** The achievements feature's actions. */
export interface AchievementsActions {
  /** Earns one at game time now. False when it is unknown or already earned. */
  award(id: string): boolean;
  /** Checks the achievements listening for `event`. Returns the ids it earned. */
  notify(event: string): string[];
  /** Clears `ids` (default: all) from `fresh`. */
  acknowledge(ids?: readonly string[]): void;
}

/** An `achievements` feature, carrying its rules as `.board` and its draft helper as `.earn`. */
export type AchievementsFeature<K extends string, G, E> = Feature<
  K,
  AchievementsState,
  AchievementsActions
> & {
  readonly board: AchievementBoard<G, E>;
  /** Draft helper: earns one inside a recipe or step. False when it is unknown or already earned. */
  earn(draft: object, id: string, now: number): boolean;
};

/** The definition `achievements` takes. */
export interface AchievementsDef<K extends string, G, E> extends Omit<AchievementBoardDef<G, E>, "id"> {
  /** The saved key, and the source prefix on the stat bus. */
  readonly key: K;
  /** How many unacknowledged ids `fresh` keeps (default 20); the oldest drop first. */
  readonly keepFresh?: number;
  /** Runs in the same recipe as an achievement is earned. */
  readonly onEarn?: (draft: Draft<G>, achievement: Achievement<G, E>, now: number) => void;
  /** Default `"never"`: earned is earned. */
  readonly reset?: ResetRule<AchievementsState>;
}

/**
 * A wall of achievements as a feature. It saves `{ earned, fresh, holding }` under `key` and checks, in the step
 * `<key>.settle.check` after a pass's production, every unearned achievement that has a `when` and no `on`: earned at
 * once, or once its condition has held for `forMs` (the timer starts the first time a pass sees it hold and clears
 * the first time one sees it broken; over a catch-up the gap counts only if it holds at the end). Those with `on` are
 * checked by `notify(event)`; the game earns the rest with `award(id)` or `.earn(draft, id, now)`. A prestige reset
 * keeps everything unless `reset` says otherwise. The callbacks read the whole game state, so annotate one of them.
 */
export function achievements<const K extends string, E, G extends object = object>(
  def: AchievementsDef<K, G, E>,
): AchievementsFeature<K, G, E> {
  const board = achievementBoard<G, E>({
    id: def.key,
    list: def.list,
    columns: def.columns,
    rowEffects: def.rowEffects,
  });
  const keep = def.keepFresh ?? 20;
  type Own = Record<K, AchievementsState>;
  const own = (draft: unknown): AchievementsState => (draft as Own)[def.key];

  const earn = (draft: object, id: string, now: number): boolean => {
    const a = board.achievement(id);
    const s = own(draft);
    if (!a || s.earned[id] !== undefined) return false;
    s.earned[id] = now;
    delete s.holding[id];
    pushLine(s.fresh, id, keep);
    def.onEarn?.(draft as Draft<G>, a, now);
    return true;
  };

  const ticked = def.list.filter((a) => a.when && !a.on?.length);

  const made = feature({
    key: def.key,
    initial: (): AchievementsState => ({ earned: {}, fresh: [], holding: {} }),
    reset: def.reset ?? "never",
    actions: (api: FeatureApi<Own>): AchievementsActions => ({
      award: (id) => {
        let ok = false;
        const now = api.now();
        api.set((d) => {
          ok = earn(d, id, now);
        });
        return ok;
      },
      notify: (event) => {
        const got: string[] = [];
        const now = api.now();
        api.set((d) => {
          const state = d as unknown as G;
          for (const a of def.list) {
            if (!a.on?.includes(event) || own(d).earned[a.id] !== undefined) continue;
            if ((a.when?.(state, now) ?? true) && earn(d, a.id, now)) got.push(a.id);
          }
        });
        return got;
      },
      acknowledge: (ids) =>
        api.set((d) => {
          const s = own(d);
          s.fresh = ids ? s.fresh.filter((id) => !ids.includes(id)) : [];
        }),
    }),
    steps: {
      settle: {
        check: (d: Draft<Own>, ctx) => {
          const state = d as unknown as G;
          for (const a of ticked) {
            const s = own(d);
            if (s.earned[a.id] !== undefined) continue;
            if (!a.when?.(state, ctx.now)) {
              delete s.holding[a.id];
              continue;
            }
            const need = a.forMs ?? 0;
            if (need <= 0) {
              earn(d, a.id, ctx.now);
              continue;
            }
            const since = s.holding[a.id] ?? ctx.now;
            s.holding[a.id] = since;
            if (ctx.now - since >= need) earn(d, a.id, ctx.now);
          }
        },
      },
    },
  });
  return Object.assign(made, { board, earn });
}
