/**
 * What the mix desk keeps on this device that is not the mix: the scenes that have been in force (only those are ever
 * named), the window's place and size, what is folded, what is selected and how the panes are sized. One JSON record
 * under the game's `storageKey`; every read and write survives a storage that throws (a private window, blocked
 * site data).
 */
export interface DeskPrefs {
  /** Scene names that have been in force, in the order first heard. */
  seen: string[];
  /** Fold keys of the groups that are closed. */
  folded: string[];
  /** The window's last place and size, in screen pixels. */
  geometry?: { x: number; y: number; w: number; h: number };
  /** The track whose devices are shown. */
  selected?: string;
  /** The source whose samples are shown, by channel id. */
  source?: string;
  /** The detail's open tab. */
  tab?: string;
  /** The detail's height and the sources pane's width, in pixels. */
  detail?: number;
  sources?: number;
}

export const DEFAULT_STORAGE_KEY = "watchpot.soundDesk";

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const size = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;

export function readPrefs(key: string): DeskPrefs {
  const prefs: DeskPrefs = { seen: [], folded: [] };
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return prefs;
    const json = JSON.parse(raw) as Record<string, unknown>;
    prefs.seen = strings(json.seen);
    prefs.folded = strings(json.folded);
    const g = json.geometry as Record<string, unknown> | undefined;
    if (g && [g.x, g.y, g.w, g.h].every((n) => typeof n === "number" && Number.isFinite(n))) {
      prefs.geometry = { x: g.x as number, y: g.y as number, w: g.w as number, h: g.h as number };
    }
    if (typeof json.selected === "string") prefs.selected = json.selected;
    if (typeof json.source === "string") prefs.source = json.source;
    if (typeof json.tab === "string") prefs.tab = json.tab;
    prefs.detail = size(json.detail);
    prefs.sources = size(json.sources);
  } catch {
    // A record that does not read is a fresh desk.
  }
  return prefs;
}

/** Merges `patch` into the stored record (read again first, so the window and the opener never undo each other). */
export function writePrefs(key: string, patch: Partial<DeskPrefs>): void {
  try {
    storage()?.setItem(key, JSON.stringify({ ...readPrefs(key), ...patch }));
  } catch {
    // Storage refused: the desk works on, it only forgets.
  }
}
