import {
  AWAY_REPORT_MIN_MS,
  catchUpSteps,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  type Decimal,
  defineGame,
  feature,
  fillDeep,
  fmt,
  HOUR_MS,
  type JournalLine,
  linesSince,
  pushLine,
} from "watchpot/core";

/** A pond that compounds: each second the lilies grow by a tenth of themselves, so a catch-up must replay the rule. */
interface Pond {
  lilies: Decimal;
  /** Settings the player may have saved in an older shape: `fillDeep` fills what a build added. */
  tuning: { growth: number; limits: { cap: Decimal } };
  /** The away report: kept while the sheet is open, never saved. */
  away: { ms: number; gained: Decimal } | null;
  log: JournalLine<"away">[];
}

const initial = (): Pond => ({
  lilies: D(10),
  tuning: { growth: 0.1, limits: { cap: D("1e30") } },
  away: null,
  log: [],
});

/** The tick rule, used by a live tick and by every step of a catch-up. */
const grow = (p: Pond, dtMs: number) => {
  const next = p.lilies.mul(D(1 + p.tuning.growth * (dtMs / 1000)));
  p.lilies = next.gt(p.tuning.limits.cap) ? p.tuning.limits.cap : next;
};

const AWAY_CAP_MS = 8 * HOUR_MS;

export const pond = feature({
  key: "pond",
  initial,
  transient: ["away"],
  // The loader fills one level down; `fillDeep` fills `tuning.limits.cap` too, and coerces it back to a Decimal.
  merge: (merged, fresh) => ({ ...merged, tuning: fillDeep(merged.tuning, fresh.tuning) }),
  steps: {
    produce: {
      tick: { pass: "tick", run: (s, ctx) => grow(s.pond, ctx.dtMs) },
      away: {
        pass: "catchUp",
        run: (s, ctx) => {
          const span = catchUpSteps(ctx.dtMs, { capMs: AWAY_CAP_MS });
          const before = s.pond.lilies;
          for (let i = 0; i < span.steps; i++) grow(s.pond, span.stepMs);
          if (ctx.dtMs < AWAY_REPORT_MIN_MS) return;
          const gained = s.pond.lilies.sub(before);
          s.pond.away = { ms: span.awayMs, gained };
          pushLine(s.pond.log, { at: ctx.now, kind: "away", text: `away: +${fmt(gained).text} lilies` });
        },
      },
    },
  },
});

export const game = defineGame({
  id: "pond",
  save: { key: "pond.save", version: 1 },
  features: [pond],
});

if (import.meta.main) {
  let wall = Date.UTC(2026, 0, 1);
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
    now: () => wall,
  });
  store.getState().catchUp(wall);
  const cursor = store.getState().pond.log.at(-1);
  wall += 2 * HOUR_MS;
  store.getState().catchUp(wall);
  const { lilies, away, log } = store.getState().pond;
  console.log("lilies after 2h away:", fmt(lilies).text, "| report:", away && fmt(away.gained).text);
  console.log(
    "news since the cursor:",
    linesSince(log, cursor).map((l) => l.text),
  );
}
