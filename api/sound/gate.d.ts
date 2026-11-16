/**
 * The gesture gate. Browsers start audio suspended until a user gesture, and zzfx creates its AudioContext the
 * moment it is imported, so zzfx is imported lazily (from `unlock()`), once for the page. `armGestures` wires an
 * unlock to every gesture for as long as its cleanup has not run: a gesture while audio runs is a no-op, and a
 * context the OS suspends or interrupts (a backgrounded app, a call) resumes on the next one. While the context is
 * not running every sound is a silent no-op: nothing queues up to blare later.
 */
export type Zzfx = typeof import("zzfx");
/** zzfx and its AudioContext, or null where the page has no AudioContext (a server, happy-dom). */
export declare function loadZzfx(): Promise<Zzfx> | null;
/** Resumes a context that is not running. Refused outside a user activation: the next gesture tries again. */
export declare function resume(context: AudioContext): Promise<void>;
/**
 * Calls `unlock` from every gesture on `target` while `running()` is false, until the returned cleanup runs.
 * Escape never grants activation, so it is left to the next gesture.
 */
export declare function armGestures(target: EventTarget, running: () => boolean, unlock: () => Promise<void>): () => void;
