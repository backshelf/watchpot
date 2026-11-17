/**
 * The mod matrix: named sources a game sets to 0..1, routed through a curve and a slew onto the mix.
 *
 * It writes through the mixer (`MixerCore.drive`), so the mixer is the one place that knows a target's value. While
 * any route drives a target, the routes' sum is its value; the scene's or the handle's value waits underneath and
 * returns when the last route goes. The mixer gathers writes and sends them once in a microtask, so ten sets of a
 * source in a row send one record.
 */
import type { MixerCore } from "./mixer";
import type { CorePort } from "./port";
import type { ModMatrix, ModRoute } from "./types";

/** The mod matrix as `engine.ts` holds it. */
export interface ModCore<B extends string> {
  /** What a game sees: `sound.mod`. */
  api: ModMatrix<B>;
  /** Sends every routed target as it stands. Called each time the core comes up, after the mixer's `boot()`. */
  boot(): void;
}

/** How long a target takes to follow its routes when the route says nothing. */
const ROUTE_SLEW_MS = 30;
/** The steepness of `exp` and `log` where a range is not wholly above zero: `exp` maps 0.5 to 0.2 of the way. */
const EASE = 4;

const ease = (t: number): number => (2 ** (EASE * t) - 1) / (2 ** EASE - 1);

/**
 * A source's 0..1 mapped onto `[a, b]` along a curve. `exp` over a range above zero is geometric (equal ratios per
 * step: the natural path of a frequency), else an exponential ease; `log` is its mirror; `s` eases in and out.
 */
export function mapRoute(curve: ModRoute["curve"], t: number, [a, b]: readonly [number, number]): number {
  const geometric = a > 0 && b > 0;
  switch (curve) {
    case "exp":
      return geometric ? a * (b / a) ** t : a + (b - a) * ease(t);
    case "log":
      return geometric ? a + b - a * (b / a) ** (1 - t) : a + (b - a) * (1 - ease(1 - t));
    case "s":
      return a + (b - a) * t * t * (3 - 2 * t);
    default:
      return a + (b - a) * t;
  }
}

/** Builds the mod matrix over a mixer. Throws on a route whose target does not exist. */
export function createMod<B extends string>(
  options: { routes?: readonly ModRoute<B>[] },
  mixer: MixerCore<B>,
  _port: CorePort,
): ModCore<B> {
  const routes: { route: ModRoute<B>; key: string }[] = [];
  const sources = new Map<string, number>();

  const slewOf = (route: ModRoute<B>): number => {
    const slew = route.slewMs ?? ROUTE_SLEW_MS;
    return Number.isFinite(slew) && slew > 0 ? slew : 0;
  };

  /** Writes a target's sum, or lets it go when no route drives it any more. */
  function refresh(key: string, slewMs: number): void {
    let sum = 0;
    let slew = -1;
    for (const live of routes) {
      if (live.key !== key) continue;
      sum += mapRoute(live.route.curve, sources.get(live.route.from) ?? 0, live.route.range);
      slew = Math.max(slew, slewOf(live.route));
    }
    mixer.drive(key, slew < 0 ? undefined : sum, slew < 0 ? slewMs : slew);
  }

  function route(route: ModRoute<B>): () => void {
    const key = mixer.target(route.to);
    const [a, b] = route.range;
    if (!Number.isFinite(a) || !Number.isFinite(b))
      throw new Error(
        `watchpot/sound: a mod route from "${route.from}" has a range that is not two numbers: set \`range\` to [a, b], what the source's 0 and 1 map to`,
      );
    const live = { route, key };
    routes.push(live);
    refresh(key, slewOf(route));
    return () => {
      const at = routes.indexOf(live);
      if (at < 0) return;
      routes.splice(at, 1);
      refresh(key, slewOf(route));
    };
  }

  for (const each of options.routes ?? []) route(each);

  return {
    api: {
      source: (name) => ({
        set(value) {
          if (!Number.isFinite(value)) return;
          sources.set(name, Math.min(1, Math.max(0, value)));
          const keys = new Set<string>();
          for (const live of routes) if (live.route.from === name) keys.add(live.key);
          for (const key of keys) refresh(key, ROUTE_SLEW_MS);
        },
      }),
      route,
    },
    // The mixer holds every driven value and sends it from its own `boot()`.
    boot() {},
  };
}
