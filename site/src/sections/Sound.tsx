// The sound sheet: a small instrument on `watchpot/sound`, silent until the visitor turns it on. Three synthesised
// cues on step sequences of the engine's transport (the playhead is the sequencer's own `onStep`), three live settings
// of the Rust core's mixer, single cues and a babble voice, and the master's tap drawn by a shader.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShaderCanvas, type ShaderHandle, useAudioUniforms, useShaderTokens } from "watchpot/shader";
import type { Scale } from "watchpot/sound";
import { Slider, type SliderProps, type TileCell, TileGrid, useMediaQuery } from "watchpot/ui";
import { TAP, TAP_FIGURES } from "../shaders/sound";
import type { Rig } from "./sound/rig";
import {
  type CueKey,
  DEFAULT_MIX,
  DEFAULT_PATTERN,
  DEGREES,
  LINE,
  type MixSettings,
  PRESET_NAMES,
  type PresetName,
  SCALES,
  STEPS,
  TRACKS,
} from "./sound/score";

type Mode = "locked" | "core" | "fallback";

interface Step {
  track: number;
  step: number;
}

const TOKENS = ["--paper-lift", "--ink", "--live"] as const;

/** The filter's cutoff on a 0..100 slider, geometric from 200 Hz to 20 kHz. */
const CUT_LO = 200;
const CUT_HI = 20_000;
const toCutoff = (v: number) => Math.round(CUT_LO * (CUT_HI / CUT_LO) ** (v / 100));
const fromCutoff = (hz: number) => (100 * Math.log(hz / CUT_LO)) / Math.log(CUT_HI / CUT_LO);
const hz = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} kHz` : `${n} Hz`);

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

/** The audition row's voices, the engine's own split by bus: the eight `ui.*`, then the ten `sfx.*`. */
const UI_VOICES = PRESET_NAMES.filter((name) => name.startsWith("ui."));
const SFX_VOICES = PRESET_NAMES.filter((name) => name.startsWith("sfx."));

/** A control: its name, its value in the mono, the engine's slider, and the call it makes. */
function Knob({
  id,
  name,
  shown,
  call,
  ...slider
}: { id: string; name: string; shown: string; call: string } & Omit<SliderProps, "id" | "className">) {
  return (
    <div className="knob">
      <span className="knob__name" id={`${id}-name`}>
        {name}
      </span>
      <span className="num knob__value">{shown}</span>
      <Slider {...slider} className="slide" id={id} aria-labelledby={`${id}-name`} />
      <code className="knob__call">{call}</code>
    </div>
  );
}

/** The tap at rest: the same five ruled columns, empty, hatched. */
function TapStill() {
  return (
    <div className="tap__still" aria-hidden="true">
      {TAP_FIGURES.map((f) => (
        <span key={f} className="hatched" />
      ))}
    </div>
  );
}

export function Sound() {
  const rig = useRef<Rig | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("locked");
  const [muted, setMuted] = useState(false);
  const [pattern, setPattern] = useState(DEFAULT_PATTERN);
  const [heard, setHeard] = useState(DEFAULT_PATTERN);
  const sent = useRef(DEFAULT_PATTERN);
  const [head, setHead] = useState(-1);
  const [position, setPosition] = useState<{ bar: number; beat: number } | null>(null);
  const [bpm, setBpm] = useState(104);
  const [scale, setScale] = useState<Scale>("minorPentatonic");
  const [mix, setMix] = useState<MixSettings>(DEFAULT_MIX);
  const [rung, setRung] = useState(0);
  const [said, setSaid] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [inView, setInView] = useState(false);

  const section = useRef<HTMLElement>(null);
  const tapRef = useRef<HTMLDivElement>(null);
  const handle = useRef<ShaderHandle>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const narrow = useMediaQuery("(max-width: 40rem)");
  const tokens = useShaderTokens(tapRef, TOKENS);

  const onRef = useRef(on);
  onRef.current = on;
  const inViewRef = useRef(inView);
  inViewRef.current = inView;

  // Only what is on screen redraws: the playhead's renders and the tap's frame loop wait while the sheet is away.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A hidden tab stops the transport (the engine leaves that to the page) and starts it again on return.
  useEffect(() => {
    let paused = false;
    const change = () => {
      const r = rig.current;
      if (!r || !onRef.current) return;
      if (document.hidden) {
        r.sound.transport.stop();
        paused = true;
      } else if (paused) {
        paused = false;
        r.sound.transport.start();
      }
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);

  // Leaving the page (or a hot reload) leaves it silent.
  useEffect(
    () => () => {
      const r = rig.current;
      if (!r) return;
      r.sound.transport.stop();
      r.sound.setMuted(true);
    },
    [],
  );

  const press = async () => {
    if (busy) return;
    const current = rig.current;
    if (on && current) {
      current.sound.transport.stop();
      current.sound.setMuted(true);
      setMuted(true);
      setOn(false);
      return;
    }
    setBusy(true);
    let r = current;
    if (!r) {
      // The engine (and the core committed in it) is imported on this press, not with the page.
      const { createRig } = await import("./sound/rig");
      r = createRig(sent.current, { bpm, scale, mix });
      rig.current = r;
      const first = r.tracks[0];
      first?.onStep((index) => {
        if (index === 0) setHeard(sent.current);
        if (inViewRef.current) setHead(index);
      });
      r.sound.transport.onBeat((beat) => {
        if (inViewRef.current) setPosition(beat);
      });
    }
    r.sound.setMuted(false);
    await r.sound.unlock();
    const now = r.sound.mode();
    setMode(now);
    setMuted(r.sound.isMuted());
    if (now === "core") r.sound.transport.start();
    setOn(true);
    setBusy(false);
  };

  const running = on && mode === "core";

  const toggle = useCallback(
    ({ item }: TileCell<Step>) => {
      const next = pattern.map((row, t) =>
        t === item.track ? row.map((v, s) => (s === item.step ? (v ? 0 : 1) : v)) : row,
      );
      setPattern(next);
      sent.current = next;
      const r = rig.current;
      r?.tracks[item.track]?.steps(next[item.track] ?? []);
      // While the clock runs, the core swaps a new pattern in on the next bar line; until then it is marked queued.
      if (!running) setHeard(next);
    },
    [pattern, running],
  );

  const rows = useMemo<Step[][]>(
    () =>
      TRACKS.flatMap((_, track) =>
        narrow
          ? [range(0, 8), range(8, STEPS)].map((half) => half.map((step) => ({ track, step })))
          : [range(0, STEPS).map((step) => ({ track, step }))],
      ),
    [narrow],
  );

  const setTempo = (value: number) => {
    setBpm(value);
    rig.current?.sound.transport.set({ bpm: value });
  };

  const setKey = (value: Scale) => {
    setScale(value);
    rig.current?.sound.harmony.set({ key: "A", scale: value }, "bar");
  };

  const moveMix = (next: Partial<MixSettings>) => {
    setMix((m) => ({ ...m, ...next }));
    const sound = rig.current?.sound;
    if (!sound) return;
    if (next.cutoff !== undefined) sound.mixer.bus("sfx").fx("tone").set("cutoff", next.cutoff, 60);
    if (next.crush !== undefined) sound.mixer.bus("sfx").fx("grit").set("mix", next.crush, 40);
    if (next.size !== undefined) sound.mixer.bus("room").fx("hall").set("size", next.size, 200);
  };

  const play = (cue: CueKey) => {
    const sound = rig.current?.sound;
    if (!sound || !on) return;
    if (cue === "blip") {
      sound.play("blip", { step: rung, mine: true });
      setRung((n) => (n + 1) % 6);
    } else sound.play(cue, { mine: true });
  };

  const playPreset = (name: PresetName) => {
    const sound = rig.current?.sound;
    if (!sound || !on) return;
    sound.play(name, { mine: true });
  };

  const say = () => {
    const r = rig.current;
    if (!r || !on) return;
    setSaid(0);
    r.voice.say(LINE, { onChar: (index) => setSaid(index) });
  };

  useAudioUniforms(handle, running && inView ? rig.current?.sound.tap : null, undefined, reduced);

  const ready = on && !busy;

  return (
    <section className="sheet section" id="sound" aria-labelledby="sound-title" ref={section}>
      <header className="section__head">
        <h2 id="sound-title">A mixer in one worklet.</h2>
        <p className="section__lede">
          The sound engine's graph is its own: a Rust crate built to WebAssembly runs every voice, bus and
          effect, the transport and the sequencer in one AudioWorklet. A voice starts on its frame to the
          sample, everything leaves through a limiter, and where the core cannot run a fallback still plays
          the cues.
        </p>
      </header>

      <div className="plate sound__gate">
        <button
          type="button"
          className={on ? "button sound__power" : "button button--primary sound__power"}
          aria-disabled={busy}
          aria-describedby="sound-gate-note"
          onClick={() => void press()}
        >
          {busy ? "Starting the core" : on ? "Turn the sound off" : "Turn the sound on"}
        </button>
        <div className="sound__reads">
          <div className="field">
            <span>Mode</span>
            <span className="num sound__read" data-live={running ? "" : undefined} role="status">
              {mode}
            </span>
            <code className="sound__call">sound.mode()</code>
          </div>
          <div className="field">
            <span>Muted</span>
            <span className="num sound__read">{String(muted)}</span>
            <code className="sound__call">sound.isMuted()</code>
          </div>
        </div>
        <p className="sound__gatenote" id="sound-gate-note">
          Until this press the page has no AudioContext and no worklet. <code>unlock()</code> adds the core
          from a Blob URL, about 240 KB of WebAssembly before compression; the second press stops the
          transport and mutes.
        </p>
      </div>

      <div className="sound">
        <div className="sound__main">
          <div className="plate">
            <div className="plate__head">
              <h3>Sequence</h3>
              <span className="num sound__pos" aria-hidden="true">
                {position ? `bar ${position.bar + 1} · beat ${position.beat + 1}` : "bar – · beat –"}
              </span>
            </div>
            <div className="plate__body">
              {mode === "fallback" ? (
                <p className="sound__fallback">
                  This browser could not run the core, so the sequencer and the mix have nothing to drive. The
                  single cues below still play their zzfx voices through plain Web Audio.
                </p>
              ) : null}
              <div className="steps__ruler" aria-hidden="true" data-running={running ? "" : undefined}>
                <span />
                {range(0, STEPS).map((s) => (
                  <span
                    key={s}
                    data-beat={s % 4 === 0 ? "" : undefined}
                    data-head={head === s ? "" : undefined}
                  >
                    {s % 4 === 0 ? s / 4 + 1 : ""}
                  </span>
                ))}
              </div>
              <TileGrid<Step>
                className="steps"
                data-narrow={narrow ? "" : undefined}
                data-running={running ? "" : undefined}
                aria-label="Steps: three cues, sixteen steps each"
                aria-describedby="sound-steps-note"
                rows={rows}
                getKey={(c) => `${c.track}-${c.step}`}
                renderRowAside={(_, items) => {
                  const first = items[0];
                  const track = first && first.step === 0 ? TRACKS[first.track] : undefined;
                  return track ? (
                    <>
                      <span className="num steps__cue">{track.cue}</span>
                      <span className="steps__line">{track.line}</span>
                    </>
                  ) : null;
                }}
                rowProps={(_, items) => ({
                  className: "steps__row",
                  "data-second": items[0]?.step ? "" : undefined,
                })}
                cellProps={({ item }) => {
                  const lit = pattern[item.track]?.[item.step] === 1;
                  const was = heard[item.track]?.[item.step] === 1;
                  const cue = TRACKS[item.track]?.cue ?? "";
                  const degree = cue === "blip" ? `, degree ${DEGREES[item.step]}` : "";
                  return {
                    className: "step",
                    "aria-label": `${cue}, step ${item.step + 1}${degree}`,
                    "aria-selected": lit,
                    "data-on": lit ? "" : undefined,
                    "data-queued": running && lit !== was ? "" : undefined,
                    "data-head": head === item.step ? "" : undefined,
                    "data-beat": item.step % 4 === 0 ? "" : undefined,
                  };
                }}
                renderCell={({ item }) =>
                  TRACKS[item.track]?.cue === "blip" && pattern[item.track]?.[item.step] ? (
                    <span className="num step__deg" aria-hidden="true">
                      {DEGREES[item.step]}
                    </span>
                  ) : null
                }
                onActivate={toggle}
              />
              <p className="caption" id="sound-steps-note">
                Arrow keys move, Space toggles a step. Each row is <code>sound.sequence</code> on the
                transport's sixteenth grid; the playhead is the sequencer's own <code>onStep</code>, and a
                changed pattern lands on the next bar line (marked dashed until it does). The blip's digits
                are scale degrees on the harmony clock.
              </p>

              <div className="sound__clock">
                <Knob
                  id="sound-tempo"
                  name="Tempo"
                  shown={`${bpm} bpm`}
                  call="transport.set({ bpm })"
                  min={72}
                  max={144}
                  value={bpm}
                  onValueChange={setTempo}
                  valueText={(v) => `${v} beats a minute`}
                />
                <fieldset className="knob">
                  <legend className="knob__name">Scale</legend>
                  <div className="seg sound__scales">
                    {SCALES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        aria-pressed={scale === s.value}
                        onClick={() => setKey(s.value)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <code className="knob__call">harmony.set({"{ key, scale }"}, "bar")</code>
                </fieldset>
              </div>
            </div>
          </div>

          <div className="plate">
            <div className="plate__head">
              <h3>One cue at a time</h3>
              <code className="sound__count">play(key)</code>
            </div>
            <div className="plate__body sound__pads">
              <div className="sound__padrow">
                <button type="button" className="button" aria-disabled={!ready} onClick={() => play("thump")}>
                  thump
                </button>
                <button type="button" className="button" aria-disabled={!ready} onClick={() => play("blip")}>
                  blip <span className="num">step {rung}</span>
                </button>
                <button type="button" className="button" aria-disabled={!ready} onClick={() => play("tick")}>
                  tick
                </button>
                <button type="button" className="button" aria-disabled={!ready} onClick={say}>
                  Say a line
                </button>
              </div>
              <p className="sound__line">
                <span className="sound__said">{said === null ? "" : LINE.slice(0, said + 1)}</span>
                <span>{said === null ? LINE : LINE.slice(said + 1)}</span>
              </p>
              <p className="caption">
                The blip climbs its cue's <code>ladder: "scale"</code> a step a press. The line is{" "}
                <code>babble</code>: syllables of shaped buzz, printed as each one starts.
              </p>
            </div>
          </div>

          <div className="plate">
            <div className="plate__head">
              <h3>Default voices</h3>
              <code className="sound__count">
                cues: {"{"} coin: "sfx.coin" {"}"}
              </code>
            </div>
            <div className="plate__body sound__pads">
              <div className="sound__padrow">
                {UI_VOICES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="button"
                    aria-disabled={!ready}
                    aria-label={name}
                    onClick={() => playPreset(name)}
                  >
                    {name.slice(name.indexOf(".") + 1)}
                  </button>
                ))}
              </div>
              <div className="sound__padrow">
                {SFX_VOICES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="button"
                    aria-disabled={!ready}
                    aria-label={name}
                    onClick={() => playPreset(name)}
                  >
                    {name.slice(name.indexOf(".") + 1)}
                  </button>
                ))}
              </div>
              <p className="caption">
                The engine's built-in voices: a cue may be just one of these names. <code>ui.*</code> plays on
                the <code>ui</code> bus, the rest on <code>sfx</code>.
              </p>
            </div>
          </div>
        </div>

        <div className="sound__side">
          <div className="plate">
            <div className="plate__head">
              <h3>The tap</h3>
              <code className="sound__count">tap.read()</code>
            </div>
            <div className="plate__body">
              <div className="tap" ref={tapRef}>
                <div className="tap__axis num" aria-hidden="true">
                  <span>−6</span>
                  <span>−36 dBFS</span>
                </div>
                <div className="tap__fig">
                  {tokens && !failed ? (
                    <ShaderCanvas
                      ref={handle}
                      className="tap__canvas"
                      fragment={TAP}
                      uniforms={{
                        u_ground: tokens["--paper-lift"],
                        u_ink: tokens["--ink"],
                        u_live: tokens["--live"],
                      }}
                      dpr={2}
                      maxPixels={360_000}
                      fps={30}
                      paused={!running}
                      reduced={reduced}
                      still={<TapStill />}
                      onError={(log) => {
                        console.warn(`watchpot site: the tap shader did not build.\n${log}`);
                        setFailed(true);
                      }}
                    />
                  ) : (
                    <TapStill />
                  )}
                  <div className="tap__names" aria-hidden="true">
                    {TAP_FIGURES.map((f) => (
                      <span key={f} className="lettering">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <p className="caption">
                The master as five figures, written to the shader each frame by <code>useAudioUniforms</code>{" "}
                with no React render. Level, bass (under 150 Hz), mid and high (over 4 kHz) are RMS on a 30 dB
                scale from −36 dBFS; flux jumps on a transient and falls back over 120 ms.
                {reduced ? " With reduced motion asked for, the meters hold still at rest." : null}
              </p>
            </div>
          </div>

          <div className="plate">
            <div className="plate__head">
              <h3>The mix</h3>
              <code className="sound__count">fx(slot).set(param, value, slewMs)</code>
            </div>
            <div className="plate__body sound__mix">
              <Knob
                id="sound-cutoff"
                name="Filter cutoff"
                shown={hz(mix.cutoff)}
                call={`bus("sfx").fx("tone").set("cutoff", ${mix.cutoff}, 60)`}
                min={0}
                max={100}
                step={0.5}
                value={fromCutoff(mix.cutoff)}
                onValueChange={(v) => moveMix({ cutoff: toCutoff(v) })}
                valueText={(v) => hz(toCutoff(v))}
              />
              <Knob
                id="sound-crush"
                name="Crush mix"
                shown={mix.crush.toFixed(2)}
                call={`bus("sfx").fx("grit").set("mix", ${mix.crush.toFixed(2)}, 40)`}
                min={0}
                max={1}
                step={0.01}
                value={mix.crush}
                onValueChange={(v) => moveMix({ crush: v })}
                valueText={(v) => `${Math.round(v * 100)} percent wet`}
              />
              <Knob
                id="sound-size"
                name="Reverb size"
                shown={mix.size.toFixed(2)}
                call={`bus("room").fx("hall").set("size", ${mix.size.toFixed(2)}, 200)`}
                min={0.05}
                max={0.95}
                step={0.01}
                value={mix.size}
                onValueChange={(v) => moveMix({ size: v })}
                valueText={(v) => v.toFixed(2)}
              />
              <p className="caption">
                A low-pass filter and a crush on the <code>sfx</code> bus, which sends to a reverb on a return
                bus. Each move is a setting of the Rust core's effect, slewed so it does not click.
              </p>
            </div>
          </div>
        </div>
      </div>

      <dl className="tb">
        <div>
          <dt className="lettering">Entry</dt>
          <dd className="num">watchpot/sound</dd>
        </div>
        <div className="tb__wide">
          <dt className="lettering">Recipes</dt>
          <dd>
            <a href="./docs/sound-table.html">A sound table</a>, <a href="./docs/sound-mix.html">the mix</a>,{" "}
            <a href="./docs/sound-music.html">music</a>, <a href="./docs/sound-dsp.html">the instruments</a>
          </dd>
        </div>
      </dl>
    </section>
  );
}
