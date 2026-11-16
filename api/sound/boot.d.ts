import { type SoundEvent } from "./protocol";
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
/** True where the core can run: an AudioWorklet on the context, and WebAssembly. */
export declare function coreSupported(context: BaseAudioContext): boolean;
/**
 * Boots the core on `context` (suspended or running) and connects it to the destination. Throws where the core
 * cannot run or the module will not load; a failure after this resolves (the processor's constructor, a trap in
 * `process`) reaches `onError` as fatal.
 */
export declare function bootCore(context: BaseAudioContext, { voices }: {
    voices: number;
}): Promise<BootedCore>;
