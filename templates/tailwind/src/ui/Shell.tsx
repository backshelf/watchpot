import {
  cx,
  type NavTabsWords,
  PageShell,
  type PageShellFrame,
  type ScreenTable,
  type SheetRegistry,
} from "watchpot/ui";
import { type ComponentType, type ReactNode, useMemo, useState } from "react";
import { PageRootContext } from "./pageRoot";
import { TabBar, type TabBarItem } from "./TabBar";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was. The page fills the window
// and never scrolls: the open screen scrolls inside the stage. A phone stacks header, stage and the tab bar; a wide
// page (`data-wide`, measured by `PageShell`) puts the tabs in a rail on the left. The shell is its own stacking
// context, so a backdrop at z-index -1 sits behind everything in it.
const s = {
  shell:
    "group/shell isolate grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto] [grid-template-areas:'header'_'stage'_'nav'] data-[wide]:grid-cols-[200px_minmax(0,1fr)] data-[wide]:grid-rows-[auto_minmax(0,1fr)] data-[wide]:[grid-template-areas:'header_header'_'nav_stage']",
  header: "[grid-area:header]",
  stage: "relative [grid-area:stage] min-h-0",
  under: "h-full",
  // Positioned, so anything absolute inside a screen (a visually hidden label) is clipped by this scroll instead of
  // escaping to the stage and stretching the document below the window.
  scroll: "relative h-full overflow-y-auto overscroll-contain",
  // On a wide page the tab bar fills its row, its box sized to the row.
  nav: "[grid-area:nav] min-h-0 group-data-[wide]/shell:*:h-full group-data-[wide]/shell:*:box-border",
  // The sheets portal to the body; their outlet takes no room in the grid.
  sheets: "contents",
};

/** One tab of the page: the tab bar's item and the screen it opens. */
export interface ShellTab<T extends string> extends TabBarItem<T> {
  Screen: ComponentType;
}

/** Props of `Shell`: the tabs, the open one, the header, the sheets, what lies behind and over the page. */
export interface ShellProps<T extends string, S extends { kind: string }> {
  /** The tab bar's accessible name: the game's name. */
  label: string;
  tabs: readonly ShellTab<T>[];
  tab: T;
  onSelectTab: (tab: T) => void;
  /** What a tab's count and lock add to its name, in the game's words. */
  tabWords?: NavTabsWords;
  header?: (frame: PageShellFrame) => ReactNode;
  sheets?: SheetRegistry<S>;
  sheet?: S | null;
  onCloseSheet?: () => void;
  /** Behind the page (a `Backdrop`). */
  backdrop?: ReactNode;
  /** Over the page, under the sheets (floating numbers, toasts, a flight layer). */
  overlays?: ReactNode;
  className?: string;
  /** Drawn last, over everything (a banner, the dev panel). */
  children?: ReactNode;
}

/**
 * The game page on `PageShell`: the header along the top, the open tab's screen in its own scroll, the tabs along
 * the foot on a phone and down the side on a wide page, sheets over it all with the page made inert behind them.
 * Pressing the open tab again scrolls its screen to the top.
 */
export function Shell<T extends string, S extends { kind: string } = never>({
  label,
  tabs,
  tab,
  onSelectTab,
  tabWords,
  header,
  sheets,
  sheet = null,
  onCloseSheet,
  backdrop,
  overlays,
  className,
  children,
}: ShellProps<T, S>) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const screens = useMemo(
    () => Object.fromEntries(tabs.map((t) => [t.id, t.Screen])) as unknown as ScreenTable<T>,
    [tabs],
  );
  return (
    <PageRootContext.Provider value={root}>
      <PageShell<T, never, S>
        ref={setRoot}
        className={cx(s.shell, className)}
        classNames={{ stage: s.stage, under: s.under, scroll: s.scroll, nav: s.nav, sheets: s.sheets }}
        tab={tab}
        screens={screens}
        sheets={sheets}
        sheet={sheet}
        onCloseSheet={onCloseSheet}
        covered={sheet !== null}
        header={header && ((frame) => <div className={s.header}>{header(frame)}</div>)}
        nav={(frame) => (
          <TabBar
            tabs={tabs}
            current={tab}
            onSelect={(id) => (id === tab ? frame.reselect() : onSelectTab(id))}
            label={label}
            words={tabWords}
            rail={frame.wide}
          />
        )}
        overlays={
          <>
            {backdrop}
            {overlays}
          </>
        }
      >
        {children}
      </PageShell>
    </PageRootContext.Provider>
  );
}
