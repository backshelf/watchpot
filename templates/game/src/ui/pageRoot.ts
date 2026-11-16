import { createContext, useContext } from "react";

/**
 * The game page's root element, provided by `Shell`: what a modal `Sheet` makes inert while it is open (the sheet
 * itself is portalled out of it, to the body).
 */
export const PageRootContext = createContext<HTMLElement | null>(null);

/** The page root, or null outside a `Shell` (a test that renders a sheet alone). */
export const usePageRoot = () => useContext(PageRootContext);
