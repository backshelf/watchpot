// The code box's worker: it turns the reader's TypeScript into JavaScript (sucrase: types stripped, imports made
// `require` calls, no type checking), runs it against the real engine, plays a short trial, and then runs the game,
// sending its state to the page five times a second. The page stops this worker whenever it goes quiet.
import { transform } from "sucrase";
import * as core from "watchpot/core";
import { freeze, harness } from "./host";
import { runProblem, syntaxProblem } from "./problem";
import { runModules } from "./run";
import type { FromWorker, ToWorker } from "./worker-host";

type Store = ReturnType<typeof core.createIdleStore>;
type Load = Extract<ToWorker, { type: "load" }>;

const post = (message: FromWorker) => postMessage(message);

let store: Store | null = null;
let clock: core.Clock | null = null;
let clockOn = false;
let skew = 0;
let passes = 0;
let lastSeen = -1;
let load: Load | null = null;
let backend = core.createMemoryBackend();

const now = () => Date.now() + skew;

function lookup(path: string): unknown {
  let at: unknown = store?.getState();
  for (const part of path.split(".")) at = (at as Record<string, unknown> | undefined)?.[part];
  return at;
}

let told = 0;
function tell() {
  if (!store) return;
  let profile: string | undefined;
  // The profile, for carrying the game over to the reader's next version, once a second is plenty.
  if (told++ % 5 === 0) {
    try {
      profile = store.getState().exportProfile();
    } catch {
      profile = undefined;
    }
  }
  post({ type: "state", state: freeze(store.getState()), passes, clock: clockOn, profile });
}

/** An error while the game runs: said in the box's words. The game keeps running (a thrown recipe changes nothing). */
function threw(error: unknown) {
  const problem = runProblem(
    error,
    load?.main ?? "",
    load?.firstLine ?? 0,
    load?.lastLine ?? 0,
    "while the game ran",
  );
  post({ type: "threw", problem });
}

function startClock() {
  if (!store || clock) return;
  clock = core.startGameClock(store, {
    intervalMs: load?.intervalMs,
    // The engine's clock stops itself after ten throws in a row.
    onFail: (error) => {
      clock = null;
      clockOn = false;
      threw(error);
    },
  });
}

/** Makes the game from the reader's module and plays its trial. False (having said why) when it cannot. */
function make(message: Load): boolean {
  const { source, main, js, firstLine, lastLine } = message;
  const box = (error: unknown, when: string) => runProblem(error, main, firstLine, lastLine, when);
  let code: string;
  try {
    code = transform(source, {
      transforms: ["typescript", "imports"],
      filePath: main,
      production: true,
    }).code;
  } catch (error) {
    post({ type: "refused", problem: syntaxProblem(error, firstLine, lastLine) });
    return false;
  }
  const made: unknown[] = [];
  backend = core.createMemoryBackend();
  try {
    const exports = runModules(
      { main, js: { ...js, [main]: code } },
      harness(made, now, () => core.createGameStorage(backend)),
    );
    store =
      (made[0] as Store | undefined) ??
      core.createIdleStore(exports.game as never, { now, storage: core.createGameStorage(backend) });
  } catch (error) {
    post({ type: "refused", problem: box(error, "while the game was being made") });
    return false;
  }
  const carry = () => {
    if (!message.profile || !store) return false;
    try {
      store.getState().importProfile(message.profile);
      return true;
    } catch {
      return false;
    }
  };
  // The trial: a catch-up, a second of ticks, and each action the page names, pressed once. A throw here, or a loop
  // that never ends (the page's watchdog), refuses the version before it replaces the running game.
  try {
    store.getState().catchUp();
    for (let i = 0; i < 10; i++) store.getState().tick(100);
    for (const path of message.trial) {
      const fn = lookup(path);
      if (typeof fn === "function") fn();
    }
  } catch (error) {
    post({ type: "refused", problem: box(error, "while the game was running") });
    return false;
  }
  // The trial's presses were a test, not the reader's: the game goes on from the last version's state when its shape
  // still fits, else from its own start.
  if (!carry()) store.getState().resetProfile();
  return true;
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  try {
    if (message.type === "load") {
      load = message;
      if (!make(message) || !store) return;
      store.subscribe((state) => {
        const seen = (state as { clock?: { lastSeen?: number } }).clock?.lastSeen ?? -1;
        if (seen !== lastSeen) passes += 1;
        lastSeen = seen;
      });
      post({ type: "ready" });
      clockOn = message.clock;
      // With the clock off, no time passes on the page at all: not even the moment since the trial.
      if (clockOn) startClock();
      tell();
      // The heartbeat: the page reads the state from it, and takes silence for a hang.
      setInterval(tell, 200);
      return;
    }
    if (!store) return;
    if (message.type === "call") {
      const fn = lookup(message.path);
      if (typeof fn === "function") fn(...message.args);
      else {
        const name = message.path.split(".").pop();
        post({
          type: "threw",
          problem: {
            title: `There is no \`${name}\` yet`,
            detail: `The button calls \`${message.path}\`, and the code has no action by that name. Add it, or check its spelling.`,
          },
        });
      }
    } else if (message.type === "clock") {
      clockOn = message.on;
      if (clockOn) startClock();
      else {
        clock?.stop();
        clock = null;
      }
    } else if (message.type === "away") {
      clock?.stop();
      clock = null;
      skew += message.ms;
      if (clockOn) startClock();
      else store.getState().catchUp();
    } else if (message.type === "reset") {
      store.getState().resetProfile();
      passes = 0;
    }
    tell();
  } catch (error) {
    threw(error);
  }
};
