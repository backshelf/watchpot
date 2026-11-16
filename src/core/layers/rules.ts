import { isDraft } from "immer";
import { catchUpSteps } from "../clock";
import { D, Decimal, ZERO } from "../decimal";
import { checkLayers } from "./check";
import { indexLayers, type LayerIndex, LayerQuery } from "./query";
import type { LayerDef, LayerEvent, LayerModelDef, LayerResourceRef, LayerState, LayersState } from "./types";

/**
 * The layer rules: pure functions over a plain layer state (an immer draft inside a store, a plain object in a test
 * or a sim). Each rule writes the state it is given and reads it through a fresh query, since a query caches what it
 * works out. `layerModel(def)` checks and indexes the definitions once and returns the rules over them.
 */

/** The rules and readers of one set of layer definitions. */
export interface LayerModel<L extends string, S extends string, B extends string> {
  readonly def: LayerModelDef<L, S, B>;
  /** Every layer, in definition order (lowest row first). */
  readonly list: readonly LayerDef<L, S, B>[];
  /** A layer's definition; throws on an unknown id. */
  layer(id: L): LayerDef<L, S, B>;
  /** A new state: nothing held, the lowest row sighted. */
  fresh(): LayersState<L>;
  /** One layer's fresh state. */
  freshLayer(id: L): LayerState;
  /** The query over a finished state, cached per state object (a draft gets a new, uncached one). */
  query(state: LayersState<L>): LayerQuery<L, S, B>;
  /** A new, uncached query: for a state that is about to change. */
  read(state: LayersState<L>): LayerQuery<L, S, B>;
  /** What a resource reference holds now. */
  resource(state: LayersState<L>, ref: LayerResourceRef<L, B>): Decimal;
  /**
   * Empties every row beneath `row`: amounts, totals and powers, and upgrades and buyables unless the layer's
   * `keep:` flag is raised (read through `q`, lazily). The base resource goes to 0. Milestones, completions, best,
   * sighted, established, order and reset counts survive.
   */
  wipeBelow(state: LayersState<L>, row: number, q?: LayerQuery<L, S, B>): void;
  /** Resets into a layer: pays its gain and wipes the rows beneath (unless `quiet:`). False when it cannot. */
  resetInto(state: LayersState<L>, id: L): boolean;
  buyUpgrade(state: LayersState<L>, id: L, upgrade: string, q?: LayerQuery<L, S, B>): boolean;
  /** One level, or with `max` every level the resource covers (at most 200). Returns the levels bought. */
  buyLevel(state: LayersState<L>, id: L, buyable: string, max?: boolean): number;
  /** Enters a challenge: wipes the rows beneath its layer; its penalties and mutes hold until completed or left. */
  enterChallenge(state: LayersState<L>, id: L, challenge: string): boolean;
  /** Leaves the challenge entered, uncompleted: wipes beneath its layer again and pays nothing. */
  leaveChallenge(state: LayersState<L>): boolean;
  /** Switches a layer's automation off (`true`) or back on. */
  setManual(state: LayersState<L>, id: L, manual: boolean): void;
  /** Adds a tag once; false when it was already added. */
  tag(state: LayersState<L>, id: string): boolean;
  /**
   * Everything that follows from the state with no time passing, in order: per layer (definition order) sighting
   * and milestones; tags whose `when` holds; the entered challenge completed once the base reaches its goal; then
   * automation, highest row first (and within a row, the later definition first), skipping a layer switched to
   * manual or not yet sighted: `autobuy:` upgrades, `autolevel:` buyables (max), an `auto:` static layer's reset.
   */
  settle(state: LayersState<L>): void;
  /**
   * One step of time: every rate is read off the state before any income lands (the base, each power with its cap,
   * each passive share of a normal layer's raw gain), then all of it lands, `playedMs` moves and the state settles.
   */
  advance(state: LayersState<L>, dtMs: number): void;
  /** Time away: `catchUpSteps` over the model's `away` options, then `advance` once per step. Returns the credited ms. */
  advanceAway(state: LayersState<L>, awayMs: number): number;
}

