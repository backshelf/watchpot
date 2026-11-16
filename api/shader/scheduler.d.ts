/** How many tiles animate at once by default; past it the oldest live tiles hold their last frame. */
export declare const MAX_LIVE_TILES = 12;
/** One tile registered with the scheduler. */
export interface ShaderSlot {
    /** Draw on the next frame (an input changed). */
    requestDraw(): void;
    /** Live tiles redraw every frame while visible; still ones draw when asked. */
    setLive(live: boolean): void;
    dispose(): void;
}
/** What the scheduler is given: frames, visibility, the tab's hidden flag and reduced motion. Injected for tests. */
export interface ShaderSchedulerDeps {
    raf(cb: (now: number) => void): number;
    caf(id: number): void;
    /** Watches an element's visibility, calling back on each change (at once if visible); returns the unwatch. */
    observe(el: Element, onChange: (visible: boolean) => void): () => void;
    hidden(): boolean;
    /** Calls back when the tab's hidden flag flips; returns the unsubscribe. */
    onHidden(cb: () => void): () => void;
    reduced(): boolean;
}
/** The scheduler's counters: draws and frames run, tiles registered, tiles looping now. */
export interface ShaderSchedulerStats {
    draws: number;
    frames: number;
    slots: number;
    looping: number;
}
/** A pool scheduler: `register` a tile's element and draw function; `refresh` after reduced motion flips. */
export declare function createShaderScheduler(deps: ShaderSchedulerDeps, { maxLive }?: {
    maxLive?: number | undefined;
}): {
    register(el: Element, draw: (now: number) => void): ShaderSlot;
    /** Every tile draws again on the next frame (reduced motion flipped, the context came back). */
    refresh(): void;
    stats(): ShaderSchedulerStats;
    /** Stops the loop and the hidden-tab watch. */
    dispose(): void;
};
/** The scheduler `createShaderScheduler` makes. */
export type ShaderScheduler = ReturnType<typeof createShaderScheduler>;
/** The browser's frames, visibility and hidden flag, with tiles waking `rootMargin` before they scroll in. */
export declare function browserSchedulerDeps(reduced: () => boolean, rootMargin?: string): ShaderSchedulerDeps;
