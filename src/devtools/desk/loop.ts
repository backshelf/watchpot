/**
 * The desk's animation frame: meters, gain reduction, the master's loudness and the sources' lights, read from the
 * desk and written straight to the elements that registered, on the desk window's own `requestAnimationFrame`.
 * Nothing here touches React state, so 60 Hz of meters costs no render.
 */
import type { Desk } from "../../sound/desk";
import { dbScale, fmtDb, toDb } from "./scale";

/** The meters' throw, which is the level fader's: a meter's 0 dB sits beside the fader's. */
export const METER_SCALE = dbScale(-60, 6);
const FLOOR_DB = -60;
/** How fast a meter's bar falls back, dB per second (peak and RMS), and how long the hold line holds. */
const PEAK_FALL = 26;
const RMS_FALL = 14;
const HOLD_MS = 1200;
/** A reduction bar's whole length in dB, and how fast it lets go, dB per second. */
export const REDUCTION_DB = 20;
const REDUCTION_FALL = 30;
/** Figures are read by a person: a few times a second is plenty. */
const TEXT_MS = 180;
const FLASH_MS = 110;
const GLOW_MS = 2200;

export interface MeterEls {
  bus: string;
  orient: "v" | "h";
  peak: HTMLElement;
  rms: HTMLElement;
  hold: HTMLElement;
  /** The highest peak since its reset, as a figure (red at 0 dB and over). */
  readout?: HTMLElement;
}

/** A bus's gain reduction, drawn as a bar that grows from its start, with an optional figure. */
export interface ReductionEls {
  bus: string;
  /** `"down"` grows from the top of a strip's meter; `"across"` from the left of a device's. */
  orient: "down" | "across";
  bar: HTMLElement;
  text?: HTMLElement;
}

interface BusState {
  peak: number;
  rms: number;
  hold: number;
  holdAt: number;
  max: number;
  reduction: number;
}

interface LightState {
  lastAt: number;
  flashAt: number;
  written: string;
}

export class DeskLoop {
  readonly meters = new Set<MeterEls>();
  readonly reductions = new Set<ReductionEls>();
  readonly lights = new Map<string, HTMLElement>();
  readonly lufs = new Set<HTMLElement>();
  private readonly bus = new Map<string, BusState>();
  private readonly light = new Map<string, LightState>();
  private readonly written = new WeakMap<HTMLElement, string>();
  private frame = 0;
  private last = 0;
  private textAt = 0;
  private win: Window | null = null;

  constructor(private readonly desk: Desk) {}

  /** Runs on `win`'s frames (the desk's own window: a hidden opener's frames would stall). */
  start(win: Window): void {
    if (this.win) return;
    this.win = win;
    const step = (t: number) => {
      if (this.win !== win) return;
      this.tick(t);
      this.frame = win.requestAnimationFrame(step);
    };
    this.frame = win.requestAnimationFrame(step);
  }

  stop(): void {
    this.win?.cancelAnimationFrame(this.frame);
    this.win = null;
  }

  /** Clears a bus's highest-peak figure (a click on it). */
  resetMax(bus: string): void {
    const s = this.bus.get(bus);
    if (s) s.max = Number.NEGATIVE_INFINITY;
  }

  private set(el: HTMLElement, prop: "clipPath" | "bottom" | "left", value: string) {
    const key = `${prop}:${value}`;
    if (this.written.get(el) === key) return;
    this.written.set(el, key);
    el.style[prop] = value;
  }

  private text(el: HTMLElement, value: string, tone?: string) {
    if (el.textContent !== value) el.textContent = value;
    if (tone !== undefined && el.dataset.tone !== tone) el.dataset.tone = tone;
  }

