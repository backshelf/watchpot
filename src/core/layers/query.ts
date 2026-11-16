import { D, Decimal, type DecimalSource, ONE, ZERO } from "../decimal";
import { type StatBreakdown, type StatGraph, type StatIndex, type StatPart, statIndex } from "../graph/stats";
import type {
  AnyLayerFlag,
  LayerBuyableDef,
  LayerChallengeDef,
  LayerDef,
  LayerModelDef,
  LayerMuteGroup,
  LayerResourceRef,
  LayerSourceRef,
  LayerState,
  LayersState,
  LayerUpgradeDef,
} from "./types";

/**
 * The query: every question the rules and a screen ask of one layer state. What a stat comes to and why, what a
 * reset would pay, what the next unit needs, where a layer stands. A query reads its state live and caches what it
 * works out, so make a new one after the state changes (`model.query(state)` does, per state object).
 */

/** Where a layer stands: `hidden` until its parents are established, `shown` until its requirement is first met
 * (sighted), then `open`, then `established` once reset into. */
export type LayerStatus = "hidden" | "shown" | "open" | "established";

/** What a query reads off the model: the definitions, indexed once. */
export interface LayerIndex<L extends string, S extends string, B extends string> {
  readonly def: LayerModelDef<L, S, B>;
  readonly list: readonly LayerDef<L, S, B>[];
  readonly byId: ReadonlyMap<string, LayerDef<L, S, B>>;
  /** Challenge id to its layer and definition. */
  readonly challenges: ReadonlyMap<string, { layer: L; def: LayerChallengeDef<L, S, B> }>;
  readonly live: StatIndex<S, AnyLayerFlag<L>, LayerQuery<L, S, B>, LayerMuteGroup<L>>;
}

/** Indexes a model's content: every source's effects and flags, in a fixed order (per layer: holding, power, upgrades,
 * buyables, milestones, challenges and their penalties; then the extra sources). */
export function indexLayers<L extends string, S extends string, B extends string>(
  def: LayerModelDef<L, S, B>,
): LayerIndex<L, S, B> {
  const passive = new Set<string>();
  for (const l of def.layers) if (l.passive) passive.add(l.passive);
  const stats = (def.stats ?? {}) as Partial<Record<S, DecimalSource>>;
  const live = statIndex<S, AnyLayerFlag<L>, LayerQuery<L, S, B>, LayerMuteGroup<L>>({
    base: (stat) => stats[stat] ?? (passive.has(stat) ? 0 : 1),
    caps: def.caps,
  });
  const challenges = new Map<string, { layer: L; def: LayerChallengeDef<L, S, B> }>();
  for (const l of def.layers) {
    const id = l.id;
    const label = (kind: LayerSourceRef<L>["kind"], x: { id?: string; name?: string }, fallback: string) => {
      const at = { layer: id, kind, id: x.id ?? fallback, label: x.name ?? x.id ?? fallback };
      if (kind === "penalty") at.label = `inside ${at.label}`;
      return def.label?.(at) ?? at.label;
    };
    if (l.holding)
      live.add(l.holding, {
        label: label("holding", { name: l.holding.name ?? l.name }, id),
        owner: id,
        group: `${id}.holding`,
        active: (q) => q.units(id).gt(0) || q.data(id).total.gt(0),
      });
    if (l.power)
      live.add(l.power, {
        label: label("power", l.power, `${id}.power`),
        owner: id,
        group: `${id}.power`,
        active: (q) => q.power(id).gt(0),
      });
    for (const u of l.upgrades ?? [])
      live.add(u, {
        label: label("upgrade", u, u.id),
        owner: id,
        group: `${id}.upgrades`,
        active: (q) => q.owns(id, u.id),
      });
    for (const b of l.buyables ?? [])
      live.add(b, {
        label: label("buyable", b, b.id),
        owner: id,
        group: `${id}.buyables`,
        active: (q) => q.level(id, b.id) > 0,
      });
    for (const m of l.milestones ?? [])
      live.add(m, { label: label("milestone", m, m.id), owner: id, active: (q) => q.reached(id, m.id) });
    for (const c of l.challenges ?? []) {
      challenges.set(c.id, { layer: id, def: c });
      live.add(c, { label: label("challenge", c, c.id), owner: id, active: (q) => q.completions(c.id) > 0 });
      live.add(
        { effects: c.penalties },
        { label: label("penalty", c, c.id), owner: id, active: (q) => q.state.challenge?.id === c.id },
      );
    }
  }
  for (const x of def.sources ?? []) live.add(x, { label: x.label, owner: x.owner ?? "", active: x.active });
  return {
    def,
    list: def.layers,
    byId: new Map(def.layers.map((l) => [l.id as string, l])),
    challenges,
    live,
  };
}

