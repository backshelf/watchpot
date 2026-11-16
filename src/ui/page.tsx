// The game page's behaviour without its look: a header, the open tab's screen in a scroll region keyed by tab, a page
// that stacks over the screen with a way back, a sheets outlet over a registry, and the page's measured width
// provided to everything inside. It reads no store: the game hands in its tables and the three facts.
import {
  type ComponentPropsWithRef,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { type PageLayout, PageLayoutProvider, usePageLayoutObserver } from "../react/layout";
import { useEscape, useFocusTrap, useLatest, useOpenerFocus } from "./hooks";
import { useComposedRefs } from "./slot";

/** The game's screens by tab: a mapped type, so a tab without a screen fails the typecheck. */
export type ScreenTable<T extends string> = { readonly [K in T]: ComponentType };

/** The game's pages by id: a mapped type, so a page without a view fails the typecheck. */
export type PageViews<P extends string> = { readonly [K in P]: ComponentType };

/**
 * The game's sheets by kind: each draws its sheet with `close`, or returns null when it cannot (the outlet then
 * closes it). A mapped type over the sheet union, so a kind the registry misses fails the typecheck.
 */
export type SheetRegistry<S extends { kind: string }> = {
  readonly [K in S["kind"]]: (sheet: Extract<S, { kind: K }>, close: () => void) => ReactElement | null;
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
export interface PageShellProps<
  T extends string,
  P extends string = never,
  S extends { kind: string } = never,
> extends Omit<ComponentPropsWithRef<"div">, "children"> {
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
export function PageShell<T extends string, P extends string = never, S extends { kind: string } = never>(
  props: PageShellProps<T, P, S>,
) {
  const {
    tab,
    screens,
    page = null,
    pages,
    onClosePage,
    pageBar,
    sheet = null,
    sheets,
    onCloseSheet,
    header,
    nav,
    overlays,
    covered = false,
    sheetsInert = false,
    foldAt = 120,
    unfoldAt = 24,
    scrollBehavior = "smooth",
    classNames = {},
    children,
    ref,
    ...rest
  } = props;
  const root = useRef<HTMLDivElement>(null);
  const refs = useComposedRefs(root, ref);
  const scroll = useRef<HTMLElement>(null);
  const layout: PageLayout = usePageLayoutObserver(root);
  const [scrolled, setScrolled] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new tab opens at its top
  useEffect(() => setScrolled(false), [tab]);
  const Screen: ComponentType | undefined = screens[tab];
  const Page: ComponentType | undefined = page === null || !pages ? undefined : pages[page];
  const open = page !== null && Page !== undefined;

  const reselect = () => {
    if (page !== null) onClosePage?.();
    else scroll.current?.scrollTo({ top: 0, behavior: scrollBehavior });
  };
  const frame: PageShellFrame = { scrolled, wide: layout.wide, reselect };

  return (
    <div
      {...rest}
      ref={refs}
      data-tab={tab}
      data-page={open ? page : undefined}
      data-wide={layout.wide || undefined}
    >
      <PageLayoutProvider value={layout}>
        {header?.(frame)}
        <div data-stage="" className={classNames.stage}>
          <div data-under="" className={classNames.under} inert={open}>
            <main
              key={tab}
              ref={scroll}
              data-scroll=""
              className={classNames.scroll}
              inert={covered}
              onScroll={(event) => {
                const top = event.currentTarget.scrollTop;
                setScrolled((was) => (was ? top > unfoldAt : top > foldAt));
              }}
            >
              {Screen ? <Screen /> : null}
            </main>
          </div>
          {open && Page ? (
            <PageView
              key={page}
              id={page}
              Page={Page}
              covered={covered}
              bar={pageBar}
              onClose={() => onClosePage?.()}
              classNames={classNames}
            />
          ) : null}
        </div>
        {nav ? (
          <div data-nav="" className={classNames.nav} inert={covered}>
            {nav(frame)}
          </div>
        ) : null}
        {overlays}
        {sheets ? (
          <div data-sheets="" className={classNames.sheets} inert={sheetsInert}>
            <SheetOutlet registry={sheets} sheet={sheet} onClose={() => onCloseSheet?.()} />
          </div>
        ) : null}
        {children}
      </PageLayoutProvider>
    </div>
  );
}

interface PageViewProps<P extends string> {
  id: P;
  Page: ComponentType;
  covered: boolean;
  bar: ((page: P, back: () => void) => ReactNode) | undefined;
  onClose: () => void;
  classNames: Partial<Record<PageShellPart, string>>;
}

/** The open page: its bar, then its own scroll region. Focus lands in it and returns to the opener on close. */
function PageView<P extends string>({ id, Page, covered, bar, onClose, classNames }: PageViewProps<P>) {
  const view = useRef<HTMLDivElement>(null);
  const close = useLatest(onClose);
  useOpenerFocus(true);
  useFocusTrap(view, { contain: false });
  // Escape closes the page unless something covers it (that layer answers Escape itself).
  useEscape(() => close.current(), !covered);
  return (
    <div ref={view} data-page-view={id} className={classNames.page} inert={covered} tabIndex={-1}>
      {bar?.(id, () => close.current())}
      <div data-scroll="" className={classNames.pageScroll}>
        <Page />
      </div>
    </div>
  );
}

/** Props of `SheetOutlet`: the open sheet, the registry that draws it and the close callback. */
export interface SheetOutletProps<S extends { kind: string }> {
  registry: SheetRegistry<S>;
  sheet: S | null;
  onClose: () => void;
}

type SheetDraw<S> = (sheet: S, close: () => void) => ReactElement | null;

/**
 * The open sheet, drawn from the registry. A sheet the registry cannot draw would leave the page covered with
 * nothing on screen, so it is closed.
 */
export function SheetOutlet<S extends { kind: string }>({ registry, sheet, onClose }: SheetOutletProps<S>) {
  const draw = sheet === null ? undefined : (registry[sheet.kind as S["kind"]] as SheetDraw<S> | undefined);
  const element = sheet !== null && draw ? draw(sheet, onClose) : null;
  const blank = sheet !== null && element === null;
  const close = useLatest(onClose);
  useEffect(() => {
    if (blank) close.current();
  }, [blank, close]);
  return element;
}