  tick(t: number): void {
    const dt = this.last ? Math.min(0.25, (t - this.last) / 1000) : 0;
    this.last = t;
    const read = this.desk.meters();
    for (const [name, m] of Object.entries(read.buses)) {
      const peak = Math.max(FLOOR_DB, toDb(m.peak));
      const rms = Math.max(FLOOR_DB, toDb(m.rms));
      let s = this.bus.get(name);
      if (!s) {
        s = { peak, rms, hold: peak, holdAt: t, max: peak, reduction: 0 };
        this.bus.set(name, s);
      }
      s.peak = Math.max(peak, s.peak - PEAK_FALL * dt);
      s.rms = Math.max(rms, s.rms - RMS_FALL * dt);
      s.reduction = Math.max(m.reduction || 0, s.reduction - REDUCTION_FALL * dt);
      if (peak >= s.hold || t - s.holdAt > HOLD_MS) {
        s.hold = peak;
        s.holdAt = t;
      }
      if (toDb(m.peak) > s.max) s.max = toDb(m.peak);
    }
    const texts = t - this.textAt >= TEXT_MS;
    if (texts) this.textAt = t;
    const cut = (p: number) => `${((1 - p) * 100).toFixed(1)}%`;
    for (const el of this.meters) {
      const s = this.bus.get(el.bus);
      const pos = (db: number) => (s ? METER_SCALE.toPos(db) : 0);
      const clip = (p: number) => (el.orient === "v" ? `inset(${cut(p)} 0 0 0)` : `inset(0 ${cut(p)} 0 0)`);
      this.set(el.peak, "clipPath", clip(pos(s?.peak ?? FLOOR_DB)));
      this.set(el.rms, "clipPath", clip(pos(s?.rms ?? FLOOR_DB)));
      const hold = s && s.hold > FLOOR_DB ? pos(s.hold) : 0;
      this.set(el.hold, el.orient === "v" ? "bottom" : "left", `${(hold * 100).toFixed(1)}%`);
      el.hold.dataset.on = hold > 0 ? "true" : "false";
      if (texts && el.readout) {
        const max = s?.max ?? Number.NEGATIVE_INFINITY;
        this.text(el.readout, max <= FLOOR_DB ? "−∞" : fmtDb(max), max >= 0 ? "clip" : "");
      }
    }
    for (const el of this.reductions) {
      const db = this.bus.get(el.bus)?.reduction ?? 0;
      const p = Math.min(1, db / REDUCTION_DB);
      this.set(
        el.bar,
        "clipPath",
        el.orient === "down" ? `inset(0 0 ${cut(p)} 0)` : `inset(0 ${cut(p)} 0 0)`,
      );
      if (texts && el.text)
        this.text(el.text, db < 0.05 ? "0.0" : `−${db.toFixed(1)}`, db >= 0.05 ? "on" : "");
    }
    if (texts) {
      const value = read.lufs <= -70 || !Number.isFinite(read.lufs) ? "−∞" : fmtDb(read.lufs);
      for (const el of this.lufs) this.text(el, value);
    }
    if (this.lights.size) this.lightUp(t);
  }

  private lightUp(t: number) {
    for (const ch of this.desk.channels()) {
      const el = this.lights.get(ch.id);
      if (!el) continue;
      let s = this.light.get(ch.id);
      if (!s) {
        // First sight is not a start: no flash for what sounded before the window looked.
        s = { lastAt: ch.lastAt, flashAt: Number.NEGATIVE_INFINITY, written: "" };
        this.light.set(ch.id, s);
      } else if (ch.lastAt !== s.lastAt) {
        s.lastAt = ch.lastAt;
        s.flashAt = t;
      }
      const since = t - s.flashAt;
      const state = since < FLASH_MS ? "flash" : ch.sounding ? "on" : since < GLOW_MS ? "glow" : "off";
      // The after-glow fades in steps of a tenth: enough to read "a moment ago", few enough writes.
      const glow = state === "glow" ? (1 - since / GLOW_MS).toFixed(1) : "";
      const key = `${state}${glow}`;
      if (s.written === key) continue;
      s.written = key;
      el.dataset.state = state;
      el.style.opacity = glow ? String(0.25 + 0.75 * Number(glow)) : "";
    }
  }
}
