import {
  type BoardPiece,
  boardFeature,
  defineGame,
  defineStats,
  type Effect,
  feature,
  fillBoard,
  vocab,
} from "watchpot/core";

const WORDS = vocab({ currencies: ["seeds"], stats: ["growth"] });
type Fx = Effect<"growth">;

/** Three kinds of plant: one that just grows, one that likes company, one that wants the edge of the bed. */
const PLANTS: readonly BoardPiece<Fx>[] = [
  { id: "moss", effects: () => [{ stat: "growth", mul: 1.5 }] },
  {
    id: "fern",
    tags: ["leafy"],
    effects: (v) => [{ stat: "growth", mul: 1 + 0.5 * v.beside.filter((p) => p.id === "fern").length }],
  },
  { id: "ivy", limit: 2, effects: (v) => (v.edge ? [{ stat: "growth", mul: v.corner ? 4 : 2 }] : []) },
];

type State = { shed: { seeds: Record<string, number>; beds: number } };
export const shed = feature({
  key: "shed",
  initial: () => ({ seeds: { moss: 3, fern: 4, ivy: 2 }, beds: 3 }),
});

/** A 4 x 4 bed of which the top-left `beds` x `beds` is dug, planted from the seeds in the shed. */
export const garden = boardFeature<"garden", Fx, State>({
  key: "garden",
  width: 4,
  height: 4,
  pieces: PLANTS,
  held: (s, piece) => s.shed.seeds[piece] ?? 0,
  open: (s, x, y) => x < s.shed.beds && y < s.shed.beds,
});

/** What the bed gives, on the engine's `stats`: `s.stats.growth`, worked out again as the cells change. */
export const growth = defineStats({
  key: "stats",
  vocab: WORDS,
  reach: () => [shed, garden],
  stats: { growth: { base: 1 } },
  contributions: (s) => garden.contributions(s),
});

export const game = defineGame({
  id: "garden",
  save: { key: "garden.save", version: 1 },
  vocab: WORDS,
  features: [shed, garden, growth],
});
// store.getState().garden.place(garden.board.cellOf(0, 0), "ivy") → null, or why not

/** An auto-arrange: a good layout for what the shed holds, laid in one action. */
export function arrange(store: {
  getState(): State & { garden: { lay(cells: Record<number, string>): void } };
}) {
  const s = store.getState();
  const cells = fillBoard(garden.board, {
    ...garden.limits(s),
    score: (parts) => parts.reduce((n, p) => n * Number(p.effect.mul ?? 1), 1),
  });
  s.garden.lay(cells);
}
