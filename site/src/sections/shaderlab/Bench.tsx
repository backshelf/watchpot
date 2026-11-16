// The bench: the chosen specimen large on its own ShaderCanvas, its text beside it in an editor that recompiles as
// you type, and three sliders, the pointer and a press that reach the GPU through the canvas's handle, never through
// a render of this figure.
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPulse, ShaderCanvas, type ShaderHandle, usePulseUniform } from "watchpot/shader";
import { Slider } from "watchpot/ui";
import { composedNames, fragmentOf, type Specimen } from "../../shaders/specimens";
import type { Inks } from "./Sheet";
import { Still } from "./Still";

/** The most pixels the bench's canvas draws: past it the pixel ratio drops. */
const BUDGET = 1_200_000;
/** How long after the last key an edit is compiled. */
const SETTLE_MS = 450;

const SCALE = { min: 0.5, max: 2, step: 0.05, text: (v: number) => `×${v.toFixed(2)}` };
const WEIGHT = { min: 0.5, max: 2.5, step: 0.1, text: (v: number) => `×${v.toFixed(1)}` };

const n = (v: number) => Math.round(v).toLocaleString("en");
const lineCount = (text: string) => text.split("\n").length;
/** The lines a driver's log names, after `fixLog`: `ERROR: 0:12: ...`. */
const linesIn = (log: string) => new Set([...log.matchAll(/\b\d+:(\d+):/g)].map((m) => Number(m[1])));

interface Knobs {
  u_scale: number;
  u_amount: number;
  u_weight: number;
  u_press: [number, number];
}

