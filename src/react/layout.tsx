import { createContext, type ReactNode, type RefObject, useContext, useLayoutEffect, useState } from "react";

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
export const WIDE_AT = 900;

/** Without a measurement (no `ResizeObserver`, no provider): the 390px column. */
const NARROW: PageLayout = { wide: false, width: 390 };

const layoutOf = (width: number): PageLayout => ({ wide: width >= WIDE_AT, width });

const PageLayoutContext = createContext<PageLayout | null>(null);

interface PageLayoutProviderProps {
  /**
   * The layout to hand down; without one the provider passes on whatever is above it. A provider with a value
   * above the page wins over the page's own measurement (tests pin the width this way).
   */
  value?: PageLayout;
  children: ReactNode;
}

/** Provides a page layout value to the tree; a value above the page wins, which is how tests pin the width. */
export function PageLayoutProvider({ value, children }: PageLayoutProviderProps) {
  const outer = useContext(PageLayoutContext);
  return <PageLayoutContext.Provider value={value ?? outer}>{children}</PageLayoutContext.Provider>;
}

/** The game page's layout, from the nearest provider; narrow outside one. */
export function usePageLayout(): PageLayout {
  return useContext(PageLayoutContext) ?? NARROW;
}

/**
 * Measures the page root with a `ResizeObserver` and returns its layout. A provider above the page wins and nothing
 * is observed (happy-dom has no layout, so tests pin the width that way); without `ResizeObserver` it is narrow.
 */
export function usePageLayoutObserver(ref: RefObject<HTMLElement | null>): PageLayout {
  const outer = useContext(PageLayoutContext);
  const [measured, setMeasured] = useState(NARROW);
  useLayoutEffect(() => {
    const el = ref.current;
    if (outer !== null || !el || typeof ResizeObserver === "undefined") return;
    // Read once before the first paint, so a wide page never shows a frame of the bottom bar.
    const set = (width: number) => setMeasured((was) => (was.width === width ? was : layoutOf(width)));
    set(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) set(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, outer]);
  return outer ?? measured;
}
