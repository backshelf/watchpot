/**
 * When an event runs. A fixed window, repeating cycles from an epoch, or a rolling cycle that starts on the
 * profile's first open and restarts when it ends.
 */
export type EventSchedule =
  | { kind: "fixed"; start: number; end: number }
  /** Cycles of `durationMs` from `epoch`, with an optional gap between cycles. */
  | { kind: "repeating"; epoch: number; durationMs: number; gapMs?: number }
  /** Runs `durationMs` from the profile's first open (the runtime's `cycleStart`) and restarts when it ends. */
  | { kind: "rolling"; durationMs: number };

/** A resolved window: its start, end and whether it is active. */
export interface EventWindow {
  start: number;
  end: number;
  /** False in the gap between cycles or outside a fixed window. */
  active: boolean;
}

/**
 * The window that covers `now`, or the next one when `now` falls in a gap (then `active` is false).
 * A rolling schedule needs `anchor`, the runtime's `cycleStart`; without one, or past its end, it starts now.
 */
export function resolveWindow(schedule: EventSchedule, now: number, anchor?: number): EventWindow {
  if (schedule.kind === "rolling") {
    const start = anchor !== undefined && now < anchor + schedule.durationMs ? anchor : now;
    return { start, end: start + schedule.durationMs, active: true };
  }
  if (schedule.kind === "fixed") {
    return { start: schedule.start, end: schedule.end, active: now >= schedule.start && now < schedule.end };
  }
  const period = schedule.durationMs + (schedule.gapMs ?? 0);
  if (period <= 0) return { start: schedule.epoch, end: schedule.epoch, active: false };
  const cycle = Math.floor((now - schedule.epoch) / period);
  const start = schedule.epoch + cycle * period;
  const end = start + schedule.durationMs;
  if (now < schedule.epoch)
    return { start: schedule.epoch, end: schedule.epoch + schedule.durationMs, active: false };
  if (now < end) return { start, end, active: true };
  return { start: start + period, end: start + period + schedule.durationMs, active: false };
}
