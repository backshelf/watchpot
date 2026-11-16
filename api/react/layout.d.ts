import { type ReactNode, type RefObject } from "react";
/**
 * The game page's width, for the few things CSS cannot switch alone (the rail's markup, centred dialogs, a
 * two-page spread). CSS reads the same fact from the page root's attribute: `[data-wide] .x`.
 * Never a named container query: Bun's CSS modules hash the name in `@container page` but not in `container: page`.
 */
export interface PageLayout {
    /** The page is at least `WIDE_AT` wide: the left rail, two columns, centred dialogs. */
    wide: boolean;
    /** The page root's content width in px. */
    width: number;
}
/** Where the page turns wide; the page root carries `data-wide` from here. */
export declare const WIDE_AT = 900;
interface PageLayoutProviderProps {
    /**
     * The layout to hand down; without one the provider passes on whatever is above it. A provider with a value
     * above the page wins over the page's own measurement (tests pin the width this way).
     */
    value?: PageLayout;
    children: ReactNode;
}
/** Provides a page layout value to the tree; a value above the page wins, which is how tests pin the width. */
export declare function PageLayoutProvider({ value, children }: PageLayoutProviderProps): import("react").JSX.Element;
/** The game page's layout, from the nearest provider; narrow outside one. */
export declare function usePageLayout(): PageLayout;
/**
 * Measures the page root with a `ResizeObserver` and returns its layout. A provider above the page wins and nothing
 * is observed (happy-dom has no layout, so tests pin the width that way); without `ResizeObserver` it is narrow.
 */
export declare function usePageLayoutObserver(ref: RefObject<HTMLElement | null>): PageLayout;
export {};
