import { type ComponentPropsWithRef, type ComponentType, type ReactElement, type ReactNode } from "react";
/** The game's screens by tab: a mapped type, so a tab without a screen fails the typecheck. */
export type ScreenTable<T extends string> = {
    readonly [K in T]: ComponentType;
};
/** The game's pages by id: a mapped type, so a page without a view fails the typecheck. */
export type PageViews<P extends string> = {
    readonly [K in P]: ComponentType;
};
/**
 * The game's sheets by kind: each draws its sheet with `close`, or returns null when it cannot (the outlet then
 * closes it). A mapped type over the sheet union, so a kind the registry misses fails the typecheck.
 */
export type SheetRegistry<S extends {
    kind: string;
}> = {
    readonly [K in S["kind"]]: (sheet: Extract<S, {
        kind: K;
    }>, close: () => void) => ReactElement | null;
};
/** What the header and nav are drawn with: the column's fold, the page's width and the reselect action. */
export interface PageShellFrame {
    /** The column has scrolled past its fold. */
    scrolled: boolean;
    wide: boolean;
    /** The open tab pressed again: closes an open page, else scrolls the column to its top. */
    reselect: () => void;
}
/** The parts of `PageShell` a game can class: each is also marked by its data attribute. */
export type PageShellPart = "stage" | "under" | "scroll" | "page" | "pageScroll" | "nav" | "sheets";
/** Props of `PageShell`: the tables, the three facts (tab, page, sheet), the slots and a div's. */
export interface PageShellProps<T extends string, P extends string = never, S extends {
    kind: string;
} = never> extends Omit<ComponentPropsWithRef<"div">, "children"> {
    /** The open tab. */
    tab: T;
    screens: ScreenTable<T>;
    /** The open page over the screen, or null. */
    page?: P | null;
    pages?: PageViews<P>;
    onClosePage?: () => void;
    /** The bar over an open page (its back button, in the game's words), given the page and the way back. */
    pageBar?: (page: P, back: () => void) => ReactNode;
    /** The open sheet, or null. */
    sheet?: S | null;
    sheets?: SheetRegistry<S>;
    onCloseSheet?: () => void;
    header?: (frame: PageShellFrame) => ReactNode;
    /** The tab navigation (a `NavTabs`), after the stage. */
    nav?: (frame: PageShellFrame) => ReactNode;
    /** Drawn after the nav, under the sheets (a status line, floating numbers). */
    overlays?: ReactNode;
    /** Something covers the screen (a sheet, a takeover): the column, the page and the nav go inert. */
    covered?: boolean;
    /** The sheets' slot goes inert (a takeover over a sheet). */
    sheetsInert?: boolean;
    /** Scroll depth past which the column counts as scrolled, px. Default 120. */
    foldAt?: number;
    /** Depth under which it no longer does (a gap, so the fold never flickers), px. Default 24. */
    unfoldAt?: number;
    /** How reselect scrolls to the top: pass "auto" under reduced motion. Default "smooth". */
    scrollBehavior?: ScrollBehavior;
    /** A class for each inner part. */
    classNames?: Partial<Record<PageShellPart, string>>;
    /** Drawn last, over the sheets (takeovers). */
    children?: ReactNode;
}
/**
 * The game page, headless: `header`, the open tab's screen in a `<main>` scroll region keyed by tab (a new tab opens
 * at its top), the open page stacked over it (focus moves to its bar and back to the opener; Escape closes it), the
 * `nav`, `overlays`, the sheets outlet and takeovers. The root carries `data-tab`, `data-page` and `data-wide`, and
 * provides the measured page layout (`usePageLayout`). Every inner part is a div marked by a data attribute.
 */
export declare function PageShell<T extends string, P extends string = never, S extends {
    kind: string;
} = never>(props: PageShellProps<T, P, S>): import("react").JSX.Element;
/** Props of `SheetOutlet`: the open sheet, the registry that draws it and the close callback. */
export interface SheetOutletProps<S extends {
    kind: string;
}> {
    registry: SheetRegistry<S>;
    sheet: S | null;
    onClose: () => void;
}
/**
 * The open sheet, drawn from the registry. A sheet the registry cannot draw would leave the page covered with
 * nothing on screen, so it is closed.
 */
export declare function SheetOutlet<S extends {
    kind: string;
}>({ registry, sheet, onClose }: SheetOutletProps<S>): ReactElement<unknown, string | import("react").JSXElementConstructor<any>> | null;
