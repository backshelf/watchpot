/**
 * What every part of the desk's window reads: the desk and what stays the same for a window's life (`DeskCtx`), and
 * the desk as it stands after its latest change with the layer being edited (`ViewCtx`). A part that reads the view
 * draws again on every change; the controls under it are memoised and skip the ones that did not move.
 */
import { createContext, type RefObject, useContext } from "react";
import type { Desk, SampleHost } from "../../sound/desk";
import type { DeskLoop } from "./loop";
import type { Snapshot } from "./model";
import type { SampleDraft } from "./samples";

/** A line the desk says to the person: a save, a refusal, a failure. */
export type Note = { tone: "ok" | "warn" | "bad"; text: string } | null;

export interface DeskCtxValue {
  desk: Desk;
  loop: DeskLoop;
  /** Who processes and writes recordings; without one, samples and takes are shown and not changed. */
  host: SampleHost | undefined;
  /** The latest snapshot and edit layer, for callbacks that must not change identity on each render. */
  snap: RefObject<Snapshot>;
  edit: RefObject<string>;
  note: (note: Note) => void;
  selectTrack: (bus: string) => void;
  selectSource: (id: string) => void;
  /** Recordings dropped in this window and not yet saved, by sample key: an edit runs the same file again. */
  files: Map<string, File>;
  /** What a person set for a sample's next run and has not applied, by sample key: kept while another is looked at. */
  drafts: Map<string, SampleDraft>;
  /**
   * Recordings dropped here that the pipeline refused as they stood (a loop that is not whole bars at the tempo read
   * for it), by sample key: held so the editor can draw one, take its tempo, bars or trim, and run it again.
   */
  pending: Map<string, File>;
  /** What the staged recording of a sample was last run with, by sample key: what "no change" means in its editor. */
  stagedWith: Map<string, SampleDraft>;
}

export interface View {
  snap: Snapshot;
  /** The layer every write lands in: `"mix"` or `"scene:<name>"`. */
  edit: string;
}

export const DeskCtx = createContext<DeskCtxValue | null>(null);
export const ViewCtx = createContext<View | null>(null);

export const useDesk = (): DeskCtxValue => {
  const ctx = useContext(DeskCtx);
  if (!ctx) throw new Error("SoundDeskView: no desk in context");
  return ctx;
};
export const useView = (): View => {
  const ctx = useContext(ViewCtx);
  if (!ctx) throw new Error("SoundDeskView: no view in context");
  return ctx;
};
