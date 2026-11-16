import {
  type Feature,
  type FeatureApi,
  feature,
  type NeedsOf,
  type ReachOf,
  type ReachShape,
  type ResetRule,
} from "./feature";

/**
 * Boards: a grid of cells, pieces placed on it, and what each piece does read from where it sits: its neighbours,
 * its row and column, the edge, how many of a kind are down. A garden, a reactor, a sheet of stickers, a beacon grid.
 * `board({ id, width, height, pieces })` is the rules, pure over a cells record the game keeps; `boardFeature` saves
 * the cells and carries the rules as `def.board`, with the state-reading questions under `select`. The effect type is
 * the game's own.
 */

/** What a piece sees from its cell: itself, where it is, and what is around it. */
export interface BoardView<E> {
  readonly cell: number;
  readonly x: number;
  readonly y: number;
  readonly piece: BoardPiece<E>;
  /** The pieces on the four cells sharing a side, in the order up, right, down, left (empty cells left out). */
  readonly beside: readonly BoardPiece<E>[];
  /** The pieces on the eight cells around (empty cells left out). */
  readonly around: readonly BoardPiece<E>[];
  /** The other pieces in its row, and in its column. */
  readonly row: readonly BoardPiece<E>[];
  readonly column: readonly BoardPiece<E>[];
  /** On the outer ring of the open cells; and on one of its corners. */
  readonly edge: boolean;
  readonly corner: boolean;
  /** The piece `dx` across and `dy` down from here, or null (empty, closed or off the grid). */
  at(dx: number, dy: number): BoardPiece<E> | null;
  /** How many pieces down carry the id or the tag (this one counted). */
  count(idOrTag: string): number;
}

/** A kind of piece: its id, its tags, and what one does where it sits. */
export interface BoardPiece<E> {
  readonly id: string;
  readonly tags?: readonly string[];
  /** The most that may be down at once, whatever is held. */
  readonly limit?: number;
  readonly effects: (view: BoardView<E>) => readonly E[];
}

/** A board's definition: its size and its kinds of piece. */
export interface BoardDef<E> {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly pieces: readonly BoardPiece<E>[];
}

/** What is down: a piece id per occupied cell (`y × width + x`). */
export type BoardCells = Record<number, string>;

/** Which cells may be used (default: all of the grid) and how many of a piece are held (default: no end of them). */
export interface BoardLimits {
  readonly open?: (x: number, y: number) => boolean;
  readonly held?: (piece: string) => number;
}

/** Why a placement was refused. */
export type BoardFailure = "unknown-piece" | "closed" | "occupied" | "none-left" | "limit" | "empty";

/** One piece down, with what it sees and what it does there. */
export interface PlacedPiece<E> {
  readonly view: BoardView<E>;
  readonly effects: readonly E[];
}

/** A board's rules over a cells record. */
export interface Board<E> {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly pieces: readonly BoardPiece<E>[];
  piece(id: string): BoardPiece<E> | undefined;
  cellOf(x: number, y: number): number;
  xy(cell: number): { x: number; y: number };
  /** How many of a piece are down. */
  used(cells: BoardCells, piece: string): number;
  /** Why the piece cannot go on the cell, or null when it can. */
  check(cells: BoardCells, cell: number, piece: string, limits?: BoardLimits): BoardFailure | null;
  /** Puts the piece on the cell (mutating `cells`), or says why not. */
  place(cells: BoardCells, cell: number, piece: string, limits?: BoardLimits): BoardFailure | null;
  /** Takes up what is on the cell: its piece id, or null for an empty one. */
  lift(cells: BoardCells, cell: number): string | null;
  /** Moves what is on `from` to `to`, swapping with whatever is there. */
  move(cells: BoardCells, from: number, to: number, limits?: BoardLimits): BoardFailure | null;
  /** Every piece down, in cell order, with its view and effects. Pieces on closed cells do nothing and are left out. */
  placed(cells: BoardCells, limits?: BoardLimits): PlacedPiece<E>[];
  /** Every effect on the board, sourced `<id>:<piece>@<x>,<y>`. */
  contributions(cells: BoardCells, limits?: BoardLimits): { source: string; effect: E }[];
  /** `cells` with whatever the limits no longer allow taken up (a closed cell, more of a piece than is held). */
  settle(cells: BoardCells, limits?: BoardLimits): BoardCells;
}

