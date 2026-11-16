// Run a build's steps (a generator) a few milliseconds at a time, in the browser's idle time, so a long build never
// takes a frame of its own. A step may yield a promise (a shader compile): the run waits for it before going on.
// `finish()` runs whatever is left at once, for the moment the result is needed before idle time got to it.
// Budgets are measured with `performance.now()`: they measure work, not animation.

/** A build running in idle time. */
export interface IdleTask<T> {
  /** Settles with the result, or rejects when cancelled or a step throws. */
  readonly promise: Promise<T>;
  readonly done: boolean;
  /** Runs the remaining steps now (a pending compile is left to finish on its own) and returns the result. */
  finish(): T;
  /** Stops; the steps already run are dropped. A finished task's result is the caller's to dispose. */
  cancel(): void;
}

/** What an idle callback is told: whether it was forced by its timeout, and the time left in the idle period. */
export interface IdleDeadline {
  readonly didTimeout: boolean;
  timeRemaining(): number;
}

/** Runs `slice` in idle time; `urgent` work should wait at most about a frame. */
export type IdleSchedule = (slice: (deadline: IdleDeadline) => void, urgent: boolean) => void;

/** How a run is sliced. */
export interface IdleOptions {
  /** Work that is waited on gets a slice every frame or so. */
  readonly urgent?: boolean;
  /** Milliseconds of steps per slice; a single step can run over. Default 4. */
  readonly sliceMs?: number;
  /** Where slices run. Default: `requestIdleCallback`, or a timer where there is none (Safari). */
  readonly schedule?: IdleSchedule;
  /** The work clock, milliseconds. Default `performance.now`. */
  readonly now?: () => number;
}

/** The default schedule: idle callbacks where the browser has them, a timer elsewhere. */
export const idleSchedule: IdleSchedule = (run, urgent) => {
  const idle = (globalThis as { requestIdleCallback?: (cb: (d: IdleDeadline) => void, o?: object) => void })
    .requestIdleCallback;
  if (idle) idle(run, { timeout: urgent ? 20 : 250 });
  else setTimeout(() => run({ didTimeout: true, timeRemaining: () => 0 }), urgent ? 0 : 16);
};

/** Thrown by `finish` on a cancelled task, and the reason its promise rejects with. */
export class Cancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

/** Starts `steps` in idle time. */
export function runIdle<T>(steps: Generator<unknown, T>, options: IdleOptions = {}): IdleTask<T> {
  const urgent = options.urgent === true;
  const sliceMs = options.sliceMs ?? 4;
  const schedule = options.schedule ?? idleSchedule;
  const clock = options.now ?? (() => performance.now());
  let done = false;
  let cancelled = false;
  let waiting = false;
  let result: T | undefined;
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  // An unhandled cancel is not an error.
  promise.catch(() => {});

  /** A step threw: the build is over, for the slices and for anyone waiting on it. */
  const fail = (e: unknown) => {
    cancelled = true;
    reject(e);
  };

  /** One step; true when the steps are done. A yielded promise pauses the slices until it settles. */
  const step = (wait: boolean): boolean => {
    const r = steps.next();
    if (r.done) {
      done = true;
      result = r.value;
      resolve(r.value);
      return true;
    }
    const v = r.value;
    if (wait && v instanceof Promise) {
      waiting = true;
      v.catch(() => {}).finally(() => {
        waiting = false;
        if (!done && !cancelled) schedule(slice, urgent);
      });
    }
    return false;
  };

  const slice = (deadline: IdleDeadline) => {
    if (done || cancelled || waiting) return;
    const start = clock();
    const budget = deadline.didTimeout ? sliceMs : Math.min(sliceMs, Math.max(1, deadline.timeRemaining()));
    try {
      do {
        if (step(true)) return;
        if (waiting) return;
      } while (clock() - start < budget);
    } catch (e) {
      fail(e);
      return;
    }
    schedule(slice, urgent);
  };
  schedule(slice, urgent);

  return {
    promise,
    get done() {
      return done;
    },
    finish() {
      if (cancelled) throw new Cancelled();
      try {
        while (!done) step(false);
      } catch (e) {
        fail(e);
        throw e;
      }
      return result as T;
    },
    cancel() {
      if (done || cancelled) return;
      cancelled = true;
      steps.return(undefined as T);
      reject(new Cancelled());
    },
  };
}
