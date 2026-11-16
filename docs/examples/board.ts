import {
  type BoardPiece,
  boardFeature,
  busOf,
  defineGame,
  type Effect,
  feature,
  fillBoard,
} from "watchpot/core";

/** Three kinds of plant: one that just grows, one that likes company, one that wants the edge of the bed. */
const PLANTS: readonly BoardPiece<Effect>[] = [
  { id: "moss", effects: () => [{ stat: "growth", mult: 1.5 }] },
  {
    id: "fern",
    tags: ["leafy"],
    effects: (v) => [{ stat: "growth", mult: 1 + 0.5 * v.beside.filter((p) => p.id === "fern").length }],
  },
  { id: "ivy", limit: 2, effects: (v) => (v.edge ? [{ stat: "growth", mult: v.corner ? 4 : 2 }] : []) },
];

type State = { shed: { seeds: Record<string, number>; beds: number } };
export const shed = feature({
  key: "shed",
  initial: () => ({ seeds: { moss: 3, fern: 4, ivy: 2 }, beds: 3 }),
});

/** A 4 x 4 bed of which the top-left `beds` x `beds` is dug, planted from the seeds in the shed. */
export const garden = boardFeature<"garden", Effect, State>({
  key: "garden",
  width: 4,
  height: 4,
  pieces: PLANTS,
  held: (s, piece) => s.shed.seeds[piece] ?? 0,
  open: (s, x, y) => x < s.shed.beds && y < s.shed.beds,
});

export const game = defineGame({
  id: "garden",
  save: { key: "garden.save", version: 1 },
  features: [shed, garden],
});
// store.getState().garden.place(garden.board.cellOf(0, 0), "ivy") → null, or why not

/** What the bed gives, on the stat bus. */
export const gardenBus = (s: Parameters<typeof garden.contributions>[0]) => busOf(garden.contributions(s));

/** An auto-arrange: a good layout for what the shed holds, laid in one action. */
export function arrange(store: {
  getState(): State & { garden: { lay(cells: Record<number, string>): void } };
}) {
  const s = store.getState();
  const cells = fillBoard(garden.board, {
    ...garden.limits(s),
    score: (parts) => parts.reduce((n, p) => n * (p.effect.mult ?? 1), 1),
  });
  s.garden.lay(cells);
}
