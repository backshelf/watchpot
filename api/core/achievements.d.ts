import type { Draft } from "immer";
import { type Decimal, type DecimalSource } from "./decimal";
import { type Feature, type NeedsOf, type ReachOf, type ReachShape, type ResetRule } from "./feature";
/**
 * Achievements: a wall of things a player can do once, laid in rows of a fixed width. Each is earned at most once and
 * kept for good; the count earned and the rows completed make a global multiplier (`power`), and each one, and each
 * completed row, may carry effects for the `stats` feature. Most are checked by the feature at the end of every pass
 * (`when`), some must hold for a while first (`forMs`), some are only true at a moment and are checked when the game
 * says that moment came (`on` with `notify`), and the rest the game awards itself (`award`).
 *
 * `achievementBoard({ id, list, columns })` is the pure kernel over an earned record; `defineAchievements({ key, list,
 * columns })` is a feature that owns the record and checks the list, with `select` (the board's questions over the
 * game state), `def` (the list, the width, the board) and `draft` (`earn`).
 */
/** One achievement. `G` is the game state its condition reads; `E` is the game's effect type. */
export interface Achievement<G = never, E = never> {
    readonly id: string;
    readonly name: string;
    /** What earns it, in the game's words. */
    readonly line: string;
    /** What it gives, in the game's words. */
    readonly reward?: string;
    /** Active while it is earned, as `{ stat, add }` / `{ stat, mul }`: `select.contributions` feeds the `stats` feature. */
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
    /** The source prefix of the contributions: `<id>:<achievement>`, and `<id>:row:<index>` for a row. */
    readonly id: string;
    readonly list: readonly Achievement<G, E>[];
    /** How many achievements one row holds. */
    readonly columns: number;
    /** What a completed row gives, beside its achievements' own effects. */
    readonly rowEffects?: (row: AchievementRow<G, E>) => readonly NoInfer<E>[];
}
/** The pure kernel of a wall of achievements, over an earned record the game keeps wherever it saves it. */
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
    contributions(earned: Earned): {
        source: string;
        effect: E;
    }[];
    /** The global multiplier: `each ^ count × row ^ rowsComplete`. */
    power(earned: Earned, bases: AchievementPower): Decimal;
}
/** The kernel of a wall of achievements. Throws on a repeated id or a width below one. */
export declare function achievementBoard<G, E>(def: AchievementBoardDef<G, E>): AchievementBoard<G, E>;
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
/** Any game state holding the feature's earned record under its key. */
export type AchievementsGame<K extends string> = {
    readonly [P in K]: Pick<AchievementsState, "earned">;
};
/** The read-only questions over state, for recipes, steps, callbacks and screens: the board's, state first. */
export interface AchievementsSelect<K extends string, G, E> {
    /** The wall as rows of tiles, in list order. A short last row is complete once all of it is earned. */
    rows(state: AchievementsGame<K>): AchievementRow<G, E>[];
    /** How many of the list are earned (an id the list no longer holds is not counted). */
    count(state: AchievementsGame<K>): number;
    rowsComplete(state: AchievementsGame<K>): number;
    /** Every earned achievement's effects, sourced `<key>:<achievement>`, then every complete row's, `<key>:row:<index>`. */
    contributions(state: AchievementsGame<K>): {
        source: string;
        effect: E;
    }[];
    /** The global multiplier: `each ^ count × row ^ rowsComplete`. */
    power(state: AchievementsGame<K>, bases: AchievementPower): Decimal;
}
/** The fixed configuration of an achievements feature. */
export interface AchievementsDefs<G, E> {
    readonly list: readonly Achievement<G, E>[];
    /** How many achievements one row holds. */
    readonly columns: number;
    /** The pure kernel behind `select`, over an earned record: `wall.def.board.achievement(id)`. */
    readonly board: AchievementBoard<G, E>;
}
/** The helpers that take a draft first and change it, named like the actions they mirror. */
export interface AchievementsDraftHelpers {
    /** Earns one inside a recipe or step at game time `now`. False when it is unknown or already earned. */
    earn(draft: object, id: string, now: number): boolean;
}
/** The three namespaces of an achievements feature. */
export interface AchievementsHelpers<K extends string, G, E> {
    readonly select: AchievementsSelect<K, G, E>;
    readonly def: AchievementsDefs<G, E>;
    readonly draft: AchievementsDraftHelpers;
}
/** An `achievements` feature: the feature plus `select`, `def` and `draft`. */
export type AchievementsFeature<K extends string, G, E> = Feature<K, AchievementsState, AchievementsActions> & AchievementsHelpers<K, G, E>;
/** The definition `achievements` takes. */
export interface AchievementsDef<K extends string, G, E, R extends ReachShape = readonly []> extends Omit<AchievementBoardDef<G, E>, "id"> {
    /** The saved key, and the source prefix of the contributions. */
    readonly key: K;
    /** The features the callbacks read, as `feature`'s `reach`. */
    readonly reach?: R | (() => R);
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
 * checked by `notify(event)`; the game earns the rest with `award(id)` or `.earn(draft, id, now)`. A run reset
 * keeps everything unless `reset` says otherwise. The callbacks read the game state: the feature's own slice and
 * whatever `reach` names, so none needs an annotation.
 *
 * `select`: `rows`, `count`, `rowsComplete`, `contributions`, `power`, each over the game state. `def`: `list`,
 * `columns` and the pure `board` kernel. `draft`: `earn`.
 */
export declare function defineAchievements<const K extends string, E = never, const R extends ReachShape = readonly [], G extends object = Record<K, AchievementsState> & ReachOf<R>>(def: AchievementsDef<K, G, E, R>): AchievementsFeature<K, G, E> & {
    readonly needs?: NeedsOf<R>;
};
