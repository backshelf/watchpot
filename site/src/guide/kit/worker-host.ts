// The code box's host: the game runs in a worker, where the reader's code can be stopped. A new version runs in a
// worker of its own beside the running one and replaces it only once it has loaded and passed a short trial; a
// version that throws, never finishes loading, or hangs later is stopped, and the last version that ran well
// carries on (with the game's state carried over to it).
import { fresh, type GameHost, type HostOptions, type Problem, type Snapshot, thaw } from "./host";

/** What the page sends the worker. */
export type ToWorker =
  | {
      type: "load";
      /** The reader's main module, as TypeScript. */
      source: string;
      main: string;
      /** The other modules, already JavaScript. */
      js: Record<string, string>;
      /** The box's first and last lines in `source` (1-based), for saying which line of the box failed. */
      firstLine: number;
      lastLine: number;
      /** Actions pressed once while checking a new version, so a loop in one shows before the swap. */
      trial: string[];
      clock: boolean;
      intervalMs?: number;
      /** The previous version's profile, to carry the game over when its shape still fits. */
      profile?: string;
    }
  | { type: "call"; path: string; args: unknown[] }
  | { type: "clock"; on: boolean }
  | { type: "away"; ms: number }
  | { type: "reset" };

/** What the worker sends back. */
export type FromWorker =
  | { type: "ready" }
  /** The version cannot run: it does not parse, throws while it is made, or throws in its trial. */
  | { type: "refused"; problem: Problem }
  /** The running version threw (an action, or the clock gave up): it keeps running, and the box says why. */
  | { type: "threw"; problem: Problem }
  | { type: "state"; state: string; passes: number; clock: boolean; profile?: string };

/** How long a new version has to load and pass its trial, and how long a running one may go quiet (it beats 5/s). */
export const READY_MS = 1500;
export const QUIET_MS = 1500;

export interface WorkerHostOptions extends HostOptions {
  /** The URL of the built worker script. */
  worker: string;
  /** The main module's TypeScript around the editable piece. */
  source: { before: string; after: string; indent: number };
  trial: string[];
}

export class WorkerHost implements GameHost {
  readonly initial: Snapshot;
  private snap: Snapshot;
  private readonly made: Record<string, unknown>;
  private readonly listeners = new Set<() => void>();
  private live: Worker | null = null;
  private trying: Worker | null = null;
  /** A version started to recover from a failure: its arrival must not wipe the failure's message. */
  private recovering: Worker | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private quiet: ReturnType<typeof setTimeout> | null = null;
  /** The versions that ran, oldest first; the last one is running (or is what a failure falls back to). */
  private history: string[];
  private profile: string | undefined;
  private clockOn: boolean;
  private passesBase = 0;
  private pendingAway: { ms: number; before: Record<string, unknown> } | null = null;

  constructor(
    private readonly options: WorkerHostOptions,
    /** The piece as the page first shows it. */
    private readonly original: string,
  ) {
    this.history = [original];
    this.clockOn = options.clock;
    const first = fresh(options.modules, {});
    this.initial = first.snapshot;
    this.made = first.exports;
    this.snap = this.initial;
  }

  exports = () => this.made;

