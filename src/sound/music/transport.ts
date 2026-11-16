/**
 * The transport as a game sees it: tempo, bars, start and stop, where it is now, and a call on every beat.
 *
 * The core keeps the clock (`TRANSPORT_SET` sets it, a `BEAT` event says where it is); the main thread keeps a copy
 * anchored on the last beat it heard and extrapolated along the context's own frames, so `position()` moves between
 * events and the music can stamp a record with the frame of the next grid line.
 */
import type { CorePort } from "../port";
import { encode, TRANSPORT_RUN } from "../protocol";
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

/** Each grid line's spacing, in beats. */
const LINE_BEATS: Readonly<Record<Exclude<Grid, "off" | "bar">, number>> = {
  "4": 1,
  "8": 0.5,
  "16": 0.25,
  "32": 0.125,
};

export function createTransport(port: CorePort): TransportCore {
  let bpm = 120;
  let beatsPerBar = 4;
  let swing = 0;
  let running = false;
  /** Where the clock was at one frame: beats since bar 0 beat 0. Moved by every beat the core reports. */
  let anchor = { frame: 0, beats: 0 };
  const beating = new Set<(beat: { bar: number; beat: number }) => void>();

  const framesPerBeat = () => (port.rate() * 60) / bpm;
  /** Beats since the start at a context frame: extrapolated while running, held while stopped. */
  const beatsAt = (frame: number) =>
    running ? Math.max(0, anchor.beats + (frame - anchor.frame) / framesPerBeat()) : anchor.beats;
  /** Re-anchors on now, so a change of tempo or metre keeps the phase. */
  const reanchor = () => {
    const now = port.frame();
    anchor = { frame: now, beats: beatsAt(now) };
  };
  const send = (run: number) => port.send(encode("TRANSPORT_SET", { bpm, beatsPerBar, swing, running: run }));

  port.listen((event) => {
    if (event.op !== "BEAT") return;
    // An event's frame is the low 32 bits of the core's counter: put it back on the context's whole frame count.
    const now = port.frame();
    const frame = now - ((now - event.frame) | 0);
    anchor = { frame, beats: event.bar * beatsPerBar + event.beat };
    for (const fn of beating) fn({ bar: event.bar, beat: event.beat });
  });

  return {
    api: {
      set(options) {
        reanchor();
        if (options.bpm !== undefined && Number.isFinite(options.bpm) && options.bpm > 0) bpm = options.bpm;
        if (options.beatsPerBar !== undefined && options.beatsPerBar >= 1)
          beatsPerBar = Math.round(options.beatsPerBar);
        if (options.swing !== undefined && Number.isFinite(options.swing))
          swing = Math.min(1, Math.max(0, options.swing));
        send(TRANSPORT_RUN.keep);
      },
      start() {
        if (!running) anchor = { frame: port.frame(), beats: anchor.beats };
        running = true;
        send(TRANSPORT_RUN.start);
      },
      stop() {
        reanchor();
        running = false;
        send(TRANSPORT_RUN.stop);
      },
      running: () => running,
      tempo: () => ({ bpm, beatsPerBar, swing }),
      position() {
        const beats = beatsAt(port.frame());
        const bar = Math.floor(beats / beatsPerBar);
        const beat = Math.min(beatsPerBar - 1, Math.floor(beats - bar * beatsPerBar));
        return { bar, beat, phase: beats - Math.floor(beats) };
      },
      onBeat(fn) {
        beating.add(fn);
        return () => void beating.delete(fn);
      },
    },
    boot: () => send(running ? TRANSPORT_RUN.start : TRANSPORT_RUN.stop),
    bpm: () => bpm,
    beatsPerBar: () => beatsPerBar,
    running: () => running,
    framesPerBeat,
    next(grid) {
      if (!running || grid === undefined || grid === "off") return 0;
      const size = grid === "bar" ? beatsPerBar : LINE_BEATS[grid];
      const now = port.frame();
      const beats = beatsAt(now);
      // A hair of slack so a clock that sits on a line (to rounding) counts as on it, not a whole line early.
      const line = Math.ceil(beats / size - 1e-6) * size;
      return Math.max(now, Math.round(anchor.frame + (line - anchor.beats) * framesPerBeat()));
    },
  };
}
