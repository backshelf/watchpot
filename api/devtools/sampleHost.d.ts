import type { SampleHost } from "../sound/desk";
export type FetchSampleHostOptions = {
    /** The fetch to use (default the page's). */
    fetch?: (input: string, init?: RequestInit) => Promise<Response>;
};
/**
 * The `SampleHost` a game's dev server serves at `url` (where it mounted `sampleHost`, say `"/__samples"`): give it to
 * `openSoundDesk({ samples })`.
 */
export declare function fetchSampleHost(url: string, options?: FetchSampleHostOptions): SampleHost;