  snapshot = () => this.snap;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const listener of this.listeners) listener();
  }

  private get good(): string {
    return this.history[this.history.length - 1] ?? this.original;
  }

  start() {
    if (!this.live && !this.trying) this.load(this.good, "quiet");
  }

  stop() {
    this.live?.terminate();
    this.trying?.terminate();
    this.live = this.trying = this.recovering = null;
    if (this.watchdog) clearTimeout(this.watchdog);
    if (this.quiet) clearTimeout(this.quiet);
    this.watchdog = this.quiet = null;
  }

  /** The reader's version of the piece: tried beside the running game, which it replaces once it has proved itself. */
  run(piece: string) {
    this.load(piece, "check");
  }

  /** Back to the page's own version of the piece, forgetting the reader's. */
  restore() {
    this.history = [this.original];
    this.load(this.original, "check");
  }

  /** The editable piece, put back into its module, and the lines the box covers there. */
  private moduleFor(piece: string) {
    const { before, after, indent } = this.options.source;
    const pad = " ".repeat(indent);
    const body = piece
      .split("\n")
      .map((line) => (line.trim() === "" ? "" : pad + line))
      .join("\n");
    const firstLine = before.split("\n").length;
    return { source: before + body + after, firstLine, lastLine: firstLine + piece.split("\n").length - 1 };
  }

  /** `check` says so in the box while it loads; `quiet` (the first load, a recovery) leaves the box as it is. */
  private load(piece: string, how: "check" | "quiet" | "recover") {
    this.trying?.terminate();
    if (this.watchdog) clearTimeout(this.watchdog);
    const worker = new Worker(this.options.worker, { type: "module" });
    this.trying = worker;
    this.recovering = how === "recover" ? worker : null;
    if (how === "check") this.publish({ code: { kind: "checking" } });
    const { source, firstLine, lastLine } = this.moduleFor(piece);
    worker.onmessage = (event: MessageEvent<FromWorker>) => this.heard(worker, piece, event.data);
    worker.onerror = (event) => {
      event.preventDefault();
      this.refuse(worker, {
        title: "The code could not start",
        detail: "Something went wrong before the game could run. Reload the page if this keeps happening.",
        raw: event.message,
      });
    };
    const message: ToWorker = {
      type: "load",
      source,
      main: this.options.modules.main,
      js: Object.fromEntries(
        Object.entries(this.options.modules.js).filter(([path]) => path !== this.options.modules.main),
      ),
      firstLine,
      lastLine,
      trial: this.options.trial,
      clock: this.clockOn,
      intervalMs: this.options.intervalMs,
      profile: this.profile,
    };
    worker.postMessage(message);
    this.watchdog = setTimeout(() => {
      if (this.trying !== worker) return;
      this.refuse(worker, {
        title: "It never finished",
        detail:
          "Your code ran for over a second without finishing, so it was stopped. A loop that never ends does this.",
      });
    }, READY_MS);
  }

  private heard(worker: Worker, piece: string, message: FromWorker) {
    if (message.type === "refused") {
      this.refuse(worker, message.problem);
      return;
    }
    if (message.type === "ready") {
      if (this.trying !== worker) return;
      if (this.watchdog) clearTimeout(this.watchdog);
      this.watchdog = null;
      this.live?.terminate();
      this.live = worker;
      this.trying = null;
      if (piece !== this.good) this.history.push(piece);
      this.passesBase = this.snap.passes;
      if (this.recovering !== worker) {
        this.publish({ code: piece === this.original ? { kind: "original" } : { kind: "running" } });
      }
      this.recovering = null;
      this.listen();
      return;
    }
    if (worker !== this.live) return;
    if (message.type === "threw") {
      this.publish({ code: { kind: "threw", problem: message.problem } });
      return;
    }
    if (message.profile) this.profile = message.profile;
    this.clockOn = message.clock;
    const state = thaw(message.state);
    const away = this.pendingAway ? { ...this.pendingAway, after: state } : this.snap.away;
    this.pendingAway = null;
    this.publish({ state, passes: this.passesBase + message.passes, clock: message.clock, away });
    this.listen();
  }

  /**
   * The running worker beats five times a second. Silence means it hung (a loop in a step, or in an action once the
   * state reached some value): stop it, drop its version, and start the one before it on the last state it sent.
   */
  private listen() {
    if (this.quiet) clearTimeout(this.quiet);
    this.quiet = setTimeout(() => {
      const hung = this.live;
      if (!hung) return;
      hung.terminate();
      this.live = null;
      if (this.history.length > 1) this.history.pop();
      this.publish({
        code: {
          kind: "threw",
          problem: {
            title: "The game stopped answering",
            detail:
              "Something in your code never finished once the game was running (a loop that never ends, most likely), so it was stopped. The version before it has taken over, with the game as it was.",
          },
        },
      });
      this.load(this.good, "recover");
    }, QUIET_MS);
  }

  private refuse(worker: Worker, problem: Problem) {
    worker.terminate();
    if (this.trying === worker) this.trying = null;
    if (this.live === worker) this.live = null;
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
    this.publish({ code: { kind: "refused", problem } });
    // Nothing running (a first load or a recovery that failed): fall back a version, down to the page's own.
    if (!this.live && !this.trying) {
      if (this.history.length > 1) this.history.pop();
      else if (this.recovering === worker) return;
      this.load(this.good, "recover");
    }
  }

  private send(message: ToWorker) {
    this.live?.postMessage(message);
  }

  call(path: string, ...args: unknown[]) {
    this.send({ type: "call", path, args });
    return undefined;
  }

  setClock(on: boolean) {
    this.clockOn = on;
    this.send({ type: "clock", on });
    this.publish({ clock: on });
  }

  away(ms: number) {
    this.send({ type: "away", ms });
    // The worker answers with the state after its catch-up: the next state message completes the record.
    this.pendingAway = { ms, before: this.snap.state };
  }

  reset() {
    this.profile = undefined;
    this.send({ type: "reset" });
    this.passesBase = 0;
    this.publish({ passes: 0, away: null });
  }
}
