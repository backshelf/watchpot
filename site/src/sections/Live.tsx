// Sheet two: a whole (small) idle game on the engine's store, ticking in this page and saved in this browser. The
// engine's own auto-player holds the controls until the visitor takes them. Beside it, what the engine is doing:
// the clock, the pass's steps, the save as text.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Decimal,
  type FmtOptions,
  fmtPlayed,
  formatter,
  NOTATIONS,
  type Notation,
  resolvedSteps,
} from "watchpot/core";
import { awayGains, useAwayReport, warpClock } from "watchpot/react";
import { autoPlayer } from "watchpot/sim";
import { BuyAmount, type BuyMode, buyCount, ConfirmPress, Pressable, Progress } from "watchpot/ui";
import { store, useGameView } from "../app/store";
import { HEAT, heat, MILESTONES, pressureBonus, type ToyState, toy, ventNow } from "../game/toy";

const MODES = [
  { value: 1, label: "×1" },
  { value: 10, label: "×10" },
  { value: "next", label: "next" },
  { value: "max", label: "max" },
] as const satisfies readonly { value: BuyMode; label: string }[];

const WARPS = [
  { ms: 60_000, label: "+1 min", words: "one minute" },
  { ms: 3_600_000, label: "+1 h", words: "one hour" },
  { ms: 8 * 3_600_000, label: "+8 h", words: "eight hours" },
] as const;

const STEPS = resolvedSteps(toy, "tick");

const player = autoPlayer(toy, { balance: (s: ToyState) => s.wallet.steam });

/** The next owned count that multiplies a source, and the one before it. */
function milestoneSpan(owned: number): [number, number] | null {
  let from = 0;
  for (const m of MILESTONES) {
    if (owned < m.at) return [from, m.at];
    from = m.at;
  }
  return null;
}

interface Away {
  ms: number;
  steam: Decimal | null;
}