/** Checks the definitions (throwing on the first problem) and returns the rules over them. */
export function layerModel<L extends string, S extends string, B extends string>(
  def: LayerModelDef<L, S, B>,
): LayerModel<L, S, B> {
  checkLayers(def);
  const index: LayerIndex<L, S, B> = indexLayers(def);
  const list = def.layers;
  const layer = (id: L): LayerDef<L, S, B> => {
    const l = index.byId.get(id);
    if (!l) throw new Error(`layers: no layer "${id}"`);
    return l;
  };
  const read = (s: LayersState<L>) => new LayerQuery(index, s);
  const cache = new WeakMap<LayersState<L>, LayerQuery<L, S, B>>();
  const query = (s: LayersState<L>): LayerQuery<L, S, B> => {
    if (isDraft(s)) return read(s);
    let q = cache.get(s);
    if (!q) {
      q = read(s);
      cache.set(s, q);
    }
    return q;
  };
  const emit = (s: LayersState<L>, e: LayerEvent<L>) => def.onEvent?.(s, e);
  // Highest row first; within a row, the later definition first (the reverse of a lowest-first list).
  const downward = list
    .map((l, i) => ({ l, i }))
    .sort((a, b) => b.l.row - a.l.row || b.i - a.i)
    .map((x) => x.l);

  const freshLayer = (id: L): LayerState => ({
    // The lowest row is sighted from the start; the rest as their requirement is first met.
    sighted: layer(id).row === 1,
    established: false,
    order: 0,
    amount: ZERO,
    best: ZERO,
    total: ZERO,
    resets: 0,
    power: ZERO,
    upgrades: [],
    buyables: {},
    milestones: [],
    completions: {},
    manual: false,
  });

  const fresh = (): LayersState<L> => ({
    base: ZERO,
    baseTotal: ZERO,
    layers: Object.fromEntries(list.map((l) => [l.id, freshLayer(l.id)])) as Record<L, LayerState>,
    challenge: null,
    tags: [],
    playedMs: 0,
  });

  const spend = (s: LayersState<L>, ref: LayerResourceRef<L, B>, amount: Decimal) => {
    if (ref === def.base.id) s.base = s.base.sub(amount).max(0);
    else if (ref.endsWith(".power")) {
      const st = s.layers[ref.slice(0, -6) as L];
      st.power = st.power.sub(amount).max(0);
    } else {
      const st = s.layers[ref as L];
      st.amount = st.amount.sub(amount).max(0);
    }
  };

  const credit = (st: LayerState, amount: Decimal) => {
    st.amount = st.amount.add(amount);
    st.total = st.total.add(amount);
    if (st.amount.gt(st.best)) st.best = st.amount;
  };

  const wipeBelow = (s: LayersState<L>, row: number, q: LayerQuery<L, S, B> = read(s)) => {
    for (const l of list) {
      if (l.row >= row) continue;
      const st = s.layers[l.id];
      st.amount = ZERO;
      st.total = ZERO;
      st.power = ZERO;
      if (!q.flag(`keep:${l.id}`)) {
        st.upgrades = [];
        st.buyables = {};
      }
    }
    s.base = ZERO;
  };

  const resetInto = (s: LayersState<L>, id: L): boolean => {
    const q = read(s);
    if (!q.canReset(id)) return false;
    const l = layer(id);
    const st = s.layers[id];
    const gain = q.gain(id);
    if (!st.established) {
      st.order = list.filter((o) => o.row === l.row && s.layers[o.id].established).length;
      st.established = true;
      emit(s, { kind: "established", layer: id, at: s.playedMs });
    }
    credit(st, gain);
    st.resets += 1;
    emit(s, { kind: "reset", layer: id, gain, at: s.playedMs });
    if (!q.flag(`quiet:${id}`)) wipeBelow(s, l.row, q);
    return true;
  };

  const buyUpgrade = (s: LayersState<L>, id: L, upgrade: string, q = read(s)): boolean => {
    const l = layer(id);
    const u = l.upgrades?.find((x) => x.id === upgrade);
    if (!u || !q.canBuy(id, u)) return false;
    spend(s, l.shop ?? id, D(u.cost));
    s.layers[id].upgrades.push(u.id);
    emit(s, { kind: "upgrade", layer: id, id: u.id, at: s.playedMs });
    return true;
  };

  const buyLevel = (s: LayersState<L>, id: L, buyable: string, max = false): number => {
    const b = layer(id).buyables?.find((x) => x.id === buyable);
    if (!b) return 0;
    let bought = 0;
    for (let i = 0; i < (max ? 200 : 1); i++) {
      const q = read(s);
      if (!q.canLevel(id, b)) break;
      if (!q.flag(`free:${id}`)) spend(s, b.pay, q.buyableCost(id, b));
      s.layers[id].buyables[b.id] = q.level(id, b.id) + 1;
      bought += 1;
    }
    return bought;
  };

  const enterChallenge = (s: LayersState<L>, id: L, challenge: string): boolean => {
    const q = read(s);
    const c = layer(id).challenges?.find((x) => x.id === challenge);
    if (!c || !q.canEnter(id, c)) return false;
    wipeBelow(s, layer(id).row, q);
    s.challenge = { layer: id, id: c.id, since: s.playedMs };
    emit(s, { kind: "entered", layer: id, id: c.id, at: s.playedMs });
    return true;
  };

  const leaveChallenge = (s: LayersState<L>): boolean => {
    const at = s.challenge;
    if (!at) return false;
    const q = read(s);
    s.challenge = null;
    wipeBelow(s, layer(at.layer).row, q);
    emit(s, { kind: "left", layer: at.layer, id: at.id, since: at.since, at: s.playedMs });
    return true;
  };

  const complete = (s: LayersState<L>, q: LayerQuery<L, S, B>) => {
    const at = s.challenge;
    const c = q.inside;
    if (!at || !c) return;
    const done = s.layers[at.layer].completions;
    done[c.id] = (done[c.id] ?? 0) + 1;
    s.challenge = null;
    wipeBelow(s, layer(at.layer).row, q);
    emit(s, { kind: "completed", layer: at.layer, id: c.id, at: s.playedMs });
  };

  const tag = (s: LayersState<L>, id: string): boolean => {
    if (s.tags.includes(id)) return false;
    s.tags.push(id);
    emit(s, { kind: "tagged", id, at: s.playedMs });
    return true;
  };

  const settle = (s: LayersState<L>) => {
    let q = read(s);
    for (const l of list) {
      const st = s.layers[l.id];
      if (!st.sighted && q.status(l.id) === "shown" && q.from(l.id).gte(q.requirement(l.id))) {
        st.sighted = true;
        emit(s, { kind: "sighted", layer: l.id, at: s.playedMs });
        q = read(s);
      }
      for (const m of l.milestones ?? []) {
        if (st.milestones.includes(m.id)) continue;
        const on = m.on ?? (l.kind === "static" ? "best" : "total");
        const have = on === "resets" ? D(st.resets) : st[on];
        if (have.lt(m.at)) continue;
        st.milestones.push(m.id);
        emit(s, { kind: "milestone", layer: l.id, id: m.id, at: s.playedMs });
        q = read(s);
      }
    }
    for (const m of def.tags ?? [])
      if (m.when && !s.tags.includes(m.id) && m.when(q) && tag(s, m.id)) q = read(s);
    const inside = q.inside;
    if (inside && s.base.gte(inside.goal)) {
      complete(s, q);
      q = read(s);
    }
    for (const l of downward) {
      if (s.layers[l.id].manual || !q.isOpen(l.id)) continue;
      if (q.flag(`autobuy:${l.id}`))
        for (const u of l.upgrades ?? []) if (q.canBuy(l.id, u) && buyUpgrade(s, l.id, u.id, q)) q = read(s);
      if (q.flag(`autolevel:${l.id}`))
        for (const b of l.buyables ?? [])
          if (q.canLevel(l.id, b) && buyLevel(s, l.id, b.id, true) > 0) q = read(s);
      if (l.kind === "static" && q.flag(`auto:${l.id}`) && q.canReset(l.id) && resetInto(s, l.id))
        q = read(s);
    }
  };

  const advance = (s: LayersState<L>, dtMs: number) => {
    if (!(dtMs > 0)) return;
    const dt = dtMs / 1000;
    const q = read(s);
    const risen = q.baseRate.mul(dt);
    // Every rate is read off the state as it stood before any of this step's income lands.
    const income = list.map((l) => {
      const share = l.kind === "normal" && l.passive ? q.stat(l.passive) : ZERO;
      return {
        st: s.layers[l.id],
        power: l.power ? q.powerRate(l.id).mul(dt) : ZERO,
        cap: q.powerCap(l.id),
        passive: share.gt(0) ? q.rawGain(l.id).mul(share).mul(dt) : ZERO,
      };
    });
    s.base = s.base.add(risen);
    s.baseTotal = s.baseTotal.add(risen);
    for (const { st, power, cap, passive } of income) {
      if (power.gt(0)) st.power = cap ? Decimal.min(cap, st.power.add(power)) : st.power.add(power);
      else if (cap && st.power.gt(cap)) st.power = cap;
      if (passive.gt(0)) credit(st, passive);
    }
    s.playedMs += dtMs;
    settle(s);
  };

  const advanceAway = (s: LayersState<L>, awayMs: number): number => {
    const a = def.away ?? {};
    const span = catchUpSteps(awayMs, {
      capMs: a.capMs ?? 8 * 3_600_000,
      rate: a.rate,
      maxSteps: a.maxSteps,
      minStepMs: a.minStepMs,
    });
    if (!(span.steps > 0)) return 0;
    const before = s.baseTotal;
    for (let i = 0; i < span.steps; i++) advance(s, span.stepMs);
    emit(s, {
      kind: "away",
      ms: span.awayMs,
      creditedMs: span.creditedMs,
      risen: s.baseTotal.sub(before),
      at: s.playedMs,
    });
    return span.creditedMs;
  };

  return {
    def,
    list,
    layer,
    fresh,
    freshLayer,
    query,
    read,
    resource: (s, ref) => read(s).resource(ref),
    wipeBelow,
    resetInto,
    buyUpgrade,
    buyLevel,
    enterChallenge,
    leaveChallenge,
    setManual: (s, id, manual) => {
      s.layers[id].manual = manual;
    },
    tag,
    settle,
    advance,
    advanceAway,
  };
}
