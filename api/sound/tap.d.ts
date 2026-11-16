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
/** Builds the tap over the core's `METERS` events. */
export declare function createTap(port: CorePort): Tap;