export function Live() {
  const s = useGameView();
  const [mode, setMode] = useState<BuyMode>(1);
  const [notation, setNotation] = useState<Notation>("suffix");
  const [auto, setAuto] = useState(true);
  const [save, setSave] = useState("");
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const f = useMemo(() => {
    const options: FmtOptions = { notation };
    return formatter(options);
  }, [notation]);

  // Attract mode: the engine's auto-player looks at the game the way the sim does, and lifts the lid between looks.
  useEffect(() => {
    if (!auto) return;
    const look = setInterval(() => player.look(store), 1400);
    const press = setInterval(() => store.getState().lid.press(), 380);
    return () => {
      clearInterval(look);
      clearInterval(press);
    };
  }, [auto]);

  // The save as the store would write it, read once a second.
  useEffect(() => {
    const read = () => setSave(store.getState().exportProfile());
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, []);

  const away = useAwayReport<ToyState, Away>(
    ({ before, after, ms }) => ({
      ms,
      steam: awayGains(before, after, { steam: (state) => state.wallet.steam })[0]?.gain ?? null,
    }),
    { minMs: 30_000 },
  );

  const rate = s.heat.perSecond.steam;
  const gain = ventNow(s);
  const bonus = pressureBonus(s.valve.lifetime);
  const takeOver = () => setAuto(false);

  return (
    <section className="sheet section" id="live" aria-labelledby="live-title">
      <header className="section__head">
        <h2 id="live-title">A game is running in this page.</h2>
        <p className="section__lede">
          Three features on one store: a wallet, a list of heat sources and a valve that resets the run. It
          has been ticking since the page opened, it saves to this browser, and a reload credits the time you
          were gone. The engine's auto-player has the controls until you take them.
        </p>
      </header>

      <div className="live">
        <div
          className="plate live__game"
          ref={panel}
          onPointerDownCapture={takeOver}
          onKeyDownCapture={takeOver}
        >
          <div className="plate__head">
            <h3>The pot</h3>
            <p className="live__who" role="status">
              {auto ? "The auto-player is playing" : "You are playing"}
            </p>
          </div>
          <div className="plate__body">
            <div className="live__top">
              <div className="field">
                <span>Steam</span>
                <span className="readout">{f.num(s.wallet.steam)}</span>
                <span className="num live__rate">{f.rate(rate ?? 0)}</span>
              </div>
              <Pressable
                className="button button--primary live__lid"
                onPress={() => store.getState().lid.press()}
              >
                Lift the lid
              </Pressable>
            </div>

            <p className="live__how">
              A press of the lid pays a tenth of a second of the pot's own output, and never less than 1.
            </p>

            <div className="live__listhead">
              <h4 className="lettering">Heat</h4>
              <BuyAmount
                className="seg"
                aria-label="How many to buy"
                options={MODES}
                value={mode}
                onValueChange={setMode}
              />
            </div>
            <ul className="live__list">
              {HEAT.map((g) => {
                const owned = heat.select.owned(s, g.id);
                const affordable = heat.select.affordable(s, g.id);
                const untilNext = heat.select.untilMilestone(s, g.id) ?? 0;
                const count = buyCount(mode, { affordable, untilNext });
                const priced = Math.max(1, mode === "max" ? count : mode === "next" ? untilNext || 1 : mode);
                const can = count > 0 && (mode === "max" || mode === "next" ? true : affordable >= mode);
                const span = milestoneSpan(owned);
                const buy = () => {
                  const actions = store.getState().heat;
                  if (mode === "max") actions.buyMax(g.id);
                  else if (mode === "next") actions.buyNext(g.id);
                  else actions.buy(g.id, mode);
                };
                return (
                  <li key={g.id} className="source">
                    <span className="source__owned num">
                      {owned}
                      <span className="visually-hidden"> owned</span>
                    </span>
                    <div className="source__what">
                      <strong>{g.name}</strong>
                      <span>{owned > 0 ? f.rate(heat.select.rate(s, g.id)) : g.line}</span>
                      {span ? (
                        <Progress
                          className="bar"
                          value={owned - span[0]}
                          max={span[1] - span[0]}
                          aria-label={`${g.name}: towards ${span[1]} owned`}
                          valueText={`${owned} of ${span[1]}`}
                        />
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={can ? "button source__buy" : "button source__buy hatched"}
                      aria-disabled={!can}
                      onClick={can ? buy : undefined}
                    >
                      <span className="num">×{priced}</span>
                      <span className="num">{f.num(heat.select.price(s, g.id, priced))}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="live__valve">
              <div className="field">
                <span>Valve</span>
                <span>
                  Vented {s.valve.runs} {s.valve.runs === 1 ? "time" : "times"}. Everything under the pot
                  makes <span className="num">{f.times(bonus)}</span>.
                </span>
              </div>
              <ConfirmPress
                className={gain.gt(0) ? "button" : "button hatched"}
                aria-disabled={!gain.gt(0)}
                onConfirm={() => store.getState().valve.vent()}
                disabled={!gain.gt(0)}
              >
                {(armed) => (armed ? "Press again: the run starts over" : `Vent for ${f.num(gain)} pressure`)}
              </ConfirmPress>
            </div>
            {auto ? null : (
              <button type="button" className="live__handback" onClick={() => setAuto(true)}>
                Hand the controls back to the auto-player
              </button>
            )}
          </div>
        </div>

        <div className="live__engine">
          <div className="plate">
            <div className="plate__head">
              <h3>The clock</h3>
              <div className="seg">
                {WARPS.map((w) => (
                  <button
                    key={w.ms}
                    type="button"
                    aria-label={`Skip ahead ${w.words}`}
                    onClick={() => warpClock(store, w.ms)}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="plate__body live__clock">
              <div className="field">
                <span>Played</span>
                <span className="num">{fmtPlayed(s.clock.lastSeen - s.clock.createdAt)}</span>
              </div>
              <div className="field">
                <span>Ahead of the wall</span>
                <span className="num">{s.clock.offsetMs > 0 ? fmtPlayed(s.clock.offsetMs) : "0s"}</span>
              </div>
              <p className="live__note">
                Skipping ahead moves the game's clock, never the wall's. The running clock sees the gap and
                catches up, exactly as it does when you come back tomorrow.
              </p>
              {away.report ? (
                <p className="live__away is-live" role="status">
                  Away {fmtPlayed(away.report.ms)}
                  {away.report.steam ? <>: the pot made {f.num(away.report.steam)} steam</> : null}.{" "}
                  <button type="button" onClick={away.dismiss}>
                    Noted
                  </button>
                </p>
              ) : null}
            </div>
          </div>

          <div className="plate">
            <div className="plate__head">
              <h3>One pass</h3>
              <span className="num live__count">{STEPS.length} steps</span>
            </div>
            <ol className="plate__body live__steps num">
              {STEPS.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ol>
          </div>

          <div className="plate">
            <div className="plate__head">
              <h3>The save</h3>
              <span className="num live__count">{new Blob([save]).size.toLocaleString("en")} bytes</span>
            </div>
            <div className="plate__body live__save">
              {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a region that scrolls must take focus to be scrolled by keyboard */}
              <pre tabIndex={0}>
                <code>{save}</code>
              </pre>
              <p className="caption">
                The store's own export, as it would be written: a Decimal is kept as its digits, float noise
                and all.
              </p>
              <div className="live__saveactions">
                <button
                  type="button"
                  className="button button--small"
                  onClick={() => {
                    void navigator.clipboard?.writeText(save).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    });
                  }}
                >
                  {copied ? "Copied" : "Copy the save"}
                </button>
                <ConfirmPress
                  className="button button--small"
                  onConfirm={() => {
                    store.getState().resetProfile();
                    setAuto(true);
                  }}
                >
                  {(armed) => (armed ? "Press again to wipe it" : "Start over")}
                </ConfirmPress>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="live__notation">
        <span className="lettering" id="notation-label">
          Notation
        </span>
        <div className="seg">
          {NOTATIONS.map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Notation: ${n}`}
              aria-pressed={notation === n}
              onClick={() => setNotation(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="num live__sample">
          {f.num("1.5e33")} · {f.num("7.25e120")} · {f.num("1e1000")}
        </span>
      </div>

      <dl className="tb">
        <div>
          <dt className="lettering">Entry</dt>
          <dd className="num">watchpot/core</dd>
        </div>
        <div>
          <dt className="lettering">Systems in this figure</dt>
          <dd>currencies, generators, prestige</dd>
        </div>
        <div>
          <dt className="lettering">Start here</dt>
          <dd>
            <a href="./docs/start-a-game.html">Start a game</a>
          </dd>
        </div>
        <div>
          <dt className="lettering">The whole game</dt>
          <dd>about 140 lines</dd>
        </div>
      </dl>
    </section>
  );
}
