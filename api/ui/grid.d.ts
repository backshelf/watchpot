import { type ComponentPropsWithRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { type PlaceOptions } from "./position";
/** A cell's place: its row and its column within that row. */
export interface GridPosition {
    row: number;
    col: number;
}
/**
 * Where a key moves focus in a grid whose rows have `rowLengths` cells (ragged rows allowed): arrows step and stop at
 * the edges, a row change keeps the column where the row has it; Home and End go to the row's ends (with Ctrl, the
 * grid's); PageUp and PageDown move `pageRows` rows. `null` for a key the grid does not use. Pure.
 */
export declare function gridMove(key: string, at: GridPosition, rowLengths: readonly number[], { ctrl, pageRows }?: {
    ctrl?: boolean;
    pageRows?: number;
}): GridPosition | null;
/** One cell as `TileGrid` hands it to the caller: its item, place, flat index and whether it holds the tab stop. */
export interface TileCell<T> {
    item: T;
    row: number;
    col: number;
    index: number;
    active: boolean;
}
/** Props of `TileGrid`: the items (in `columns`, or as `rows`), how to key and draw each, and a div's. */
export interface TileGridProps<T> extends Omit<ComponentPropsWithRef<"div">, "children"> {
    /** The items, laid in rows of `columns`. Give this or `rows`. */
    items?: readonly T[];
    columns?: number;
    /** The items already in rows (rows may differ in length). */
    rows?: readonly (readonly T[])[];
    getKey: (item: T, index: number) => string;
    /** A cell's content, given its state. */
    renderCell: (cell: TileCell<T>) => ReactNode;
    /** Props for a cell's element (data attributes like `data-earned`, a class). */
    cellProps?: (cell: TileCell<T>) => object;
    /** Props for a row's element (`data-complete`, a class). */
    rowProps?: (row: number, items: readonly T[]) => object;
    /**
     * Something beside each row (a rail with its number and how full it is), drawn inside the row before its cells as
     * a `role="rowheader"` marked `data-row-aside`, so it names the row and lines up with it; set its side with CSS
     * (`order`, a grid column). It takes no focus and no arrow stops on it. Null draws nothing.
     */
    renderRowAside?: (row: number, items: readonly T[]) => ReactNode;
    /** The flat index of the cell holding the tab stop, controlled. */
    active?: number;
    defaultActive?: number;
    onActiveChange?: (index: number) => void;
    /** Enter, Space or a press on a cell. */
    onActivate?: (cell: TileCell<T>) => void;
    /** How many rows PageUp and PageDown move. Default 5. */
    pageRows?: number;
}
/**
 * A grid of tiles with one tab stop: arrows, Home/End (Ctrl for the grid's ends) and PageUp/PageDown move focus
 * cell to cell; Enter, Space and a press activate. Every cell is a `role="gridcell"` the caller fills, with
 * `data-active` on the tab stop and `data-row`/`data-col` on each.
 */
export declare function TileGrid<T>({ items, columns, rows: given, getKey, renderCell, cellProps, rowProps, renderRowAside, active, defaultActive, onActiveChange, onActivate, pageRows, ref, onKeyDown, ...props }: TileGridProps<T>): import("react").JSX.Element;
/** One achievement on the wall. */
export interface AchievementTile {
    id: string;
    name: string;
    /** What it asks, in the game's voice. */
    line: ReactNode;
    /** What it gives, already formatted. */
    reward?: ReactNode;
    earned: boolean;
    /** Its name and line stay secret until earned. */
    hidden?: boolean;
}
/** One row of the wall; a complete row is `data-complete`. */
export interface AchievementRow {
    tiles: readonly AchievementTile[];
    complete?: boolean;
}
/** The words the wall says: all the game's. */
export interface AchievementWords {
    /** Shown and said for a hidden tile's name ("???"). */
    hiddenName: string;
    /** Shown for a hidden tile's line. */
    hiddenLine?: ReactNode;
    /** Said after an earned tile's name (", earned"). */
    earned: string;
    /** Said after a tile not yet earned (", locked"). */
    locked: string;
}
/** What the caller draws for a tile's icon, given its state. */
export interface AchievementIconState {
    earned: boolean;
    hidden: boolean;
    active: boolean;
}
/** What `renderRowAside` is given for one row of the wall: its place, its tiles, and how many are earned. */
export interface AchievementRowAside {
    index: number;
    row: AchievementRow;
    earned: number;
    total: number;
}
/** Props of `AchievementGrid`: the rows, the icon and the words, placement of the detail, and a div's. */
export interface AchievementGridProps extends Omit<ComponentPropsWithRef<"div">, "children">, Pick<PlaceOptions, "side" | "align" | "offset" | "padding"> {
    rows: readonly AchievementRow[];
    renderIcon: (tile: AchievementTile, state: AchievementIconState) => ReactNode;
    words: AchievementWords;
    /** The detail's content for a tile; by default its name, line and reward as `[data-name]`, `[data-line]`, `[data-reward]`. */
    renderDetail?: (tile: AchievementTile, secret: boolean) => ReactNode;
    /** Props for the detail (tooltip) element: a class. */
    detailProps?: ComponentPropsWithRef<"div">;
    /** Hover delay before the detail opens, ms. Default 300. */
    delay?: number;
    onActivate?: (tile: AchievementTile) => void;
    /**
     * A tile was pressed, earned or not: a click or tap, or Enter or Space on it (a held key's repeats are not
     * presses). Focus and the detail behave as they would without it; the event says where (a sound placed at its
     * `currentTarget`, say).
     */
    onTilePress?: (tile: AchievementTile, event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void;
    /**
     * A rail beside each row (its number, how full it is, what a full one pays), called once per row: drawn inside the
     * row before its tiles as a `role="rowheader"` marked `data-row-aside`, so it lines up with the row and names it.
     * Lay it on either side with CSS. Null draws nothing for that row.
     */
    renderRowAside?: (aside: AchievementRowAside) => ReactNode;
}
/**
 * The achievement wall: a `TileGrid` of icon tiles (`data-earned`, `data-hidden`, `data-active`), rows
 * `data-complete`, and one detail tooltip that shows the focused tile at once, a hovered tile after `delay`, and a
 * tapped tile on touch. Each tile's name and state are its accessible name; the detail describes it.
 */
export declare function AchievementGrid({ rows, renderIcon, words, renderDetail, detailProps, delay, onActivate, onTilePress, renderRowAside, side, align, offset, padding, onPointerLeave, onBlur, ref, ...props }: AchievementGridProps): import("react").JSX.Element;
