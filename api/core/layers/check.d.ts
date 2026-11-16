import { type LayerModelDef } from "./types";
/**
 * The definition-time check inside `layerModel`: throws on the first problem, naming it. A repeated id (a layer, or an
 * upgrade, buyable or milestone within one layer, or a challenge anywhere), a resource, parent, flag or mute group
 * that names an unknown layer, a `.power` of a layer without one, a layer measured from a higher row, a static layer
 * with neither a `scale` nor `prices`, a milestone on an unknown count, or a row that is not a whole number from 1.
 */
export declare function checkLayers<L extends string, S extends string, B extends string>(def: LayerModelDef<L, S, B>): void;
