// The DSP core in Bun: the committed WebAssembly build (`src/sound/core.gen.ts`) instantiated as the worklet does
// it, so a test sends command records, renders frames and reads the events. Assert on what it renders by ranges,
// orderings and invariants, never by exact samples.
import { CORE_BASE64 } from "../../src/sound/core.gen";
import {
  COMMANDS,
  type CommandFields,
  type CommandName,
  concat,
  decodeEvents,
  encode,
  fieldOffset,
  LIMITS,
  type SoundEvent,
} from "../../src/sound/protocol";

interface CoreExports {
  memory: WebAssembly.Memory;
  init(sampleRate: number, maxVoices: number): void;
  alloc(bytes: number): number;
  cmd_buf(): number;
  process(frames: number, cmdLength: number): number;
  evt_buf(): number;
  evt_len(): number;
}

export interface Core {
  readonly sampleRate: number;
  /** Queues command records for the next block rendered. */
  send(records: Uint8Array | readonly Uint8Array[]): void;
  /** Queues one command: `send(encode(op, fields))`. */
  command<C extends CommandName>(op: C, fields: CommandFields<C>): void;
  /** Uploads 16-bit interleaved PCM as sample `id`, as the worklet does: `alloc`, a copy, then `SAMPLE_LOAD`. */
  loadSample(id: number, pcm: Int16Array, options?: { channels?: 1 | 2; rate?: number }): void;
  /** Renders `frames` frames in blocks and returns the master, left and right. */
  render(frames: number): [Float32Array, Float32Array];
  /** Every event written since the last call. */
  events(): SoundEvent[];
  /** The core's memory in bytes: what a leak test watches. */
  memoryBytes(): number;
}

let compiled: WebAssembly.Module | null = null;

/** A fresh core. Each call is its own instance with its own memory. */
export function loadCore({
  sampleRate = 48000,
  voices = 64,
}: {
  sampleRate?: number;
  voices?: number;
} = {}): Core {
  compiled ??= new WebAssembly.Module(Buffer.from(CORE_BASE64, "base64"));
  const core = new WebAssembly.Instance(compiled, {}).exports as unknown as CoreExports;
  core.init(sampleRate, voices);
  const queue: Uint8Array[] = [];
  let events: SoundEvent[] = [];
  const memory = () => new Uint8Array(core.memory.buffer);

  /** Copies queued records into the core's command buffer, as many whole ones as fit; returns the bytes written. */
  function flush(): number {
    const at = core.cmd_buf();
    let length = 0;
    while (queue[0] && length + queue[0].length <= LIMITS.CMD_CAP) {
      memory().set(queue[0], at + length);
      length += queue[0].length;
      queue.shift();
    }
    return length;
  }

  return {
    sampleRate,
    send(records) {
      queue.push(records instanceof Uint8Array ? records : concat(records));
    },
    command(op, fields) {
      queue.push(encode(op, fields));
    },
    loadSample(id, pcm, { channels = 1, rate = sampleRate } = {}) {
      const ptr = core.alloc(pcm.byteLength);
      if (ptr === 0) throw new Error("harness: the core has no memory for the sample");
      memory().set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), ptr);
      const record = encode("SAMPLE_LOAD", {
        sample: id,
        ptr,
        frames: pcm.length / channels,
        channels,
        rate,
      });
      // The same patch the worklet makes; here the pointer is already known, so this only proves the offset.
      new DataView(record.buffer).setUint32(fieldOffset(COMMANDS.SAMPLE_LOAD, "ptr"), ptr, true);
      queue.push(record);
    },
    render(frames) {
      const left = new Float32Array(frames);
      const right = new Float32Array(frames);
      for (let done = 0; done < frames; ) {
        const n = Math.min(LIMITS.MAX_BLOCK, frames - done);
        const ptr = core.process(n, flush());
        const audio = new Float32Array(core.memory.buffer, ptr, 2 * n);
        left.set(audio.subarray(0, n), done);
        right.set(audio.subarray(n), done);
        const size = core.evt_len();
        if (size > 0) events.push(...decodeEvents(memory().slice(core.evt_buf(), core.evt_buf() + size)));
        done += n;
      }
      return [left, right];
    },
    events() {
      const out = events;
      events = [];
      return out;
    },
    memoryBytes: () => core.memory.buffer.byteLength,
  };
}

/** A sine as 16-bit mono PCM: `seconds` of `hz` at `sampleRate`, peaking at `level` (0..1). */
export function sinePcm(hz: number, seconds: number, sampleRate = 48000, level = 0.5): Int16Array {
  const pcm = new Int16Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < pcm.length; i++)
    pcm[i] = Math.round(Math.sin((2 * Math.PI * hz * i) / sampleRate) * level * 32767);
  return pcm;
}

/** The largest absolute sample. */
export function peak(samples: Float32Array): number {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  return max;
}

/** The root mean square of the samples. */
export function rms(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}
