// The state of the page's latest run: what it sent, how far it has got, what went wrong, and the data so far. Pure.
import type { ToClient } from "../protocol";
import { addWindow, type DeskData, emptyData } from "./series";

export type RunPhase = "idle" | "running" | "done" | "error";

export interface RunError {
  seed?: number;
  message: string;
}

export interface RunState {
  /** The id of the latest `run` sent; answers to any other are ignored. */
  id: number;
  phase: RunPhase;
  /** Seeds the run plays, and how many of them have finished or failed. */
  seeds: number;
  settled: number;
  /** The furthest played ms of any seed. */
  playedMs: number;
  /** Set when a seed resumed from a cached snapshot: the earliest ms it resumed from. Earlier hours were not replayed. */
  resumedFromMs?: number;
  errors: RunError[];
  data: DeskData;
  /** The run shown before this one: what the graphs draw dashed beneath the live run. Absent until a second run starts. */
  before?: DeskData;
}

export type RunAction =
  | { type: "start"; id: number; seeds: number }
  | { type: "clearBefore" }
  | { type: "message"; msg: ToClient };

export const idleRun = (): RunState => ({
  id: 0,
  phase: "idle",
  seeds: 0,
  settled: 0,
  playedMs: 0,
  errors: [],
  data: emptyData(),
});

/**
 * A new run clears what was drawn, and the run just shown (if it drew anything) becomes `before`; a message for any run
 * but the latest is dropped. A cached window is part of the new run like any other.
 */
export function runReducer(state: RunState, action: RunAction): RunState {
  if (action.type === "start") {
    const before = state.data.seeds.size > 0 ? state.data : state.before;
    return { ...idleRun(), id: action.id, phase: "running", seeds: action.seeds, before };
  }
  if (action.type === "clearBefore") return { ...state, before: undefined };
  const msg = action.msg;
  if (msg.id !== state.id) return state;
  switch (msg.type) {
    case "window":
      return {
        ...state,
        data: addWindow(state.data, msg),
        playedMs: Math.max(state.playedMs, msg.toMs),
        resumedFromMs:
          msg.resumedFromMs === undefined
            ? state.resumedFromMs
            : Math.min(state.resumedFromMs ?? Number.POSITIVE_INFINITY, msg.resumedFromMs),
      };
    case "done": {
      const settled = state.settled + 1;
      const over = settled >= state.seeds;
      return {
        ...state,
        settled,
        playedMs: Math.max(state.playedMs, msg.playedMs),
        phase: over && state.phase === "running" ? "done" : state.phase,
      };
    }
    case "error":
      return {
        ...state,
        phase: "error",
        settled: msg.seed === undefined ? state.seeds : state.settled + 1,
        errors: [...state.errors, { seed: msg.seed, message: msg.message }],
      };
    case "cancelled":
      return { ...state, phase: state.phase === "running" ? "idle" : state.phase };
  }
}