const LN10 = Math.LN10;

/** One state's answers. Reads the state live; caches each stat and flag on first read. */
export class LayerQuery<L extends string, S extends string, B extends string> {
  private readonly graph: StatGraph<S, AnyLayerFlag<L>>;
  private rate: Decimal | undefined;

  constructor(
    private readonly index: LayerIndex<L, S, B>,
    /** The state read (a draft inside a rule). */
    readonly state: LayersState<L>,
  ) {
    this.graph = index.live.over(this, { muted: (group) => this.muted(group) });
  }

  /** A layer's definition; throws on an unknown id. */
  layer(id: L): LayerDef<L, S, B> {
    const l = this.index.byId.get(id);
    if (!l) throw new Error(`layers: no layer "${id}"`);
    return l;
  }

  // ------------------------------------------------------------------------------------------- what is held

  /** The base resource held. */
  get base(): Decimal {
    return this.state.base;
  }
  data(id: L): LayerState {
    return this.state.layers[id];
  }
  amount(id: L): Decimal {
    return this.state.layers[id].amount;
  }
  power(id: L): Decimal {
    return this.state.layers[id].power;
  }
  /** Units that count toward the layer's effects: those held plus its `bonus` stat. */
  units(id: L): Decimal {
    const bonus = this.layer(id).bonus;
    const held = this.state.layers[id].amount;
    return bonus ? held.add(this.stat(bonus)) : held;
  }
  owns(id: L, upgrade: string): boolean {
    return this.state.layers[id].upgrades.includes(upgrade);
  }
  /** Upgrades of the layer owned. */
  count(id: L): number {
    return this.state.layers[id].upgrades.length;
  }
  level(id: L, buyable: string): number {
    return this.state.layers[id].buyables[buyable] ?? 0;
  }
  /** Every level of the layer's buyables, added up. */
  levels(id: L): number {
    let n = 0;
    const b = this.state.layers[id].buyables;
    for (const k in b) n += b[k] ?? 0;
    return n;
  }
  reached(id: L, milestone: string): boolean {
    return this.state.layers[id].milestones.includes(milestone);
  }
  established(id: L): boolean {
    return this.state.layers[id].established;
  }
  /** Whether any layer of the row is established. */
  rowEstablished(row: number): boolean {
    return this.index.list.some((l) => l.row === row && this.state.layers[l.id].established);
  }
  /** Times a challenge (by its id, unique across layers) has been completed. */
  completions(challenge: string): number {
    for (const l of this.index.list) {
      const n = this.state.layers[l.id].completions[challenge];
      if (n) return n;
    }
    return 0;
  }
  /** Challenges of one layer completed at least once. */
  passed(id: L): number {
    let n = 0;
    for (const c of this.layer(id).challenges ?? []) if (this.state.layers[id].completions[c.id]) n += 1;
    return n;
  }
  /** Whether a tag has been added. */
  tagged(id: string): boolean {
    return this.state.tags.includes(id);
  }
  /** The challenge entered, if any. */
  get inside(): LayerChallengeDef<L, S, B> | null {
    const at = this.state.challenge;
    if (!at) return null;
    return this.layer(at.layer).challenges?.find((c) => c.id === at.id) ?? null;
  }
  /** Whether the entered challenge silences a group. */
  muted(group: LayerMuteGroup<L>): boolean {
    return this.inside?.mutes?.includes(group) ?? false;
  }
  /** What a resource reference holds now. */
  resource(ref: LayerResourceRef<L, B>): Decimal {
    if (ref === this.index.def.base.id) return this.state.base;
    if (ref.endsWith(".power")) return this.state.layers[ref.slice(0, -6) as L].power;
    return this.state.layers[ref as L].amount;
  }

  // ------------------------------------------------------------------------------------------- stats and flags