function Knob({
  id,
  label,
  min,
  max,
  step,
  value,
  text,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  text: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const out = useRef<HTMLOutputElement>(null);
  return (
    <div className="slab__knob">
      <label htmlFor={id} className="lettering">
        {label}
      </label>
      <output htmlFor={id} ref={out} className="num">
        {text(value)}
      </output>
      <Slider
        id={id}
        className="slab__slider"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        valueText={text}
        onValueChange={(v) => {
          if (out.current) out.current.textContent = text(v);
          onChange(v);
        }}
      />
    </div>
  );
}

export function Bench({
  specimen,
  inks,
  reduced,
}: {
  specimen: Specimen;
  inks: Inks | null;
  reduced: boolean;
}) {
  const handle = useRef<ShaderHandle>(null);
  const box = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLOListElement>(null);
  const drawnOut = useRef<HTMLElement>(null);
  const budgetOut = useRef<HTMLElement>(null);
  const ratioOut = useRef<HTMLElement>(null);
  const boxOut = useRef<HTMLElement>(null);
  const rendersOut = useRef<HTMLElement>(null);
  const knobs = useRef<Knobs>({
    u_scale: 1,
    u_amount: specimen.amount.value,
    u_weight: 1,
    u_press: [0.5, 0.5],
  });
  const settle = useRef(0);
  const held = useRef(0);
  const commits = useRef(0);

  const [shown, setShown] = useState(specimen.id);
  const [source, setSource] = useState(specimen.source);
  const [edition, setEdition] = useState(0);
  const [lines, setLines] = useState(() => lineCount(specimen.source));
  const [edited, setEdited] = useState(false);
  const [failure, setFailure] = useState<{ fragment: string; log: string } | null>(null);
  const [onScreen, setOnScreen] = useState(false);

  // A new specimen: its own text and its own amount; scale and weight stay where the visitor left them.
  if (shown !== specimen.id) {
    setShown(specimen.id);
    setSource(specimen.source);
    setEdition((e) => e + 1);
    setLines(lineCount(specimen.source));
    setEdited(false);
    knobs.current = { ...knobs.current, u_amount: specimen.amount.value };
  }

  const fragment = useMemo(() => fragmentOf(specimen, source), [specimen, source]);
  const log = failure?.fragment === fragment ? failure.log : null;
  const errorLines = useMemo(() => (log ? linesIn(log) : new Set<number>()), [log]);
  const composed = useMemo(() => composedNames(specimen), [specimen]);

  // Every commit of this figure, counted where the visitor can see it.
  useLayoutEffect(() => {
    commits.current++;
    if (rendersOut.current) rendersOut.current.textContent = String(commits.current);
  });

  const pulse = useMemo(() => createPulse(1400, () => performance.now()), []);
  usePulseUniform(handle, pulse);

  const push = useCallback((values: Partial<Knobs>) => {
    knobs.current = { ...knobs.current, ...values };
    handle.current?.setUniforms(values);
  }, []);

  const press = (x: number, y: number) => {
    push({ u_press: [x, y] });
    if (!reduced) {
      pulse.bump();
      return;
    }
    // Reduced motion: the ring stands still at one place for a moment instead of running out.
    handle.current?.setUniforms({ u_pulse: 0.55 });
    window.clearTimeout(held.current);
    held.current = window.setTimeout(() => handle.current?.setUniforms({ u_pulse: 0 }), 900);
  };

  // The canvas's real drawn size against its box and the budget, read when the box changes or the fragment does.
  const measure = useCallback(() => {
    const canvas = handle.current?.canvas;
    const css = canvas?.getBoundingClientRect();
    const texts: [RefObject<HTMLElement | null>, string][] =
      canvas && css
        ? [
            [drawnOut, `${n(canvas.width)} × ${n(canvas.height)} px`],
            [budgetOut, `${n(canvas.width * canvas.height)} of ${n(BUDGET)} px`],
            [
              ratioOut,
              `${(css.width > 0 ? canvas.width / css.width : 0).toFixed(2)} on a ${devicePixelRatio}x screen`,
            ],
            [boxOut, `${n(css.width)} × ${n(css.height)} CSS px`],
          ]
        : [
            [drawnOut, "nothing: the still is showing"],
            [budgetOut, "–"],
            [ratioOut, "–"],
            [boxOut, "–"],
          ];
    for (const [ref, text] of texts) if (ref.current) ref.current.textContent = text;
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(later);
    ro.observe(el);
    // The pointer is tracked only while the bench is on screen: off it, nothing here draws.
    const io = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)));
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [measure]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new fragment or a failure swaps the canvas
  useEffect(() => {
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [fragment, log, measure]);

  // A new text starts at its top, and so does the gutter.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new textarea is the trigger
  useEffect(() => {
    if (gutter.current) gutter.current.style.translate = "";
  }, [specimen.id, edition]);

  // A pending edit belongs to the specimen it was typed into.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the specimen is the trigger
  useEffect(() => () => window.clearTimeout(settle.current), [specimen.id]);
  useEffect(() => () => window.clearTimeout(held.current), []);

  const take = (text: string) => {
    const count = lineCount(text);
    if (count !== lines) setLines(count);
    const changed = text !== specimen.source;
    if (changed !== edited) setEdited(changed);
  };

  const reset = () => {
    window.clearTimeout(settle.current);
    setSource(specimen.source);
    setEdition((e) => e + 1);
    setLines(lineCount(specimen.source));
    setEdited(false);
  };

  // A deliberate mistake: the first use of u_live in main, misspelled.
  const misspell = () => {
    const el = area.current;
    if (!el) return;
    const at = el.value.indexOf("u_live", el.value.indexOf("void main"));
    if (at < 0) return;
    const text = `${el.value.slice(0, at)}u_lime${el.value.slice(at + "u_live".length)}`;
    el.value = text;
    el.focus();
    el.setSelectionRange(at, at + "u_lime".length);
    window.clearTimeout(settle.current);
    take(text);
    setSource(text);
  };

  const pointAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    press((event.clientX - r.left) / r.width, 1 - (event.clientY - r.top) / r.height);
  };

  const k = knobs.current;
  return (
    <div className="plate slab__bench">
      <div className="plate__head">
        <h3>
          {specimen.name} <span className="slab__benchcall num">{specimen.call}</span>
        </h3>
        <p className="slab__benchnote">
          One ShaderCanvas: its own context, pointer on, at most {n(BUDGET)} px
        </p>
      </div>
      <div className="plate__body slab__benchbody">
        <div className="slab__view">
          <div className="slab__box" ref={box} onPointerDown={pointAt}>
            {inks ? (
              <ShaderCanvas
                ref={handle}
                className="slab__canvas"
                fragment={fragment}
                uniforms={{
                  u_paper: inks["--paper"],
                  u_ink: inks["--ink"],
                  u_live: inks["--live"],
                  ...k,
                }}
                time={specimen.animated ? undefined : 0}
                fps={specimen.fps ?? 0}
                dpr={2}
                maxPixels={BUDGET}
                reduced={reduced}
                reducedTime={specimen.reducedTime}
                pointer={onScreen}
                still={
                  <Still kind={specimen.still}>
                    <span className="slab__stillnote lettering">
                      {log ? "The still: this fragment did not build" : "The still: no WebGL2 here"}
                    </span>
                  </Still>
                }
                onError={(text) => {
                  // The canvas gives way to the still; hand its context back now rather than at garbage collection,
                  // or a run of broken edits holds a context per try (browsers keep about sixteen, then drop the
                  // oldest, which is another figure on this page).
                  handle.current?.canvas
                    ?.getContext("webgl2")
                    ?.getExtension("WEBGL_lose_context")
                    ?.loseContext();
                  setFailure({ fragment, log: text });
                  if (source === specimen.source) {
                    console.warn(`watchpot site: the ${specimen.name} specimen did not build.\n${text}`);
                  }
                }}
              />
            ) : (
              <Still kind={specimen.still} />
            )}
          </div>

          <div className="slab__knobs" key={specimen.id}>
            <Knob
              id="slab-scale"
              label="Scale"
              {...SCALE}
              value={k.u_scale}
              onChange={(v) => push({ u_scale: v })}
            />
            <Knob
              id="slab-amount"
              label={specimen.amount.label}
              min={0}
              max={1}
              step={specimen.amount.step}
              value={k.u_amount}
              text={specimen.amount.text}
              onChange={(v) => push({ u_amount: v })}
            />
            <Knob
              id="slab-weight"
              label="Line"
              {...WEIGHT}
              value={k.u_weight}
              onChange={(v) => push({ u_weight: v })}
            />
            <button type="button" className="button slab__press" onClick={() => press(0.5, 0.5)}>
              Press
            </button>
          </div>

          <dl className="slab__readout">
            <div className="field">
              <dt>Drawn</dt>
              <dd className="num" ref={drawnOut} />
            </div>
            <div className="field">
              <dt>Budget, maxPixels</dt>
              <dd className="num" ref={budgetOut} />
            </div>
            <div className="field">
              <dt>Pixel ratio</dt>
              <dd className="num" ref={ratioOut} />
            </div>
            <div className="field">
              <dt>Box</dt>
              <dd className="num" ref={boxOut} />
            </div>
            <div className="field slab__renders">
              <dt>Renders of this figure</dt>
              <dd>
                <span className="num" ref={rendersOut} />{" "}
                <span className="slab__aside">
                  The sliders, the pointer and Press reach the GPU through the handle's{" "}
                  <code>setUniforms</code>; they do not add to it.
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="slab__editor">
          <div className="slab__edhead">
            <label htmlFor="slab-source" className="lettering">
              The fragment: uniforms and main
            </label>
            <div className="slab__edtools">
              <button type="button" className="button button--small" onClick={misspell}>
                Misspell a uniform
              </button>
              <button type="button" className="button button--small" onClick={reset} disabled={!edited}>
                Reset
              </button>
            </div>
          </div>
          <p className="slab__composed" id="slab-composed">
            Composed in front of line 1:{" "}
            {composed.map((name, i) => (
              <span key={name}>
                {i > 0 ? ", " : null}
                <code>{name}</code>
              </span>
            ))}
            . <code>PLATE</code> is this page's own chunk (<code>hairline</code>, <code>hair</code>,{" "}
            <code>isolines</code>, <code>above</code>, <code>rules</code>, <code>pressRing</code>,{" "}
            <code>pressEdge</code>).
          </p>
          <div className="slab__code" data-failed={log ? "" : undefined}>
            <div className="slab__gutterwrap" aria-hidden="true">
              <ol className="slab__gutter num" ref={gutter}>
                {Array.from({ length: lines }, (_, i) => (
                  <li key={i} data-error={errorLines.has(i + 1) ? "" : undefined}>
                    {i + 1}
                  </li>
                ))}
              </ol>
            </div>
            <textarea
              key={`${specimen.id}-${edition}`}
              id="slab-source"
              ref={area}
              className="slab__textarea"
              defaultValue={source}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              wrap="off"
              aria-describedby="slab-composed slab-log"
              onInput={(event) => {
                const text = event.currentTarget.value;
                take(text);
                window.clearTimeout(settle.current);
                settle.current = window.setTimeout(() => setSource(text), SETTLE_MS);
              }}
              onScroll={(event) => {
                if (gutter.current) gutter.current.style.translate = `0 ${-event.currentTarget.scrollTop}px`;
              }}
            />
          </div>
          <div className="slab__log" id="slab-log" role="status">
            {log ? (
              <>
                <p>
                  <strong>Did not compile.</strong> The canvas shows its still, and <code>onError</code> has
                  the driver's log, its line numbers moved onto this text by the engine's <code>fixLog</code>:
                </p>
                <pre className="num">{log.trim()}</pre>
              </>
            ) : (
              <p>
                Compiles: {lines} lines.{" "}
                {edited
                  ? "Edited; Reset restores the specimen."
                  : "Edit it: it recompiles a moment after you stop."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
