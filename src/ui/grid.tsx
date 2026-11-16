// A two-dimensional roving-focus grid (WAI-ARIA grid, one tab stop) over any list, and the achievement wall built on
// it: hundreds of icon tiles, each earned, locked or hidden, its words in one shared tooltip.
import {
  type ComponentPropsWithRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { focusWithoutScroll } from "./focus";
import { useControllable, useEscape } from "./hooks";
import { type PlaceOptions, usePlacement } from "./position";
import { VisuallyHidden } from "./simple";
import { chain, mergeProps, useComposedRefs } from "./slot";

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
export function gridMove(
  key: string,
  at: GridPosition,
  rowLengths: readonly number[],
  { ctrl = false, pageRows = 5 }: { ctrl?: boolean; pageRows?: number } = {},
): GridPosition | null {
  const last = rowLengths.length - 1;
  if (last < 0) return null;
  const lengthOf = (row: number) => rowLengths[row] ?? 0;
  const inRow = (row: number, col: number) => ({ row, col: Math.max(0, Math.min(col, lengthOf(row) - 1)) });
  switch (key) {
    case "ArrowRight":
      return inRow(at.row, at.col + 1);
    case "ArrowLeft":
      return inRow(at.row, at.col - 1);
    case "ArrowDown":
      return inRow(Math.min(last, at.row + 1), at.col);
    case "ArrowUp":
      return inRow(Math.max(0, at.row - 1), at.col);
    case "PageDown":
      return inRow(Math.min(last, at.row + pageRows), at.col);
    case "PageUp":
      return inRow(Math.max(0, at.row - pageRows), at.col);
    case "Home":
      return ctrl ? { row: 0, col: 0 } : { row: at.row, col: 0 };
    case "End":
      return ctrl ? inRow(last, lengthOf(last) - 1) : inRow(at.row, lengthOf(at.row) - 1);
    default:
      return null;
  }
}

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

function rowsOf<T>(
  items: readonly T[] | undefined,
  columns: number | undefined,
  rows?: readonly (readonly T[])[],
) {
  if (rows) return rows.filter((r) => r.length > 0);
  const list = items ?? [];
  const width = Math.max(1, Math.floor(columns ?? list.length) || 1);
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += width) out.push(list.slice(i, i + width));
  return out;
}

/**
 * A grid of tiles with one tab stop: arrows, Home/End (Ctrl for the grid's ends) and PageUp/PageDown move focus
 * cell to cell; Enter, Space and a press activate. Every cell is a `role="gridcell"` the caller fills, with
 * `data-active` on the tab stop and `data-row`/`data-col` on each.
 */