  /** A stat with every counting effect applied: `(base + adds) × muls`, then its caps. */
  stat(id: S): Decimal {
    return this.graph.stat(id);
  }
  /** The counting effects on a stat, in index order. */
  parts(id: S): StatPart[] {
    return this.graph.parts(id);
  }
  explain(id: S): StatBreakdown<S> {
    return this.graph.explain(id);
  }
  /** Whether any counting source raises the flag. Mute groups never silence a flag. */
  flag(id: AnyLayerFlag<L>): boolean {
    return this.graph.flag(id);
  }

  // ------------------------------------------------------------------------------------------- the base

  /** The base resource a second: `stat(rate) ^ stat(exponent)`. */
  get baseRate(): Decimal {
    if (!this.rate) {
      const b = this.index.def.base;
      const r = this.stat(b.rate);
      this.rate = b.exponent ? r.pow(this.stat(b.exponent)) : r;
    }
    return this.rate;
  }

  // ------------------------------------------------------------------------------------------- resets

  /** Other layers of the row already established: the toll's index while this one is not. */
  private crowd(id: L): number {
    const row = this.layer(id).row;
    return this.index.list.filter((o) => o.row === row && o.id !== id && this.state.layers[o.id].established)
      .length;
  }

  /** The layer's requirement, with the row's toll while it is not yet established. */
  requirement(id: L): Decimal {
    const l = this.layer(id);
    const base = D(l.requires);
    const crowd = this.state.layers[id].established ? 0 : this.crowd(id);
    const toll = crowd > 0 ? (l.tolls?.[crowd - 1] ?? l.tolls?.at(-1)) : undefined;
    return toll === undefined ? base : base.mul(toll);
  }

  /** What the layer is measured from, now. */
  from(id: L): Decimal {
    return this.resource(this.layer(id).from);
  }

  private divisor(id: L): Decimal {
    const stat = this.layer(id).cost;
    return stat ? this.stat(stat) : ONE;
  }

  /** A static layer's price of the unit after `held` (infinite past its price list). */
  price(id: L, held: DecimalSource): Decimal {
    const l = this.layer(id);
    const n = D(held);
    if (l.prices) {
      const listed = l.prices[n.toNumber()];
      const toll = this.requirement(id).div(l.requires);
      return listed === undefined ? D(Number.POSITIVE_INFINITY) : D(listed).mul(toll).div(this.divisor(id));
    }
    return this.requirement(id)
      .mul(Decimal.pow(l.scale ?? 2, n.pow(l.curve ?? 1)))
      .div(this.divisor(id));
  }

  /** A normal layer's gain before it is floored: what passive income is a share of. */
  rawGain(id: L): Decimal {
    return this.layer(id).kind === "normal" ? this.rawGainAt(id, this.from(id)) : ZERO;
  }

  /** A normal layer's raw gain were `from` at `amount`. */
  private rawGainAt(id: L, amount: Decimal): Decimal {
    const l = this.layer(id);
    const req = this.requirement(id);
    if (amount.lt(req)) return ZERO;
    return amount
      .div(req)
      .pow(l.exponent ?? 0.5)
      .mul(l.gain ? this.stat(l.gain) : ONE);
  }

  /** What a reset would pay now: the amount for a normal layer, units for a static one. */
  gain(id: L): Decimal {
    const l = this.layer(id);
    if (l.kind === "normal") return this.rawGain(id).floor();
    const held = this.state.layers[id].amount;
    const most = l.prices ? l.prices.length : l.max;
    const cap = most === undefined ? null : D(most);
    if (cap && held.gte(cap)) return ZERO;
    const from = this.from(id);
    if (from.lt(this.price(id, held))) return ZERO;
    if (!this.flag(`bulk:${id}`) || !this.state.layers[id].established) return ONE;
    if (l.prices) {
      let n = held.toNumber();
      while (n < l.prices.length && from.gte(this.price(id, n))) n += 1;
      return D(n).sub(held);
    }
    // The most units `from` covers: the largest n with scale ^ ((n - 1) ^ curve) <= from × divisor ÷ requirement.
    const room = from.mul(this.divisor(id)).div(this.requirement(id));
    const steps = room.log10().toNumber() / (Math.log(l.scale ?? 2) / LN10);
    const reach = D(Math.floor(steps ** (1 / (l.curve ?? 1)) + 1e-9) + 1);
    const top = cap ? Decimal.min(reach, cap) : reach;
    return Decimal.max(ONE, top.sub(held));
  }

