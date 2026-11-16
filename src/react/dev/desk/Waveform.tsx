/**
 * A recording drawn as its peaks, with the part that is kept between two handles and the fades shaping what is
 * drawn inside it. The handles answer the pointer; the fields beside the waveform are the same values for the keys.
 */
import { type PointerEvent, useEffect, useRef } from "react";
import s from "../SoundDesk.module.css";
import type { Peaks } from "./samples";

export interface WaveformProps {
  peaks: Peaks | null;
  /** The recording's length in seconds. */
  seconds: number;
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  /** Called while a handle is dragged. */
  onChange?: (patch: { start?: number; end?: number }) => void;
}

/** The shortest a kept part can be dragged to, in seconds. */
const SHORTEST = 0.005;

export function Waveform({ peaks, seconds, start, end, fadeIn, fadeOut, onChange }: WaveformProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ start, end, seconds, onChange });
  live.current = { start, end, seconds, onChange };

  useEffect(() => {
    const el = canvas.current;
    const wrap = box.current;
    const win = el?.ownerDocument.defaultView;
    if (!el || !wrap || !win) return;
    const draw = () => {
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const ratio = win.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(wrap.clientWidth * ratio));
      const h = Math.max(1, Math.round(wrap.clientHeight * ratio));
      if (el.width !== w) el.width = w;
      if (el.height !== h) el.height = h;
      ctx.clearRect(0, 0, w, h);
      const style = win.getComputedStyle(el);
      const kept = style.getPropertyValue("--dp-wave").trim() || "#cfd3dc";
      const cut = style.getPropertyValue("--dp-wave-cut").trim() || "#4a4d57";
      const mid = h / 2;
      ctx.fillStyle = cut;
      ctx.fillRect(0, Math.floor(mid), w, 1);
      if (!peaks || seconds <= 0) return;
      const n = peaks.min.length;
      for (let x = 0; x < w; x++) {
        const t = ((x + 0.5) / w) * seconds;
        const b = Math.min(n - 1, Math.floor((x / w) * n));
        const inside = t >= start && t <= end;
        // Inside the kept part the fades shape what is drawn, as they will shape what is heard.
        let gain = 1;
        if (inside) {
          if (fadeIn > 0 && t - start < fadeIn) gain = (t - start) / fadeIn;
          if (fadeOut > 0 && end - t < fadeOut) gain = Math.min(gain, (end - t) / fadeOut);
        }
        const lo = (peaks.min[b] ?? 0) * gain;
        const hi = (peaks.max[b] ?? 0) * gain;
        const top = mid - hi * (mid - 1);
        const bottom = mid - lo * (mid - 1);
        ctx.fillStyle = inside ? kept : cut;
        ctx.fillRect(x, Math.floor(top), 1, Math.max(1, Math.ceil(bottom - top)));
      }
    };
    draw();
    const Observer = (win as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (!Observer) return;
    const watch = new Observer(draw);
    watch.observe(wrap);
    return () => watch.disconnect();
  }, [peaks, seconds, start, end, fadeIn, fadeOut]);

  const timeAt = (e: PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * live.current.seconds;
  };
  const handle = (which: "start" | "end") => ({
    onPointerDown: (e: PointerEvent<HTMLSpanElement>) => {
      if (e.button !== 0 || !live.current.onChange) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    },
    onPointerMove: (e: PointerEvent<HTMLSpanElement>) => {
      if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
      const t = timeAt(e);
      const { start: a, end: b, seconds: len, onChange: change } = live.current;
      if (which === "start") change?.({ start: Math.max(0, Math.min(t, b - SHORTEST)) });
      else change?.({ end: Math.min(len, Math.max(t, a + SHORTEST)) });
    },
  });
  const pct = (t: number) => `${seconds > 0 ? (Math.min(seconds, Math.max(0, t)) / seconds) * 100 : 0}%`;
  return (
    <div ref={box} className={s.wave} data-empty={!peaks || undefined} aria-hidden="true">
      <canvas ref={canvas} className={s.waveCanvas} />
      {peaks && (
        <>
          <span className={s.waveCut} style={{ left: 0, width: pct(start) }} />
          <span className={s.waveCut} style={{ left: pct(end), right: 0 }} />
          <span
            className={s.waveHandle}
            data-which="start"
            style={{ left: pct(start) }}
            {...handle("start")}
          />
          <span className={s.waveHandle} data-which="end" style={{ left: pct(end) }} {...handle("end")} />
        </>
      )}
    </div>
  );
}
