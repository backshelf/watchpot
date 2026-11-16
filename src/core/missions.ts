import type { Draft } from "immer";
import { type Feature, type FeatureApi, feature, type Move, type ResetRule } from "./feature";
import { nextFloat, type RngState, seedRng } from "./rng";

/**
 * Missions: timed tasks in slots. Send something away, collect when it is back: an expedition, a delivery, a
 * research job. A mission costs what the game's `pay` hook takes at the start, and its reward is rolled at the start
 * too, on the feature's own saved rng, and stored with it: a reload cannot reroll it, and a screen can show it before
 * it lands. Missions run on game time, so they finish during an absence like any other time.
 *
 * `missionLeftMs` and `missionReady` read one entry; `missions({ key, slots, list })` is the feature.
 */

/** One mission: how long it takes, when it can be sent, its cost (the game's own shape) and its reward roll. */
export interface MissionDef<G, R, X = never> {
  readonly id: string;
  /** How long it takes, read when it starts. */
  readonly durationMs: (state: G) => number;
  /** Whether it can be started now. Default: always. */
  readonly available?: (state: G) => boolean;
  /** What it costs, in the game's own shape: `pay` takes it at the start. */
  readonly cost?: X;
  /**
   * The reward, rolled at the start from `rng` (a stream of its own for this start, drawn from the feature's saved
   * one) and stored with the entry. Plain data or Decimals: it is saved.
   */
  readonly reward: (state: G, rng: RngState) => R;
}

/** A mission under way: its own id, the mission it runs, its times and the reward it will pay. */
export interface ActiveMission<R> {
  /** Unique among the entries: `<mission>#<n>`. */
  id: string;
  mission: string;
  startedAt: number;
  endsAt: number;
  reward: R;
}

/** The feature's saved state. */
export interface MissionsState<R> {
  active: ActiveMission<R>[];
  /** Claims per mission id. */
  done: Record<string, number>;
  /** The stream every reward is drawn from. */
  rng: RngState;
  /** Missions started so far: the next entry's number. */
  serial: number;
}

/** Why a mission cannot start. */
export type MissionFailure = "unknown" | "unavailable" | "no-slot" | "cannot-pay";

/** Ms until the entry is back at game time `now`, never negative. */
export function missionLeftMs(entry: Pick<ActiveMission<unknown>, "endsAt">, now: number): number {
  return Math.max(0, entry.endsAt - now);
}

/** Whether the entry is back at game time `now`, ready to claim. */
export function missionReady(entry: Pick<ActiveMission<unknown>, "endsAt">, now: number): boolean {
  return now >= entry.endsAt;
}

/** The feature's actions. */
export interface MissionActions {
  /** Starts a mission: pays, rolls its reward, takes a slot. Returns why not, or null when it went. */
  start(missionId: string): MissionFailure | null;
  /** Claims an entry that is back: pays its reward through `onClaim` and frees its slot. False when it is not back. */
  claim(activeId: string): boolean;
  /** Recalls an entry, back or not, with no reward and no refund. False for an unknown id. */
  cancel(activeId: string): boolean;
}

/** A mission list's rules. */
export interface MissionRules<G, R, X> {
  readonly list: readonly MissionDef<G, R, X>[];
  mission(id: string): MissionDef<G, R, X> | undefined;
  /** The slots now. */
  slots(state: G): number;
  /** Slots not taken. */
  freeSlots(state: G): number;
  /** The entries back at `now`. */
  ready(state: G, now: number): ActiveMission<R>[];
}

/** A `missions` feature, carrying its rules as `.rules`. */
export type MissionsFeature<K extends string, G, R, X> = Feature<K, MissionsState<R>, MissionActions> & {
  readonly rules: MissionRules<G, R, X>;
};

/**
 * Missions as a feature. It saves `{ active, done, rng, serial }` under `key` and needs no step: an entry is back once
 * game time passes its `endsAt`, tab open or not. `start` checks the mission is known and `available`, that a slot is
 * free (`slots(state)`) and that `pay(draft, mission)` takes the cost (a mission with no `cost` never calls it; `pay`
 * must write nothing when it refuses), then rolls and stores the reward. `claim` runs `onClaim(draft, reward,
 * mission)` in its recipe. Auto-player moves: claim every entry back, start every mission that fits. A prestige reset
 * clears the entries unless `reset` says otherwise. The callbacks read the whole game state, so annotate one of them
 * with the game's state type.
 */
