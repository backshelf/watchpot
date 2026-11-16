/**
 * The transport as a game sees it: tempo, bars, start and stop, where it is now, and a call on every beat.
 *
 * The core keeps the clock (`TRANSPORT_SET` sets it, a `BEAT` event says where it is); the main thread keeps a copy
 * anchored on the last beat it heard and extrapolated along the context's own frames, so `position()` moves between
 * events and the music can stamp a record with the frame of the next grid line.
 */
import type { CorePort } from "../port";
import type { Grid, Transport } from "../types";
/** The transport as `engine.ts` and the music hold it. */
export interface TransportCore {
    /** What a game sees: `sound.transport`. */
    api: Transport;
    /** Sends the tempo and whether it runs. Called each time the core comes up. */
    boot(): void;
    bpm(): number;
    beatsPerBar(): number;
    running(): boolean;
    /** The context's frames in one beat at the tempo now. */
    framesPerBeat(): number;
    /**
     * The context frame of the next line of `grid` (a frame to stamp a record with), or 0 (now) for `"off"`, for no
     * grid, and while the transport is stopped. Lines are counted straight, without swing.
     */
    next(grid: Grid | undefined): number;
}
export declare function createTransport(port: CorePort): TransportCore;
