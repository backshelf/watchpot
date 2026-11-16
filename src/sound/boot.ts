/**
 * The core's boot: the committed processor (`core.gen.ts`) added to the context's AudioWorklet from a Blob URL, and
 * one `AudioWorkletNode` with two output channels into the destination. The WebAssembly is decoded here, on the main
 * thread (a worklet scope may have no `atob`), and handed over in `processorOptions`.
 */
import { CORE_BASE64, PROCESSOR_SOURCE } from "./core.gen";
import { COMMANDS, decodeEvents, encode, fieldOffset, type SoundEvent } from "./protocol";

/** The shell's line to a running core: what `engine.ts` needs, whatever stands behind it (the worklet, a test). */
export interface CoreLink {
  /** Posts command records; the core reads them before its next block. */
  send(records: Uint8Array): void;
  /** Posts a sample: its 16-bit PCM and its `SAMPLE_LOAD` record, whose `ptr` the processor fills in. */
  upload(pcm: Int16Array, record: Uint8Array): void;
  /** Hears every batch of events the core writes. */
  onEvent(listener: (events: SoundEvent[]) => void): void;
  /** Hears a failure: `fatal` when the core stopped (it will not make sound again), else a refused sample. */
  onError(listener: (fatal: boolean, reason: string) => void): void;
  /** Disconnects the core and closes its port. */
  dispose(): void;
  /** The node everything leaves through, where there is one (a test's stand-in has none). */
  node?: AudioNode;
}

/** A booted core: the link and the node behind it. */
export interface BootedCore extends CoreLink {
  node: AudioWorkletNode;
}

/** The processor's registered name. */
const PROCESSOR = "watchpot-core";

/** Each context's module, added once: a second `registerProcessor` of one name throws. */
const modules = new WeakMap<BaseAudioContext, Promise<void>>();

/** True where the core can run: an AudioWorklet on the context, and WebAssembly. */
export function coreSupported(context: BaseAudioContext): boolean {
  return (
    typeof AudioWorkletNode !== "undefined" &&
    typeof WebAssembly !== "undefined" &&
    typeof Blob !== "undefined" &&
    typeof URL?.createObjectURL === "function" &&
    context.audioWorklet !== undefined
  );
}

function addModule(context: BaseAudioContext): Promise<void> {
  let added = modules.get(context);
  if (!added) {
    const url = URL.createObjectURL(new Blob([PROCESSOR_SOURCE], { type: "text/javascript" }));
    added = context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    // A failed add is not cached: it throws to this boot, and a later context may try again.
    added.catch(() => modules.delete(context));
    modules.set(context, added);
  }
  return added;
}

function coreBytes(): Uint8Array {
  const text = atob(CORE_BASE64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/**
 * Boots the core on `context` (suspended or running) and connects it to the destination. Throws where the core
 * cannot run or the module will not load; a failure after this resolves (the processor's constructor, a trap in
 * `process`) reaches `onError` as fatal.
 */
export async function bootCore(
  context: BaseAudioContext,
  { voices }: { voices: number },
): Promise<BootedCore> {
  if (!coreSupported(context)) throw new Error("watchpot/sound: no AudioWorklet or WebAssembly here");
  await addModule(context);
  const clock = encode("CLOCK_SET", { frame: 0 });
  const node = new AudioWorkletNode(context, PROCESSOR, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      bytes: coreBytes(),
      voices,
      clock: { record: clock.buffer, at: fieldOffset(COMMANDS.CLOCK_SET, "frame") },
    },
  });
  const eventListeners: ((events: SoundEvent[]) => void)[] = [];
  const errorListeners: ((fatal: boolean, reason: string) => void)[] = [];
  const fail = (fatal: boolean, reason: string) => {
    for (const listener of errorListeners) listener(fatal, reason);
  };
  node.port.onmessage = ({ data }: MessageEvent) => {
    if (data?.events instanceof ArrayBuffer) {
      const events = decodeEvents(new Uint8Array(data.events));
      for (const listener of eventListeners) listener(events);
    } else if (typeof data?.failed === "string") fail(false, data.failed);
  };
  node.onprocessorerror = () => fail(true, "the core's processor stopped");
  node.connect(context.destination);
  const at = fieldOffset(COMMANDS.SAMPLE_LOAD, "ptr");
  return {
    node,
    send(records) {
      const copy = records.slice();
      node.port.postMessage({ records: copy.buffer }, [copy.buffer]);
    },
    upload(pcm, record) {
      const copy = record.slice();
      node.port.postMessage({ pcm, record: copy.buffer, at }, [pcm.buffer, copy.buffer]);
    },
    onEvent: (listener) => void eventListeners.push(listener),
    onError: (listener) => void errorListeners.push(listener),
    dispose() {
      node.onprocessorerror = null;
      node.port.onmessage = null;
      node.port.close();
      node.disconnect();
    },
  };
}