export function missions<const K extends string, R, X = never, G extends object = object>(def: {
  readonly key: K;
  readonly slots: (state: G) => number;
  readonly list: readonly MissionDef<G, R, X>[];
  readonly pay?: (draft: Draft<G>, mission: MissionDef<G, R, X>) => boolean;
  readonly onClaim?: (draft: Draft<G>, reward: R, mission: string) => void;
  readonly reset?: ResetRule<MissionsState<R>>;
}): MissionsFeature<K, G, R, X> {
  const byId = new Map<string, MissionDef<G, R, X>>();
  for (const m of def.list) {
    if (byId.has(m.id)) throw new Error(`missions "${def.key}": the mission "${m.id}" appears twice`);
    byId.set(m.id, m);
  }

  type Own = Record<K, MissionsState<R>>;
  const own = (state: unknown): MissionsState<R> => (state as Own)[def.key];
  const slots = (state: G): number => Math.max(0, Math.floor(def.slots(state)));
  const freeSlots = (state: G): number => Math.max(0, slots(state) - own(state).active.length);

  const rules: MissionRules<G, R, X> = {
    list: def.list,
    mission: (id) => byId.get(id),
    slots,
    freeSlots,
    ready: (state, now) => own(state).active.filter((a) => missionReady(a, now)),
  };

  const startDraft = (draft: Draft<Own>, id: string, now: number): MissionFailure | null => {
    const m = byId.get(id);
    const state = draft as unknown as G;
    if (!m) return "unknown";
    if (m.available && !m.available(state)) return "unavailable";
    if (freeSlots(state) <= 0) return "no-slot";
    if (m.cost !== undefined && !(def.pay?.(draft as unknown as Draft<G>, m) ?? false)) return "cannot-pay";
    const s = own(draft);
    // This start's own stream, hashed from the saved one, which then moves on: two starts never share draws.
    const stream = seedRng(s.rng.join("."));
    s.rng = [...nextFloat(s.rng)[1]];
    const reward = m.reward(state, stream);
    s.active.push({
      id: `${m.id}#${s.serial}`,
      mission: m.id,
      startedAt: now,
      endsAt: now + Math.max(0, m.durationMs(state)),
      reward,
    });
    s.serial += 1;
    return null;
  };

  const made = feature<K, MissionsState<R>, MissionActions, readonly [], Record<never, never>, Own>({
    key: def.key,
    initial: (ctx): MissionsState<R> => ({
      active: [],
      done: {},
      rng: seedRng(`${ctx.rng.join(".")}:${def.key}`),
      serial: 0,
    }),
    reset: def.reset ?? "run",
    actions: (api: FeatureApi<Own>): MissionActions => ({
      start: (missionId) => {
        let failure: MissionFailure | null = "unknown";
        const now = api.now();
        api.set((d) => {
          failure = startDraft(d, missionId, now);
        });
        return failure;
      },
      claim: (activeId) => {
        let ok = false;
        const now = api.now();
        api.set((d) => {
          const s = own(d);
          const i = s.active.findIndex((a) => a.id === activeId);
          const entry = s.active[i];
          if (!entry || !missionReady(entry, now)) return;
          s.active.splice(i, 1);
          s.done[entry.mission] = (s.done[entry.mission] ?? 0) + 1;
          def.onClaim?.(d as unknown as Draft<G>, entry.reward as R, entry.mission);
          ok = true;
        });
        return ok;
      },
      cancel: (activeId) => {
        let ok = false;
        api.set((d) => {
          const s = own(d);
          const i = s.active.findIndex((a) => a.id === activeId);
          if (i < 0) return;
          s.active.splice(i, 1);
          ok = true;
        });
        return ok;
      },
    }),
    moves: (s) => {
      const state = s as unknown as G;
      const actions = (store: { getState(): unknown }) =>
        (store.getState() as Record<K, MissionActions>)[def.key];
      const out: Move<typeof s>[] = [];
      for (const a of own(s).active)
        out.push({
          id: `${def.key}:claim:${a.id}`,
          value: () => 1,
          apply: (store) => actions(store).claim(a.id), // refused until it is back
        });
      if (freeSlots(state) > 0)
        for (const m of def.list)
          if (!m.available || m.available(state))
            out.push({
              id: `${def.key}:start:${m.id}`,
              value: () => 1,
              apply: (store) => actions(store).start(m.id) === null,
            });
      return out;
    },
  });
  return Object.assign(made, { rules });
}
