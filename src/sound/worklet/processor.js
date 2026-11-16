// The worklet processor of watchpot/sound: the DSP core (dsp/, as WebAssembly) behind one AudioWorkletProcessor.
// Plain JavaScript with no imports: `bun run dsp` embeds this file as a string (`PROCESSOR_SOURCE`, with a
// `LIMITS` constant in front of it) and the shell adds it to the AudioWorklet from a Blob URL.
//
// processorOptions:
//   bytes   the WebAssembly module (decoded on the main thread: this scope may have no `atob`)
//   voices  the size of the voice pool
//   clock   { record, at }: a CLOCK_SET record and the byte offset of its `frame` field; on the first block the
//           processor writes `currentFrame` there and sends it, so the core counts the context's own frames
//
// Messages in:
//   { records }          an ArrayBuffer of command records, sent to the core before the next block
//   { pcm, record, at }  a sample: 16-bit interleaved PCM (an Int16Array), its SAMPLE_LOAD record and the byte
//                        offset of the record's `ptr` field; the PCM is copied into the core's memory and the
//                        record is sent with the pointer filled in
// Messages out:
//   { events }           an ArrayBuffer of event records, when a block wrote any
//   { failed }           a string: a sample the core had no memory for
class WatchpotCore extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { bytes, voices, clock } = options.processorOptions;
    // The constructor cannot await: compile and instantiate synchronously.
    this.core = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports;
    this.core.init(sampleRate, voices ?? 64);
    /** Record buffers waiting for the next block, oldest first. */
    this.queue = [];
    this.clock = clock ?? null;
    this.port.onmessage = (event) => this.receive(event.data);
  }

  /** The core's memory as bytes. A view dies when the memory grows, so it is never kept. */
  bytes() {
    return new Uint8Array(this.core.memory.buffer);
  }

  receive(message) {
    if (message.records) {
      this.queue.push(new Uint8Array(message.records));
      return;
    }
    if (message.pcm) {
      const pcm = message.pcm;
      const ptr = this.core.alloc(pcm.byteLength);
      if (ptr === 0) {
        this.port.postMessage({ failed: "out of memory" });
        return;
      }
      this.bytes().set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), ptr);
      const record = new Uint8Array(message.record);
      new DataView(record.buffer).setUint32(message.at, ptr, true);
      this.queue.push(record);
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const left = out[0];
    const right = out[1] ?? out[0];
    const core = this.core;

    if (this.clock) {
      const record = new Uint8Array(this.clock.record);
      new DataView(record.buffer).setUint32(this.clock.at, currentFrame, true);
      this.queue.unshift(record);
      this.clock = null;
    }

    // As many whole buffers as fit; the rest wait a block. One larger than the buffer can never fit: dropped.
    let length = 0;
    if (this.queue.length) {
      const memory = this.bytes();
      const at = core.cmd_buf();
      while (this.queue.length) {
        const next = this.queue[0];
        if (next.length > LIMITS.CMD_CAP) {
          this.queue.shift();
          continue;
        }
        if (length + next.length > LIMITS.CMD_CAP) break;
        memory.set(next, at + length);
        length += next.length;
        this.queue.shift();
      }
    }

    for (let done = 0; done < left.length; ) {
      const frames = Math.min(LIMITS.MAX_BLOCK, left.length - done);
      const ptr = core.process(frames, done === 0 ? length : 0);
      const audio = new Float32Array(core.memory.buffer, ptr, 2 * frames);
      left.set(audio.subarray(0, frames), done);
      if (right !== left) right.set(audio.subarray(frames), done);
      const size = core.evt_len();
      if (size > 0) {
        const events = this.bytes().slice(core.evt_buf(), core.evt_buf() + size).buffer;
        this.port.postMessage({ events }, [events]);
      }
      done += frames;
    }
    return true;
  }
}

registerProcessor("watchpot-core", WatchpotCore);
