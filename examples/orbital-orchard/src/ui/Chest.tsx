import { type RarityTier, tierInk, tierLabel } from "watchpot/kit";
import { cx } from "watchpot/ui";
import s from "./Chest.module.css";
import { Foil } from "./Foil";

/** One row of a box's odds: the rung (with the game's word as its `label`) and its share, formatted ("2.5%"). */
export interface ChestOdds {
  tier: RarityTier;
  percent: string;
}

/** Props of `Chest`: its name, its state, its odds and the rung it glows in. */
export interface ChestProps {
  /** The box's name: the drawing's accessible name. */
  name: string;
  /** "opening" lifts the lid off flat and leaks foil light from the seam. */
  state?: "closed" | "opening";
  /** Highest rung first, every rung included. A box that costs something is never shown without them. */
  odds?: readonly ChestOdds[];
  /** The odds' heading and name ("Graft kit odds"), in the game's words. */
  oddsLabel?: string;
  /** Lit from below in this rung's colour: the best it can turn. A lamp under its foot, a dot screen up the wall. */
  glow?: RarityTier;
  className?: string;
}

/** The 4x4 Bayer order, as thresholds 0..15: the window's dot screen climbs through it. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** The window's dot screen: a 30 by 10 grid of 3-unit cells, ink density climbing from the top row to the bottom. */
const WINDOW_DOTS = (() => {
  let d = "";
  for (let r = 0; r < 10; r++) {
    const density = 0.12 + (0.8 * (r + 0.5)) / 10;
    for (let c = 0; c < 30; c++) {
      if ((BAYER[(r % 4) * 4 + (c % 4)] ?? 0) / 16 < density)
        d += `M${25.6 + c * 3} ${67.6 + r * 3}h1.8v1.8h-1.8z`;
    }
  }
  return d;
})();

/** The lid's stamp: a short bar code. */
const STAMP = [2, 1, 1, 3, 1, 2, 1, 1, 3, 1].reduce<{ d: string; x: number }>(
  (acc, w, i) => ({ d: i % 2 === 0 ? `${acc.d}M${acc.x} 38h${w}v8h-${w}z` : acc.d, x: acc.x + w + 1 }),
  { d: "", x: 18 },
).d;

/** The case: one rectangle on a 140x140 box, a ruled frame round a dotted window. Flat, no curve, no corner. */
function Body() {
  return (
    <svg viewBox="0 -20 140 140" aria-hidden="true" focusable="false">
      <rect className={s.fill} x="10" y="52" width="120" height="58" />
      <rect className={s.frame} x="17" y="59" width="106" height="44" />
      <path className={s.edge} d={WINDOW_DOTS} shapeRendering="crispEdges" />
      <rect className={s.line} x="10" y="52" width="120" height="58" />
    </svg>
  );
}

/** The lid, drawn apart so the light can sit between it and the case. Its grip is the case's one lit part. */
function Lid() {
  return (
    <svg viewBox="0 -20 140 140" aria-hidden="true" focusable="false">
      <g className={s.lid}>
        <rect className={s.fill} x="10" y="14" width="120" height="38" />
        <rect className={s.grip} x="48" y="26" width="44" height="6" />
        <path className={s.edge} d={STAMP} />
        <rect className={s.line} x="10" y="14" width="120" height="38" />
      </g>
    </svg>
  );
}

/** A sealed box, closed or opening, with its odds beside it when given; `glow` lights it from below in its best rung. */
export function Chest({ name, state = "closed", odds, oddsLabel, glow, className }: ChestProps) {
  const opening = state === "opening";
  const figure = (
    <figure
      className={cx(s.chest, !odds && className)}
      data-state={state}
      data-glow={glow?.id}
      style={glow && { "--glow": tierInk(glow) }}
    >
      <div className={s.art} role="img" aria-label={name}>
        {glow ? (
          <>
            <span className={s.uplight} />
            <span className={s.lamp} />
          </>
        ) : (
          <span className={s.shadow} />
        )}
        <Body />
        {opening && (
          <span className={s.light} aria-hidden="true">
            <span className={s.beam}>
              <Foil className={s.beamFoil} angle={200} />
            </span>
          </span>
        )}
        <Lid />
      </div>
    </figure>
  );
  if (!odds) return figure;
  return (
    <div className={cx(s.set, className)}>
      {figure}
      <section className={s.odds} aria-label={oddsLabel}>
        {oddsLabel && <p className={s.oddsLabel}>{oddsLabel}</p>}
        <dl>
          {odds.map((row) => (
            <div key={row.tier.id} className={s.oddsRow}>
              <dt data-rarity={row.tier.id}>{tierLabel(row.tier)}</dt>
              <dd>{row.percent}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
