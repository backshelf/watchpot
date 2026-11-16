// Sheet one: the engine as an exploded assembly, plotted by `watchpot/shader`, with the page's pitch beside it and a
// drawing's title block under that. The core plate's eight cells light as the page's own store ticks.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createPulse,
  ShaderCanvas,
  type ShaderHandle,
  usePulseUniform,
  useShaderTokens,
} from "watchpot/shader";
import { useMediaQuery } from "watchpot/ui";
import { version } from "../../../package.json";
import { store } from "../app/store";
import { ASSEMBLY, anchorOf, facesOf, fit, type Geometry, PARTS, partAt } from "../shaders/assembly";

const TOKENS = ["--paper", "--ink", "--live"] as const;

/** How wide a label column must be to carry a part's line under its name. */
const ROOMY = 128;

const easeOut = (t: number) => 1 - (1 - t) ** 4;

/** The same drawing without WebGL: the parts' faces as polygons, back to front. */
function Still({ geo }: { geo: Geometry }) {
  return (
    <svg className="fig__still" viewBox={`0 0 ${geo.width} ${geo.height}`} aria-hidden="true">
      {PARTS.map((part) =>
        facesOf(geo, part).map((face, i) => (
          <polygon
            key={`${part.id}-${i}`}
            points={face.map((p) => p.join(",")).join(" ")}
            data-phantom={part.phantom ? "" : undefined}
          />
        )),
      )}
    </svg>
  );
}