const BESIDE: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const DIAGONAL: readonly (readonly [number, number])[] = [
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

/** A board's rules. Throws on a repeated piece id or a size under one cell. */
export function board<E>(def: BoardDef<E>): Board<E> {
  if (!(def.width >= 1) || !(def.height >= 1))
    throw new Error(`board "${def.id}": it needs at least one cell`);
  const byId = new Map<string, BoardPiece<E>>();
  for (const p of def.pieces) {
    if (byId.has(p.id)) throw new Error(`board "${def.id}": the piece "${p.id}" appears twice`);
    byId.set(p.id, p);
  }
  const { width, height } = def;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const cellOf = (x: number, y: number) => y * width + x;
  const xy = (cell: number) => ({ x: cell % width, y: Math.floor(cell / width) });
  const isOpen = (limits: BoardLimits | undefined, x: number, y: number) =>
    inside(x, y) && (limits?.open?.(x, y) ?? true);
  const used = (cells: BoardCells, piece: string) => {
    let n = 0;
    for (const id of Object.values(cells)) if (id === piece) n++;
    return n;
  };

  const check: Board<E>["check"] = (cells, cell, piece, limits) => {
    const p = byId.get(piece);
    if (!p) return "unknown-piece";
    const { x, y } = xy(cell);
    if (!Number.isInteger(cell) || !isOpen(limits, x, y)) return "closed";
    if (cells[cell] !== undefined) return "occupied";
    const down = used(cells, piece);
    if (limits?.held && down >= limits.held(piece)) return "none-left";
    return p.limit !== undefined && down >= p.limit ? "limit" : null;
  };

  const placed: Board<E>["placed"] = (cells, limits) => {
    const pieceAt = (x: number, y: number): BoardPiece<E> | null =>
      isOpen(limits, x, y) ? (byId.get(cells[cellOf(x, y)] ?? "") ?? null) : null;
    const counts = new Map<string, number>();
    const down: { cell: number; x: number; y: number; piece: BoardPiece<E> }[] = [];
    for (const key of Object.keys(cells)) {
      const cell = Number(key);
      const { x, y } = xy(cell);
      const piece = pieceAt(x, y);
      if (!piece) continue;
      down.push({ cell, x, y, piece });
      for (const word of [piece.id, ...(piece.tags ?? [])]) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    down.sort((a, b) => a.cell - b.cell);
    const gather = (x: number, y: number, offsets: readonly (readonly [number, number])[]) =>
      offsets.flatMap(([dx, dy]) => pieceAt(x + dx, y + dy) ?? []);
    return down.map(({ cell, x, y, piece }) => {
      const beside = gather(x, y, BESIDE);
      const outside = BESIDE.filter(([dx, dy]) => !isOpen(limits, x + dx, y + dy)).length;
      const view: BoardView<E> = {
        cell,
        x,
        y,
        piece,
        beside,
        around: [...beside, ...gather(x, y, DIAGONAL)],
        row: down.filter((o) => o.y === y && o.x !== x).map((o) => o.piece),
        column: down.filter((o) => o.x === x && o.y !== y).map((o) => o.piece),
        edge: outside >= 1,
        corner: outside >= 2,
        at: (dx, dy) => pieceAt(x + dx, y + dy),
        count: (word) => counts.get(word) ?? 0,
      };
      return { view, effects: piece.effects(view) };
    });
  };

  const settle: Board<E>["settle"] = (cells, limits) => {
    const out: BoardCells = {};
    const down = new Map<string, number>();
    for (const key of Object.keys(cells).sort((a, b) => Number(a) - Number(b))) {
      const cell = Number(key);
      const id = cells[cell] ?? "";
      const piece = byId.get(id);
      const { x, y } = xy(cell);
      const n = down.get(id) ?? 0;
      if (!piece || !isOpen(limits, x, y)) continue;
      if (limits?.held && n >= limits.held(id)) continue;
      if (piece.limit !== undefined && n >= piece.limit) continue;
      out[cell] = id;
      down.set(id, n + 1);
    }
    return out;
  };

  return {
    id: def.id,
    width,
    height,
    pieces: def.pieces,
    piece: (id) => byId.get(id),
    cellOf,
    xy,
    used,
    check,
    place(cells, cell, piece, limits) {
      const failure = check(cells, cell, piece, limits);
      if (!failure) cells[cell] = piece;
      return failure;
    },
    lift(cells, cell) {
      const id = cells[cell];
      if (id === undefined) return null;
      delete cells[cell];
      return id;
    },
    move(cells, from, to, limits) {
      const moving = cells[from];
      if (moving === undefined) return "empty";
      const { x, y } = xy(to);
      if (!Number.isInteger(to) || !isOpen(limits, x, y)) return "closed";
      const there = cells[to];
      if (there === undefined) delete cells[from];
      else cells[from] = there;
      cells[to] = moving;
      return null;
    },
    placed,
    contributions: (cells, limits) =>
      placed(cells, limits).flatMap(({ view, effects }) =>
        effects.map((effect) => ({ source: `${def.id}:${view.piece.id}@${view.x},${view.y}`, effect })),
      ),
    settle,
  };
}

/** How a filled board is scored: higher is better. */
export type BoardScore<E> = (contributions: readonly { source: string; effect: E }[]) => number;

/**
 * A good layout, found greedily: from `start` (default an empty board), put down whichever piece on whichever open
 * cell scores highest, as long as it does not lower `score` (a piece that only pays beside its own kind has to go
 * down alone first); then try moving each piece to every other cell and lifting each one, keeping what scores
 * higher, for `passes` rounds (default 3). Not the best layout, a good one: what an auto-arrange button or a sim's
 * player does. The cost is cells x pieces scorings a placement, so call it on a change, not every tick.
 */
export function fillBoard<E>(
  rules: Board<E>,
  options: BoardLimits & { score: BoardScore<E>; start?: BoardCells; passes?: number },
): BoardCells {
  const { score, passes = 3 } = options;
  const cells: BoardCells = { ...rules.settle(options.start ?? {}, options) };
  const total = () => score(rules.contributions(cells, options));
  const open: number[] = [];
  for (let y = 0; y < rules.height; y++)
    for (let x = 0; x < rules.width; x++) if (options.open?.(x, y) ?? true) open.push(rules.cellOf(x, y));

  let best = total();
  for (;;) {
    let pick: { cell: number; piece: string; value: number } | null = null;
    for (const cell of open) {
      if (cells[cell] !== undefined) continue;
      for (const piece of rules.pieces) {
        if (rules.check(cells, cell, piece.id, options)) continue;
        cells[cell] = piece.id;
        const value = total();
        delete cells[cell];
        if (value >= best && (!pick || value > pick.value)) pick = { cell, piece: piece.id, value };
      }
    }
    if (!pick) break;
    cells[pick.cell] = pick.piece;
    best = pick.value;
  }
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (const from of open) {
      if (cells[from] === undefined) continue;
      for (const to of open) {
        if (to === from) continue;
        rules.move(cells, from, to, options);
        const value = total();
        if (value > best) {
          best = value;
          moved = true;
          // What was on `from` is on `to` now: carry on from the cell it left, which may hold the swapped piece.
          if (cells[from] === undefined) break;
        } else {
          rules.move(cells, to, from, options);
        }
      }
    }
    // A piece the layout is better off without comes up.
    for (const cell of open) {
      const id = cells[cell];
      if (id === undefined) continue;
      delete cells[cell];
      const value = total();
      if (value > best) {
        best = value;
        moved = true;
      } else cells[cell] = id;
    }
    if (!moved) break;
  }
  return cells;
}

/** A layout search run a slice at a time (`searchBoard`). */
export interface BoardSearch {
  /** Runs up to `count` more trials. True while trials are left. */
  step(count: number): boolean;
  /** The best layout found so far. */
  best(): BoardCells;
  /** What `score` gave the best layout. */
  bestScore(): number;
  /** How far through its trials the search is, 0..1. */
  progress(): number;
}

/**
 * A better layout than `fillBoard`'s, by simulated annealing: every piece held (as many as fit) sits either on an
 * open cell or in hand, and each trial swaps an open cell's content with any other cell's or a piece in hand, keeping
 * a worse layout now and then while the search is hot so it climbs out of a greedy layout's local best. It leaves a
 * piece in hand whenever the board scores higher without it. `trials` (default 60 000) costs a scoring each; the
 * search runs a slice at a time through `step`, so a page can spread it over frames and lay `best()` as it improves.
 * Starts from `start` (default empty); `random` (default `Math.random`) makes it repeatable. Never scores below the
 * start, and lays no more of a piece than its `limit`.
 */
export function searchBoard<E>(
  rules: Board<E>,
  options: BoardLimits & { score: BoardScore<E>; start?: BoardCells; trials?: number; random?: () => number },
): BoardSearch {
  const { score, trials = 60_000, random = Math.random } = options;
  const open: number[] = [];
  for (let y = 0; y < rules.height; y++)
    for (let x = 0; x < rules.width; x++) if (options.open?.(x, y) ?? true) open.push(rules.cellOf(x, y));
  const start = rules.settle(options.start ?? {}, options);
  // A slot per open cell, then one per piece in hand: never more of a piece than there are open cells.
  const slots: (string | null)[] = open.map((cell) => start[cell] ?? null);
  for (const piece of rules.pieces) {
    const units = Math.min(options.held?.(piece.id) ?? open.length, piece.limit ?? open.length, open.length);
    for (let n = rules.used(start, piece.id); n < units; n++) slots.push(piece.id);
  }
  const cells: BoardCells = { ...start };
  const put = (slot: number, id: string | null) => {
    slots[slot] = id;
    const cell = open[slot];
    if (cell === undefined) return;
    if (id === null) delete cells[cell];
    else cells[cell] = id;
  };
  const swap = (a: number, b: number) => {
    const was = slots[a] ?? null;
    put(a, slots[b] ?? null);
    put(b, was);
  };
  const total = () => score(rules.contributions(cells, options));
  const pick = (n: number) => Math.min(n - 1, Math.floor(random() * n));
  let current = total();
  let best: BoardCells = { ...cells };
  let bestValue = current;
  let done = 0;
  const idle = open.length === 0 || slots.length < 2 || !Number.isFinite(current);

  // How hot to start: the mean size of the change a swap makes from the start.
  let heat = 0;
  if (!idle) {
    let sum = 0;
    let seen = 0;
    for (let n = 0; n < 40; n++) {
      const a = pick(open.length);
      const b = pick(slots.length);
      if (a === b || slots[a] === slots[b]) continue;
      swap(a, b);
      sum += Math.abs(total() - current);
      seen++;
      swap(a, b);
    }
    heat = seen > 0 ? sum / seen : 0;
  }

  return {
    step(count) {
      if (idle) {
        done = trials;
        return false;
      }
      const end = Math.min(trials, done + Math.max(0, count));
      for (; done < end; done++) {
        const a = pick(open.length);
        const b = pick(slots.length);
        if (a === b || slots[a] === slots[b]) continue;
        swap(a, b);
        const value = total();
        const temperature = heat * (1 - done / trials) + heat * 1e-3;
        if (value >= current || (temperature > 0 && random() < Math.exp((value - current) / temperature))) {
          current = value;
          if (value > bestValue) {
            bestValue = value;
            best = { ...cells };
          }
        } else swap(a, b);
      }
      return done < trials;
    },
    best: () => ({ ...best }),
    bestScore: () => bestValue,
    progress: () => (trials > 0 ? Math.min(1, done / trials) : 1),
  };
}

/** A board feature's saved state: what is down. */
export interface BoardState {
  cells: BoardCells;
}

/** The board feature's actions. Each returns null, or why it was refused. */
export interface BoardActions {
  place(cell: number, piece: string): BoardFailure | null;
  lift(cell: number): string | null;
  move(from: number, to: number): BoardFailure | null;
  /** Takes everything up. */
  clear(): void;
  /** Lays the whole board at once (a saved layout, an auto-arrange): what the limits refuse is left off. */
  lay(cells: BoardCells): void;
}

/** The read-only questions over state. */
export interface BoardSelect<G, E> {
  /** The limits (`held`, `open`) the game's state gives. */
  limits(state: G): BoardLimits;
  /** Every effect on the board as a state has it, pieces no longer held or on a closed cell left out. */
  contributions(state: G): { source: string; effect: E }[];
}

/** The fixed configuration of a board feature. */
export interface BoardFixed<E> {
  /** The board's rules: pure over a cells record (`def.board.place(cells, …)`). */
  readonly board: Board<E>;
}

/** A `boardFeature`: the feature plus `select`, `def` and `draft` (which is empty: the actions are the changes). */
export type BoardFeature<K extends string, G, E> = Feature<K, BoardState, BoardActions> & {
  readonly select: BoardSelect<G, E>;
  readonly def: BoardFixed<E>;
  readonly draft: Record<never, never>;
};

/**
 * A board as a feature: it saves `{ cells }` under `key`, with the actions `place`, `lift`, `move`, `clear` and
 * `lay`. `held(state, piece)` is how many of a piece the player has and `open(state, x, y)` which cells are unlocked,
 * both read off the whole game state (its own slice plus what `reach` names), so a board grows and its pieces are
 * earned however the game likes. A piece no longer held, or on a cell no longer open, simply stops counting
 * (`select.contributions` leaves it out). A prestige reset keeps the layout unless `reset` says otherwise.
 */
export function boardFeature<
  const K extends string,
  E,
  const R extends ReachShape = readonly [],
  G extends object = Record<K, BoardState> & ReachOf<R>,
>(def: {
  readonly key: K;
  /** The features `held` and `open` read, as `feature`'s `reach`. */
  readonly reach?: R | (() => R);
  readonly width: number;
  readonly height: number;
  readonly pieces: readonly BoardPiece<E>[];
  readonly held?: (state: G, piece: string) => number;
  readonly open?: (state: G, x: number, y: number) => boolean;
  readonly reset?: ResetRule<BoardState>;
}): BoardFeature<K, G, E> & { readonly needs?: NeedsOf<R> } {
  const rules = board<E>({ id: def.key, width: def.width, height: def.height, pieces: def.pieces });
  type Own = Record<K, BoardState>;
  const slice = (state: unknown): BoardState => (state as Own)[def.key];
  const limits = (state: G): BoardLimits => ({
    held: def.held ? (piece) => def.held?.(state, piece) ?? 0 : undefined,
    open: def.open ? (x, y) => def.open?.(state, x, y) ?? true : undefined,
  });
  const made = feature<K, BoardState, BoardActions, ReachShape, Record<never, never>, Own>({
    reach: def.reach,
    key: def.key,
    initial: (): BoardState => ({ cells: {} }),
    reset: def.reset ?? "never",
    actions: (api: FeatureApi<Own>): BoardActions => {
      const act = <T>(run: (cells: BoardCells, l: BoardLimits) => T): T => {
        let out!: T;
        api.set((d) => {
          out = run(slice(d).cells, limits(d as unknown as G));
        });
        return out;
      };
      return {
        place: (cell, piece) => act((cells, l) => rules.place(cells, cell, piece, l)),
        lift: (cell) => act((cells) => rules.lift(cells, cell)),
        move: (from, to) => act((cells, l) => rules.move(cells, from, to, l)),
        clear: () =>
          api.set((d) => {
            slice(d).cells = {};
          }),
        lay: (cells) =>
          api.set((d) => {
            slice(d).cells = rules.settle(cells, limits(d as unknown as G));
          }),
      };
    },
  });
  const helpers: Pick<BoardFeature<K, G, E>, "select" | "def" | "draft"> = {
    select: {
      limits,
      contributions: (state) =>
        rules.contributions(rules.settle(slice(state).cells, limits(state)), limits(state)),
    },
    def: { board: rules },
    draft: {},
  };
  return Object.assign(made, helpers) as BoardFeature<K, G, E> & { readonly needs?: NeedsOf<R> };
}
