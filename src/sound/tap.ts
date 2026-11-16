/**
 * The tap: what the master sounds like right now, as five numbers a page can draw with.
 *
 * It reads the core's `METERS` events (about 60 a second): the master's RMS and its three bands, each put on a 30 dB
 * scale from `FLOOR_DB` (0) to `FLOOR_DB + 30` (1). `flux` is the rise between two events, summed over the bands:
 * it jumps on a transient and falls back to 0 over 120 ms of the context's clock. With no event lately (the core is
 * down, or the context is suspended) every figure reads 0.
 */
import type { CorePort } from "./port";
import type { Tap } from "./types";

/** RMS in dBFS that reads 0; 30 dB above it reads 1. A loud, limited mix sits near the top. */
const FLOOR_DB = -36;
const RANGE_DB = 30;
/** Seconds `flux` takes to fall from 1 to 0. */
const FLUX_DECAY = 0.12;
/** A summed rise of this much (on the 0..1 scales) between two events is a full transient. */
const FLUX_FULL = 0.25;
/** Seconds after the last event that the figures are still believed. */
const STALE = 0.25;

/** A linear RMS on the 0..1 scale. */
const scale = (rms: number): number => {
  if (!(rms > 0) || !Number.isFinite(rms)) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db - FLOOR_DB) / RANGE_DB));
};

/** Builds the tap over the core's `METERS` events. */
export function createTap(port: CorePort): Tap {
  let level = 0;
  let bass = 0;
  let mid = 0;
  let high = 0;
  /** When the last event came, and the flux's last jump: how high and when. */
  let heard = Number.NEGATIVE_INFINITY;
  let jump = 0;
  let jumpAt = 0;

  const fluxAt = (t: number): number => Math.max(0, jump * (1 - (t - jumpAt) / FLUX_DECAY));

  port.listen((event) => {
    if (event.op !== "METERS") return;
    const t = port.time();
    const fresh = t - heard <= STALE;
    const next = [scale(event.bands[0] ?? 0), scale(event.bands[1] ?? 0), scale(event.bands[2] ?? 0)];
    // The rise only counts against figures that are still current, or the first event after a silence is a jump.
    const rise = fresh
      ? Math.max(0, (next[0] ?? 0) - bass) +
        Math.max(0, (next[1] ?? 0) - mid) +
        Math.max(0, (next[2] ?? 0) - high)
      : 0;
    const now = fluxAt(t);
    const hit = Math.min(1, rise / FLUX_FULL);
    if (hit > now) {
      jump = hit;
      jumpAt = t;
    }
    level = scale(event.rms[0] ?? 0);
    [bass, mid, high] = next as [number, number, number];
    heard = t;
  });

  return {
    read() {
      const t = port.time();
      if (!port.up() || t - heard > STALE) return { level: 0, bass: 0, mid: 0, high: 0, flux: 0 };
      return { level, bass, mid, high, flux: fluxAt(t) };
    },
  };
}
