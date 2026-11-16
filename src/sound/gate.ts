/// <reference path="./zzfx.d.ts" />
/**
 * The gesture gate. Browsers start audio suspended until a user gesture, and zzfx creates its AudioContext the
 * moment it is imported, so zzfx is imported lazily (from `unlock()`), once for the page. `armGestures` wires an
 * unlock to every gesture for as long as its cleanup has not run: a gesture while audio runs is a no-op, and a
 * context the OS suspends or interrupts (a backgrounded app, a call) resumes on the next one. While the context is
 * not running every sound is a silent no-op: nothing queues up to blare later.
 */

export type Zzfx = typeof import("zzfx");

/** The gestures that may carry user activation: on touch it is pointerup or touchend, not pointerdown. */
const GESTURES = ["pointerdown", "pointerup", "touchend", "keydown", "click"] as const;

/** zzfx, imported once for the page: it builds its one AudioContext on import. */
let loading: Promise<Zzfx> | null = null;

/** zzfx and its AudioContext, or null where the page has no AudioContext (a server, happy-dom). */
export function loadZzfx(): Promise<Zzfx> | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  loading ??= import("zzfx");
  return loading;
}

/** Resumes a context that is not running. Refused outside a user activation: the next gesture tries again. */
export async function resume(context: AudioContext): Promise<void> {
  if (context.state === "running") return;
  try {
    await context.resume();
  } catch {
    // Refused outside a user activation; the next gesture tries again.
  }
}

/**
 * Calls `unlock` from every gesture on `target` while `running()` is false, until the returned cleanup runs.
 * Escape never grants activation, so it is left to the next gesture.
 */
export function armGestures(
  target: EventTarget,
  running: () => boolean,
  unlock: () => Promise<void>,
): () => void {
  const on = (event: Event) => {
    if (running()) return;
    if (event.type === "keydown" && (event as KeyboardEvent).key === "Escape") return;
    void unlock();
  };
  for (const type of GESTURES) target.addEventListener(type, on, true);
  return () => {
    for (const type of GESTURES) target.removeEventListener(type, on, true);
  };
}