export function TileGrid<T>({
  items,
  columns,
  rows: given,
  getKey,
  renderCell,
  cellProps,
  rowProps,
  renderRowAside,
  active,
  defaultActive = 0,
  onActiveChange,
  onActivate,
  pageRows = 5,
  ref,
  onKeyDown,
  ...props
}: TileGridProps<T>) {
  const rows = useMemo(() => rowsOf(items, columns, given), [items, columns, given]);
  const starts = useMemo(() => {
    const out: number[] = [];
    let n = 0;
    for (const r of rows) {
      out.push(n);
      n += r.length;
    }
    return out;
  }, [rows]);
  const total = rows.reduce((n, r) => n + r.length, 0);
  const [current, setCurrent] = useControllable(active, defaultActive, onActiveChange);
  const activeIndex = Math.max(0, Math.min(current, total - 1));
  const grid = useRef<HTMLDivElement>(null);
  const refs = useComposedRefs(grid, ref);

  const positionOf = (index: number): GridPosition => {
    let row = 0;
    while (row + 1 < starts.length && (starts[row + 1] ?? 0) <= index) row++;
    return { row, col: index - (starts[row] ?? 0) };
  };
  const cellAt = (row: number, col: number): TileCell<T> | null => {
    const item = rows[row]?.[col];
    if (item === undefined) return null;
    const index = (starts[row] ?? 0) + col;
    return { item, row, col, index, active: index === activeIndex };
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    // From the focused cell itself, so two keys before a render still move twice.
    const from = (event.target as Element).closest?.("[data-index]")?.getAttribute("data-index");
    const at = positionOf(from != null ? Number(from) : activeIndex);
    if (event.key === "Enter" || event.key === " ") {
      const cell = cellAt(at.row, at.col);
      if (cell && onActivate) {
        event.preventDefault();
        onActivate(cell);
      }
      return;
    }
    const to = gridMove(
      event.key,
      at,
      rows.map((r) => r.length),
      { ctrl: event.ctrlKey || event.metaKey, pageRows },
    );
    if (!to) return;
    event.preventDefault();
    const index = (starts[to.row] ?? 0) + to.col;
    setCurrent(index);
    focusWithoutScroll(grid.current?.querySelector<HTMLElement>(`[data-index="${index}"]`));
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a CSS-laid wall of tiles, not a data table: the APG grid on divs
    <div {...props} ref={refs} role="grid" onKeyDown={chain(onKeyDown, keys)}>
      {rows.map((row, r) => {
        const aside = renderRowAside?.(r, row);
        return (
          <div key={r} {...mergeProps({ role: "row", "data-row": r }, rowProps?.(r, row) ?? {})}>
            {aside == null ? null : (
              // biome-ignore lint/a11y/useSemanticElements: the grid is divs, so its row header is one too
              // biome-ignore lint/a11y/useFocusableInteractive: a label for the row, not a stop: the arrows pass it by
              <div role="rowheader" data-row-aside="">
                {aside}
              </div>
            )}
            {row.map((item, c) => {
              const cell = cellAt(r, c) as TileCell<T>;
              return (
                <div
                  key={getKey(item, cell.index)}
                  {...mergeProps(
                    {
                      role: "gridcell",
                      tabIndex: cell.active ? 0 : -1,
                      "data-index": cell.index,
                      "data-row": r,
                      "data-col": c,
                      "data-active": cell.active ? "" : undefined,
                      onFocus: () => {
                        if (!cell.active) setCurrent(cell.index);
                      },
                      onClick: () => {
                        setCurrent(cell.index);
                        onActivate?.(cell);
                      },
                    },
                    cellProps?.(cell) ?? {},
                  )}
                >
                  {renderCell(cell)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// AchievementGrid

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
export interface AchievementGridProps
  extends Omit<ComponentPropsWithRef<"div">, "children">,
    Pick<PlaceOptions, "side" | "align" | "offset" | "padding"> {
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

const defaultDetail = (tile: AchievementTile, secret: boolean, words: AchievementWords) => (
  <>
    <p data-name="">{secret ? words.hiddenName : tile.name}</p>
    <p data-line="">{secret ? words.hiddenLine : tile.line}</p>
    {!secret && tile.reward !== undefined ? <p data-reward="">{tile.reward}</p> : null}
  </>
);

/**
 * The achievement wall: a `TileGrid` of icon tiles (`data-earned`, `data-hidden`, `data-active`), rows
 * `data-complete`, and one detail tooltip that shows the focused tile at once, a hovered tile after `delay`, and a
 * tapped tile on touch. Each tile's name and state are its accessible name; the detail describes it.
 */
export function AchievementGrid({
  rows,
  renderIcon,
  words,
  renderDetail,
  detailProps,
  delay = 300,
  onActivate,
  onTilePress,
  renderRowAside,
  side = "top",
  align,
  offset,
  padding,
  onPointerLeave,
  onBlur,
  ref,
  ...props
}: AchievementGridProps) {
  const id = useId();
  const grid = useRef<HTMLDivElement>(null);
  const gridRefs = useComposedRefs(grid, ref);
  const detail = useRef<HTMLDivElement>(null);
  const detailRefs = useComposedRefs(detail, detailProps?.ref);
  const [shown, setShown] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tiles = useMemo(() => rows.flatMap((r) => r.tiles), [rows]);
  // The grid lays only rows with tiles; each keeps its index in `rows`, which the row's props and aside are told.
  const laid = useMemo(
    () => rows.flatMap((row, index) => (row.tiles.length > 0 ? [{ row, index }] : [])),
    [rows],
  );
  const tile = shown === null ? undefined : tiles[shown];
  const open = tile !== undefined;

  const later = useCallback((ms: number, fn: () => void) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = ms > 0 ? setTimeout(fn, ms) : null;
    if (ms <= 0) fn();
  }, []);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  useEscape(() => later(0, () => setShown(null)), open);

  const placement = usePlacement(
    () => (shown === null ? null : (grid.current?.querySelector(`[data-index="${shown}"]`) ?? null)),
    detail,
    open,
    { side, align, offset, padding },
    [shown],
  );
  const secret = tile !== undefined && Boolean(tile.hidden) && !tile.earned;

  return (
    <>
      <TileGrid
        {...props}
        ref={gridRefs}
        rows={laid.map(({ row }) => row.tiles)}
        getKey={(t) => t.id}
        rowProps={(r) => ({ "data-complete": laid[r]?.row.complete ? "" : undefined })}
        renderRowAside={
          renderRowAside &&
          ((r, tiles) => {
            const at = laid[r];
            if (!at) return null;
            return renderRowAside({
              index: at.index,
              row: at.row,
              earned: tiles.filter((t) => t.earned).length,
              total: tiles.length,
            });
          })
        }
        onActivate={(cell) => onActivate?.(cell.item)}
        onPointerLeave={chain(onPointerLeave, () => later(150, () => setShown(null)))}
        onBlur={chain(onBlur, (event) => {
          const to = event.relatedTarget as Node | null;
          if (!to || !grid.current?.contains(to)) later(0, () => setShown(null));
        })}
        cellProps={(cell) => {
          const t = cell.item;
          return {
            "data-earned": t.earned ? "" : undefined,
            "data-hidden": t.hidden && !t.earned ? "" : undefined,
            "aria-describedby": shown === cell.index ? id : undefined,
            onFocus: () => later(0, () => setShown(cell.index)),
            onPointerEnter: (event: { pointerType: string }) => {
              if (event.pointerType !== "touch") later(delay, () => setShown(cell.index));
            },
            onPointerUp: (event: { pointerType: string }) => {
              if (event.pointerType === "touch")
                later(0, () => setShown((s) => (s === cell.index ? null : cell.index)));
            },
            ...(onTilePress && {
              onClick: (event: MouseEvent<HTMLElement>) => onTilePress(t, event),
              onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                if (!event.repeat) onTilePress(t, event);
                // Space would scroll the page. With `onActivate` the grid's own keys prevent it, and a prevented
                // key would stop them from activating.
                if (event.key === " " && !onActivate) event.preventDefault();
              },
            }),
          };
        }}
        renderCell={(cell) => {
          const t = cell.item;
          const hidden = Boolean(t.hidden) && !t.earned;
          return (
            <>
              <span aria-hidden="true">
                {renderIcon(t, { earned: t.earned, hidden, active: cell.active })}
              </span>
              <VisuallyHidden>
                {hidden ? words.hiddenName : t.name}
                {t.earned ? words.earned : words.locked}
              </VisuallyHidden>
            </>
          );
        }}
      />
      <div
        {...detailProps}
        ref={detailRefs}
        id={id}
        role="tooltip"
        hidden={!open}
        style={{ ...detailProps?.style, ...placement.style }}
        data-state={open ? "open" : "closed"}
        data-side={placement.side}
        data-earned={tile?.earned ? "" : undefined}
        onPointerEnter={() => {
          if (timer.current !== null) clearTimeout(timer.current);
        }}
        onPointerLeave={() => later(150, () => setShown(null))}
      >
        {tile ? (renderDetail ? renderDetail(tile, secret) : defaultDetail(tile, secret, words)) : null}
      </div>
    </>
  );
}
