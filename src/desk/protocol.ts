// The messages of `watchpot sim`'s WebSocket (`/ws`), shared by the server, its workers and the page.
// Decimals travel as strings (`Decimal#toString()`).
import type { FittedGate } from "../sim/fit";

/** What the page sends: one run of the desk. */
export type ToServer = {
  type: "run";
  /** The page's number for this run; every answer carries it. */
  id: number;
  /** Full knob values; a missing key takes `knobs.defaults()`. */
  knobs: Record<string, number>;
  /** Gates set by hand, by key. */
  pins: Record<string, { price?: string; atMs?: number }>;
  /** 1..`desk.seeds.full`. */
  seeds: number;
};

/** The desk's sample at a moment of play. */
export interface DeskPoint {
  atMs: number;
  currencies: Record<string, string>;
  next?: Record<string, { currency: string; cost: string }>;
}

/** What the server sends. `resumedFromMs` is set on a seed's first window when it resumed from a cached snapshot. */
export type ToClient =
  | {
      type: "window";
      id: number;
      seed: number;
      fromMs: number;
      toMs: number;
      points: DeskPoint[];
      gates: FittedGate[];
      resumedFromMs?: number;
      /** Replayed from the window cache, not played by this run. */
      cached?: true;
    }
  | { type: "done"; id: number; seed: number; finished: boolean; playedMs: number }
  | { type: "error"; id: number; seed?: number; message: string }
  | { type: "cancelled"; id: number };

/** What the server hands a worker to start a seed (the page never sees it). */
export interface WorkerInit {
  id: number;
  deskPath: string;
  cwd: string;
  seed: number;
  knobs: Record<string, number>;
  pins: ToServer["pins"];
}

/** One knob as `/api/desk` lists it: the game's spec with the value the page starts from. */
export interface DeskKnob {
  key: string;
  /** The value the desk starts from: `saved` laid over `code`. */
  value: number;
  /** The knob's value in the game's code (its spec `value`). */
  code: number;
  label?: string;
  group?: string;
  [spec: string]: unknown;
}

/** What `GET /api/desk` answers: the desk as the page needs it. */
export interface DeskInfo {
  /** The main currency. */
  currency: string;
  currencies: string[];
  windowHours: number;
  end: { hours: number };
  seeds: { tuning: number; full: number };
  knobs: DeskKnob[];
  /** Gates set by hand, from `sim.tuning.json`. */
  pins: Record<string, { price?: string; atMs?: number }>;
  /** Absolute path of `sim.tuning.json`. */
  tuningFile: string;
}

/** `sim.tuning.json`: what was set by hand. Knobs holds only values that differ from the code's. */
export type TuningFile = {
  knobs: Record<string, number>;
  pins: Record<string, { price?: string; atMs?: number }>;
};
