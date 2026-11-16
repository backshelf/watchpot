import { LAYER_FLAG_KINDS, LAYER_MILESTONE_COUNTS, type LayerModelDef } from "./types";

/**
 * The definition-time check inside `layerModel`: throws on the first problem, naming it. A repeated id (a layer, or an
 * upgrade, buyable or milestone within one layer, or a challenge anywhere), a resource, parent, flag or mute group
 * that names an unknown layer, a `.power` of a layer without one, a layer measured from a higher row, a static layer
 * with neither a `scale` nor `prices`, a milestone on an unknown count, or a row that is not a whole number from 1.
 */
export function checkLayers<L extends string, S extends string, B extends string>(
  def: LayerModelDef<L, S, B>,
): void {
  const fail = (what: string): never => {
    throw new Error(`layers: ${what}`);
  };
  const rows = new Map<string, number>();
  const powered = new Set<string>();
  for (const l of def.layers) {
    if (rows.has(l.id)) fail(`layer "${l.id}" is declared twice`);
    if ((l.id as string) === def.base.id) fail(`layer "${l.id}" has the base resource's id`);
    if (l.id.includes(".") || l.id.includes(":")) fail(`layer "${l.id}": an id cannot contain "." or ":"`);
    if (!Number.isInteger(l.row) || l.row < 1)
      fail(`layer "${l.id}": row ${l.row} is not a whole number from 1`);
    rows.set(l.id, l.row);
    if (l.power) powered.add(l.id);
  }

  const resource = (where: string, ref: string): number => {
    if (ref === def.base.id) return 0;
    if (ref.endsWith(".power")) {
      const id = ref.slice(0, -6);
      if (!rows.has(id)) fail(`${where} names an unknown layer "${id}"`);
      if (!powered.has(id)) fail(`${where} names "${ref}", but layer "${id}" has no power`);
      return rows.get(id) ?? 0;
    }
    if (!rows.has(ref)) fail(`${where} names an unknown resource "${ref}"`);
    return rows.get(ref) ?? 0;
  };
  const flags = (where: string, list: readonly string[] | undefined) => {
    for (const f of list ?? []) {
      const at = f.indexOf(":");
      if (at < 0) continue;
      const kind = f.slice(0, at);
      if (!(LAYER_FLAG_KINDS as readonly string[]).includes(kind)) continue;
      if (!rows.has(f.slice(at + 1))) fail(`${where}: flag "${f}" names an unknown layer`);
    }
  };
  const unique = (where: string, ids: readonly string[]) => {
    const met = new Set<string>();
    for (const id of ids) {
      if (met.has(id)) fail(`${where}: "${id}" is declared twice`);
      met.add(id);
    }
  };

  const challenges = new Set<string>();
  for (const l of def.layers) {
    const at = `layer "${l.id}"`;
    const fromRow = resource(`${at} from`, l.from);
    if (fromRow > l.row)
      fail(`${at} (row ${l.row}) is measured from "${l.from}" in the higher row ${fromRow}`);
    if (l.shop) resource(`${at} shop`, l.shop);
    for (const p of l.parents ?? []) if (!rows.has(p)) fail(`${at} has an unknown parent "${p}"`);
    if (l.kind === "static" && l.scale === undefined && l.prices === undefined)
      fail(`${at} is static with neither a scale nor prices`);
    if (l.kind !== "static" && l.kind !== "normal") fail(`${at} has an unknown kind "${String(l.kind)}"`);

    unique(
      `${at} upgrades`,
      (l.upgrades ?? []).map((u) => u.id),
    );
    unique(
      `${at} buyables`,
      (l.buyables ?? []).map((b) => b.id),
    );
    unique(
      `${at} milestones`,
      (l.milestones ?? []).map((m) => m.id),
    );
    flags(`${at} holding`, l.holding?.flags);
    flags(`${at} power`, l.power?.flags);
    for (const u of l.upgrades ?? []) flags(`${at} upgrade "${u.id}"`, u.flags);
    for (const b of l.buyables ?? []) {
      resource(`${at} buyable "${b.id}" pay`, b.pay);
      flags(`${at} buyable "${b.id}"`, b.flags);
    }
    for (const m of l.milestones ?? []) {
      if (m.on !== undefined && !LAYER_MILESTONE_COUNTS.includes(m.on))
        fail(`${at} milestone "${m.id}" counts an unknown "${String(m.on)}"`);
      flags(`${at} milestone "${m.id}"`, m.flags);
    }
    for (const c of l.challenges ?? []) {
      if (challenges.has(c.id)) fail(`challenge "${c.id}" is declared twice`);
      challenges.add(c.id);
      flags(`${at} challenge "${c.id}"`, c.flags);
      for (const g of c.mutes ?? []) {
        const dot = g.lastIndexOf(".");
        if (!rows.has(g.slice(0, dot))) fail(`${at} challenge "${c.id}" mutes "${g}", an unknown layer`);
      }
    }
  }
  for (const x of def.sources ?? []) flags(`source "${x.label}"`, x.flags);
  unique(
    "tags",
    (def.tags ?? []).map((m) => m.id),
  );
}
