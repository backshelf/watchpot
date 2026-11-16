import { type ComponentType, type ReactNode, useMemo, useState } from "react";
import {
  cx,
  type NavTabsWords,
  PageShell,
  type PageShellFrame,
  type ScreenTable,
  type SheetRegistry,
} from "watchpot/ui";
import { PageRootContext } from "./pageRoot";
import s from "./Shell.module.css";
import { TabBar, type TabBarItem } from "./TabBar";

/** One tab of the page: the tab bar's item and the screen it opens. */
export interface ShellTab<T extends string> extends TabBarItem<T> {
  Screen: ComponentType;
}

/** Props of `Shell`: the tabs, the open one, the header, the sheets, what lies over the page. */
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
  /** Over the page, under the sheets (floating numbers, toasts, a flight layer). */
  overlays?: ReactNode;
  className?: string;
  /** Drawn last, over everything (a banner, the dev panel). */
  children?: ReactNode;
}

/**
 * The game page on `PageShell`: the header along the top, the open tab's screen in its own scroll, the tabs along
 * the foot on a phone and down a rail on a wide page, the station's 2px gutter between the blocks, sheets over it
 * all with the page made inert behind them. Pressing the open tab again scrolls its screen to the top.
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
        overlays={overlays}
      >
        {children}
      </PageShell>
    </PageRootContext.Provider>
  );
}
