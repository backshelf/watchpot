import { Component, type ErrorInfo, type ReactNode } from "react";
/** What a crash hands the game's fallback: what was thrown, and a way to try the page again. */
export interface Crash {
    error: unknown;
    /** Clears the crash and renders the children again (a second throw lands back in the fallback). */
    retry: () => void;
}
/** Props of `CrashBoundary`: the fallback's renderer and an optional listener. */
export interface CrashBoundaryProps {
    /** The page shown in place of the children: the game's own words, its save as text, a way to reload. */
    fallback: (crash: Crash) => ReactNode;
    /** Told once per crash, with React's component stack. */
    onCrash?: (error: unknown, info: ErrorInfo) => void;
    children?: ReactNode;
}
/**
 * Catches a throw from anything rendered under it (a screen, or `useGameClock` when the clock stops at its failure
 * limit) and renders `fallback` instead, so a broken pass never leaves a blank page. It has no look and no words:
 * the fallback is the game's, and it may read the store (to offer the save as text) because the boundary sits under
 * the store's provider.
 */
export declare class CrashBoundary extends Component<CrashBoundaryProps, {
    crash: {
        error: unknown;
    } | null;
}> {
    state: {
        crash: {
            error: unknown;
        } | null;
    };
    static getDerivedStateFromError(error: unknown): {
        crash: {
            error: unknown;
        };
    };
    componentDidCatch(error: unknown, info: ErrorInfo): void;
    retry: () => void;
    render(): ReactNode;
}
