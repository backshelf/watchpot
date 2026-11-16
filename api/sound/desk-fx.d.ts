/**
 * Every setting of every effect kind as the mix desk draws it: its range, where the effect starts when the mix says
 * nothing, its unit and how a control travels. Written from each effect's header in `dsp/src/fx/*.rs` and
 * `dsp/src/freeze.rs`; `test/sound/desk-fx.test.ts` holds it to `FX_PARAMS`.
 */
import type { DeskParam } from "./desk";
import type { FxDef } from "./types";
/** Each `FxDef` kind's settings, in the order the core numbers them. */
export declare const DESK_FX: Readonly<Record<FxDef["kind"], readonly DeskParam[]>>;
/** A setting's entry, or undefined for one the kind does not have. */
export declare const deskParam: (kind: FxDef["kind"], param: string) => DeskParam | undefined;
