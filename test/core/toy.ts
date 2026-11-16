import {
  offlineCredit as catchUpSpan,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  type DecimalSource,
  defineGame,
  feature,
  HOUR_MS,
  type StateOf,
  type StorageBackend,
  ZERO,
} from "watchpot/core";

/**
 * The toy game the core tests play: a wallet, a generator that fills it, a prestige layer that resets the run.
 * It is the cookbook page: three `feature` calls and one `defineGame`, every type read off the declarations.
 */

/** Gold, and the lifetime total the prestige layer reads. `flash` is what the screen shows for a second: never saved. */
export const wallet = feature({
  key: "wallet",
  initial: () => ({ gold: D(10), lifetime: ZERO, flash: null as string | null }),
  transient: ["flash"],
  actions: (api) => ({
    earn: (amount: DecimalSource) =>
      api.set((s) => {
        s.wallet.gold = s.wallet.gold.add(amount);
        s.wallet.lifetime = s.wallet.lifetime.add(amount);
        s.wallet.flash = `+${D(amount).toString()}`;
      }),
    spend: (amount: DecimalSource): boolean => {
      let ok = false;
      api.set((s) => {
        if (s.wallet.gold.lt(amount)) return;
        s.wallet.gold = s.wallet.gold.sub(amount);
        ok = true;
      });
      return ok;
    },
  }),
});

/** Offline time pays half, for at most an hour. */
export const OFFLINE_RATE = 0.5;
export const OFFLINE_CAP_MS = HOUR_MS;

export const generatorCost = (owned: number) => D(10).mul(owned);

/**
 * Generators make gold every second. The tiers unlocked survive a prestige; `since` is when this run's
 * generators started (0 on a brand-new profile, whose clock starts at the first catch-up).
 */
export const generator = feature({
  key: "generator",
  reach: [wallet],
  initial: (ctx) => ({
    owned: 1,
    perSecond: D(1),
    unlocked: { bronze: true, silver: false } as Record<string, boolean>,
    auto: false,
    since: ctx.reason === "new" ? 0 : ctx.now,
    rng: ctx.rng,
  }),
  reset: { keep: ["unlocked"] },
  /** A tier this build does not know is dropped from the save. */
  merge: (merged, fresh) => ({
    ...merged,
    unlocked: Object.fromEntries(Object.keys(fresh.unlocked).map((k) => [k, merged.unlocked[k] ?? false])),
  }),
  actions: (api) => ({
    buy: (): boolean => {
      let ok = false;
      api.set((s) => {
        const cost = generatorCost(s.generator.owned);
        if (s.wallet.gold.lt(cost)) return;
        s.wallet.gold = s.wallet.gold.sub(cost);
        s.generator.owned += 1;
        ok = true;
      });
      return ok;
    },
    setAuto: (on: boolean) =>
      api.set((s) => {
        s.generator.auto = on;
      }),
  }),
  steps: {
    rates: {
      perSecond: (s) => {
        s.generator.perSecond = D(s.generator.owned);
      },
    },
    produce: {
      income: {
        pass: "tick",
        run: (s, ctx) => {
          const gold = s.generator.perSecond.mul(ctx.dtMs / 1000);
          s.wallet.gold = s.wallet.gold.add(gold);
          s.wallet.lifetime = s.wallet.lifetime.add(gold);
        },
      },
      offline: {
        pass: "catchUp",
        run: (s, ctx) => {
          const span = catchUpSpan(ctx.dtMs, OFFLINE_RATE, OFFLINE_CAP_MS);
          const gold = s.generator.perSecond.mul(span.creditedMs / 1000);
          s.wallet.gold = s.wallet.gold.add(gold);
          s.wallet.lifetime = s.wallet.lifetime.add(gold);
        },
      },
    },
    automate: {
      autobuy: {
        pass: "tick",
        run: (s) => {
          if (!s.generator.auto) return;
          const cost = generatorCost(s.generator.owned);
          if (s.wallet.gold.lt(cost)) return;
          s.wallet.gold = s.wallet.gold.sub(cost);
          s.generator.owned += 1;
        },
      },
    },
  },
});

/** Shards for lifetime gold; ascending resets the run and keeps the shards. */
export const prestige = feature({
  key: "prestige",
  reach: [wallet, generator],
  initial: () => ({ runs: 0, shards: ZERO }),
  reset: "never",
  actions: (api) => ({
    ascend: () =>
      api.set((s) => {
        s.prestige.shards = s.prestige.shards.add(s.wallet.lifetime.div(100).floor());
        api.resetRun(s);
        s.prestige.runs += 1;
      }),
  }),
});

export const toy = defineGame({
  id: "toy",
  save: { key: "toy.save", version: 1 },
  features: [wallet, generator, prestige],
});

export type ToyState = StateOf<typeof toy.features>;

/** Noon, local time, on a fixed day. */
export const T0 = new Date(2026, 9, 29, 12, 0, 0).getTime();

export interface ToyStoreOptions {
  /** The frozen wall clock. Default `T0`. */
  at?: number;
  /** Default a new memory backend; pass one to reload from it. */
  backend?: StorageBackend;
  seed?: string;
  name?: string;
}

/** A toy store on a memory backend with synchronous writes, not yet caught up. */
export function toyStore(options: ToyStoreOptions = {}) {
  const at = options.at ?? T0;
  const backend = options.backend ?? createMemoryBackend();
  const store = createIdleStore(toy, {
    storage: createGameStorage(backend, { debounceMs: 0, onError: () => {} }),
    now: () => at,
    seed: options.seed,
    name: options.name,
  });
  return { store, backend };
}

/**
 * The toy's fixture player (`fixtureSave(toy, regular)`): a minute of play, two generators bought, one ascension,
 * one more generator. `toy-save-v1.json` is its save at version 1, kept as the older save the migrations read.
 */
export const regular = (
  store: ReturnType<typeof toyStore>["store"],
  clock: { advance(ms: number): number },
) => {
  store.getState().wallet.earn(500);
  store.getState().generator.buy();
  store.getState().generator.buy();
  store.getState().tick(60_000, clock.advance(60_000));
  store.getState().prestige.ascend();
  store.getState().wallet.earn(25);
  store.getState().generator.buy();
  store.getState().tick(1_000, clock.advance(1_000));
};
