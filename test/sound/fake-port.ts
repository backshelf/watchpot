// A `CorePort` with nothing behind it: it records the commands a module posts, plays back the events a test
// hands it, and keeps a clock the test moves. What a module of the shell is tested against.
import type { CorePort } from "../../src/sound/port";
import { decodeCommands, type SoundCommand, type SoundEvent } from "../../src/sound/protocol";

export function fakePort({ rate = 48000 }: { rate?: number } = {}) {
  let up = false;
  let seconds = 0;
  const batches: SoundCommand[][] = [];
  const samples = new Map<string, number>();
  const listeners = new Set<(event: SoundEvent) => void>();
  const waiting: (() => void)[] = [];
  const port: CorePort = {
    send(records) {
      if (up) batches.push(decodeCommands(records));
    },
    up: () => up,
    whenUp(fn) {
      if (up) fn();
      else waiting.push(fn);
    },
    listen(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    frames: (ms) => Math.max(0, Math.round(((ms ?? 0) / 1000) * rate)) || 0,
    rate: () => rate,
    time: () => seconds,
    frame: () => Math.round(seconds * rate),
    sample: (key) => samples.get(key) ?? 0,
  };
  return {
    port,
    /** Every `send` while the core was up, one array of commands each. */
    batches,
    /** Every command sent, in order. */
    sent: (): SoundCommand[] => batches.flat(),
    /** The commands of one op. */
    of: <O extends SoundCommand["op"]>(op: O) =>
      batches.flat().filter((c): c is Extract<SoundCommand, { op: O }> => c.op === op),
    /** Forgets what was sent so far. */
    clear: () => void batches.splice(0),
    /** Sample ids by key: what `port.sample` answers. */
    samples,
    /** The core comes up: what waited for it runs. */
    bringUp() {
      up = true;
      for (const fn of waiting.splice(0)) fn();
    },
    /** The core writes an event. */
    emit(event: SoundEvent) {
      for (const fn of listeners) fn(event);
    },
    /** Moves the context's clock on. */
    advance(by: number) {
      seconds += by;
    },
  };
}