  /** What `from` must reach for the next unit (static) or for the gain to rise by one (normal). */
  next(id: L): Decimal {
    const l = this.layer(id);
    if (l.kind === "static") return this.price(id, this.state.layers[id].amount);
    const mult = l.gain ? this.stat(l.gain) : ONE;
    const want = this.gain(id).add(1);
    let at = Decimal.max(
      this.requirement(id),
      this.requirement(id).mul(want.div(mult).pow(1 / (l.exponent ?? 0.5))),
    );
    // The closed form can land a rounding error short of the threshold; `exactNext` nudges it up to the first value
    // that pays `want`.
    if (this.index.def.exactNext)
      for (let i = 0; i < 64 && this.rawGainAt(id, at).floor().lt(want); i++) at = at.mul(1 + 2 ** (i - 52));
    return at;
  }

  /** A static layer that holds all it can. */
  full(id: L): boolean {
    const l = this.layer(id);
    const max = l.prices ? l.prices.length : l.max;
    return max !== undefined && this.state.layers[id].amount.gte(max);
  }

  /** Whether a reset into the layer would go through. Inside a challenge, nothing at its row or above resets. */
  canReset(id: L): boolean {
    const at = this.state.challenge;
    if (at && this.layer(id).row >= this.layer(at.layer).row) return false;
    return this.isOpen(id) && this.gain(id).gte(1);
  }

  /** Sighted (open or established). */
  isOpen(id: L): boolean {
    return this.state.layers[id].sighted;
  }

  status(id: L): LayerStatus {
    const st = this.state.layers[id];
    if (st.sighted) return st.established ? "established" : "open";
    return (this.layer(id).parents ?? []).every((p) => this.state.layers[p].established) ? "shown" : "hidden";
  }

  /** How far `from` is toward `next`, 0 to 1 (logarithmic past the first factor of ten). */
  progress(id: L): number {
    const need = this.next(id);
    const have = this.from(id);
    if (have.gte(need)) return 1;
    if (have.lte(0)) return 0;
    const span = need.log10().toNumber();
    if (span <= 1) return have.div(need).toNumber();
    return Math.max(0, Math.min(1, have.max(1).log10().toNumber() / span));
  }

  // ------------------------------------------------------------------------------------------- power

  /** The layer's power a second (0 without one, or while it is muted). */
  powerRate(id: L): Decimal {
    const p = this.layer(id).power;
    if (!p || this.muted(`${id}.power`)) return ZERO;
    return D(p.rate(this));
  }
  powerCap(id: L): Decimal | null {
    const cap = this.layer(id).power?.cap;
    return cap ? D(cap(this)) : null;
  }

  // ------------------------------------------------------------------------------------------- the shop

  upgradeShown(id: L, u: LayerUpgradeDef<L, S, B>): boolean {
    return this.owns(id, u.id) || !u.shown || u.shown(this);
  }
  canBuy(id: L, u: LayerUpgradeDef<L, S, B>): boolean {
    if (this.owns(id, u.id) || !this.upgradeShown(id, u)) return false;
    if (u.open && !u.open(this)) return false;
    return this.resource(this.layer(id).shop ?? id).gte(u.cost);
  }
  buyableShown(id: L, b: LayerBuyableDef<L, S, B>): boolean {
    if (b.shown && !b.shown(this)) return false;
    if (b.reveal === undefined || this.level(id, b.id) > 0) return true;
    // A layer's amount keeps its best; the base and a power are judged on what is held now.
    const most =
      b.pay === this.index.def.base.id || b.pay.endsWith(".power")
        ? this.resource(b.pay)
        : this.data(b.pay as L).best;
    return most.gte(D(b.first).mul(b.reveal));
  }
  buyableCost(id: L, b: LayerBuyableDef<L, S, B>): Decimal {
    return D(b.first).mul(Decimal.pow(b.growth, this.level(id, b.id) ** (b.curve ?? 1)));
  }
  canLevel(id: L, b: LayerBuyableDef<L, S, B>): boolean {
    return this.buyableShown(id, b) && this.resource(b.pay).gte(this.buyableCost(id, b));
  }
  /** Whether a challenge can be entered now: none entered, enough units held, completions left. */
  canEnter(id: L, c: LayerChallengeDef<L, S, B>): boolean {
    return (
      this.state.challenge === null &&
      this.amount(id).gte(c.needs ?? 0) &&
      this.completions(c.id) < (c.limit ?? 1)
    );
  }
}
