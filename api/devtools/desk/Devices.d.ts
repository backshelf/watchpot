import type { DeskBus, DeskFx } from "../../sound/desk";
/** An effect's name on its bus: its kind, numbered when the bus has more than one of the kind. */
export declare function fxName(bus: DeskBus, fx: DeskFx): string;
export declare function Devices({ bus, sends }: {
    bus: DeskBus;
    sends: readonly string[];
}): import("react").JSX.Element;