export function Hero() {
  const figRef = useRef<HTMLDivElement>(null);
  const handle = useRef<ShaderHandle>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [focus, setFocus] = useState(-1);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const tokens = useShaderTokens(figRef, TOKENS);

  // The drawing is fitted to its box, leaving a column each side for the labels.
  useLayoutEffect(() => {
    const el = figRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 10 || height < 10) return;
      const column = Math.max(72, Math.min(190, width * 0.21));
      const fitted = fit(width - 2 * column, height, 18);
      setGeo({ ...fitted, width, height, ox: width / 2 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The one authored moment: the assembly comes apart as the page arrives.
  const explode = useRef(reduced ? 1 : 0);
  const ready = geo !== null && tokens !== null;
  useEffect(() => {
    if (!ready) return;
    if (reduced) {
      explode.current = 1;
      handle.current?.setUniforms({ u_explode: 1 });
      setOpen(true);
      return;
    }
    let frame = 0;
    const started = performance.now() + 250;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - started) / 1500));
      explode.current = easeOut(t);
      handle.current?.setUniforms({ u_explode: explode.current });
      if (t > 0.55) setOpen(true);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [ready, reduced]);

  // A part in focus is inked in the second colour and the rest stand back.
  const mix = useRef(0);
  const shown = useRef(-1);
  useEffect(() => {
    if (focus >= 0) shown.current = focus;
    const target = focus >= 0 ? 1 : 0;
    if (reduced) {
      mix.current = target;
      handle.current?.setUniforms({ u_focus: shown.current, u_focusMix: target });
      return;
    }
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      mix.current += Math.sign(target - mix.current) * Math.min(Math.abs(target - mix.current), dt / 160);
      handle.current?.setUniforms({ u_focus: shown.current, u_focusMix: mix.current });
      if (mix.current !== target) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [focus, reduced]);

  // The store under this page ticks; each pass runs the eight phases, and the core plate shows one go by.
  const pulse = useMemo(() => createPulse(520, () => performance.now()), []);
  usePulseUniform(handle, pulse, "u_tick");
  useEffect(() => {
    if (reduced) return;
    return store.subscribe((next, prev) => {
      if (next.clock.lastSeen !== prev.clock.lastSeen && pulse.value() < 0.02) pulse.bump();
    });
  }, [pulse, reduced]);

  const pick = useCallback(
    (event: React.PointerEvent) => {
      if (!geo || event.pointerType === "touch") return;
      const box = event.currentTarget.getBoundingClientRect();
      setFocus(partAt(geo, event.clientX - box.left, event.clientY - box.top, explode.current));
    },
    [geo],
  );

  const roomy = geo ? (geo.width - 2 * 0.866 * geo.scale) / 2 - 30 >= ROOMY : true;
  const edge = geo ? 0.866 * geo.scale + 26 : 0;

  return (
    <section className="hero sheet" aria-labelledby="hero-title">
      <div className="hero__words">
        <h1 id="hero-title">The mechanism of an idle game, and none of its look.</h1>
        <p className="hero__lede">
          watchpot is a framework-light engine for idle and incremental games, for Bun, TypeScript and React
          19. It owns the state, the rules, the clock, the saves, the sound and the GPU plumbing. It ships no
          stylesheet, no font and no colour: that part is the game's.
        </p>
        <p className="hero__actions">
          <a className="button button--primary" href="./docs/index.html">
            Read the guide
          </a>
          <a className="button" href="#live">
            Watch it run
          </a>
        </p>

        <div className="hero__foot">
          <div className="notes">
            <h2 className="lettering">Notes</h2>
            <ol>
              <li>Every figure on this page is the engine running, not a recording of it.</li>
              <li>
                The engine never reads the wall clock: the caller passes <code>now</code>.
              </li>
              <li>Numbers are Decimals throughout, past 1e308.</li>
            </ol>
          </div>
          <dl className="titleblock">
            <div className="titleblock__wide">
              <dt className="lettering">Title</dt>
              <dd>watchpot, an idle-game engine</dd>
            </div>
            <div>
              <dt className="lettering">Drawn</dt>
              <dd>an AI model (Claude)</dd>
            </div>
            <div>
              <dt className="lettering">Directed, checked</dt>
              <dd>a person</dd>
            </div>
            <div>
              <dt className="lettering">Rev</dt>
              <dd className="num">{version}</dd>
            </div>
            <div className="titleblock__wide">
              <dd>
                Most of the code was written by an AI model. <a href="#how-made">How this was made</a>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div
        className="fig"
        ref={figRef}
        data-open={open ? "" : undefined}
        data-roomy={roomy ? "" : undefined}
        data-picking={focus >= 0 ? "" : undefined}
        onPointerMove={pick}
        onPointerLeave={() => setFocus(-1)}
        onClick={(event) => {
          if (focus < 0 || (event.target as Element).closest("a")) return;
          const part = PARTS[focus];
          if (part) window.location.assign(part.href.startsWith("#") ? part.href : `./${part.href}`);
        }}
      >
        {geo && tokens && !failed ? (
          <ShaderCanvas
            ref={handle}
            className="fig__canvas"
            fragment={ASSEMBLY}
            uniforms={{
              u_paper: tokens["--paper"],
              u_ink: tokens["--ink"],
              u_live: tokens["--live"],
              u_origin: [geo.ox, geo.height - geo.oy],
              u_scale: geo.scale,
            }}
            dpr={3}
            maxPixels={2_600_000}
            fps={30}
            reduced={reduced}
            reducedTime={4}
            still={<Still geo={geo} />}
            onError={(log) => {
              console.warn(`watchpot site: the assembly shader did not build.\n${log}`);
              setFailed(true);
            }}
          />
        ) : geo ? (
          <Still geo={geo} />
        ) : null}

        {geo ? (
          <>
            <svg className="fig__leaders" viewBox={`0 0 ${geo.width} ${geo.height}`} aria-hidden="true">
              {PARTS.map((part, i) => {
                const [ax, ay] = anchorOf(geo, part);
                const lx = part.side === "left" ? geo.ox - edge : geo.ox + edge;
                return (
                  <g key={part.id} data-focused={focus === i ? "" : undefined}>
                    <path d={`M${ax} ${ay}H${lx}`} />
                    <circle cx={ax} cy={ay} r="2.25" />
                  </g>
                );
              })}
            </svg>
            <ul className="callouts" aria-label="The parts of the engine">
              {PARTS.map((part, i) => {
                const [, ay] = anchorOf(geo, part);
                const inset = geo.width / 2 + edge + 8;
                return (
                  <li
                    key={part.id}
                    className="callout"
                    data-side={part.side}
                    data-focused={focus === i ? "" : undefined}
                    style={part.side === "left" ? { right: inset, top: ay } : { left: inset, top: ay }}
                  >
                    <a
                      href={part.href.startsWith("#") ? part.href : `./${part.href}`}
                      onFocus={() => setFocus(i)}
                      onBlur={() => setFocus(-1)}
                      onPointerEnter={() => setFocus(i)}
                    >
                      <span className="callout__name lettering">{part.name}</span>
                      <span className="callout__entry num">{part.entry}</span>
                      <span className="callout__line">{part.line}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  );
}
