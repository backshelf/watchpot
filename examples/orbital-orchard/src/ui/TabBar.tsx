import type { ReactNode } from "react";
import { cx, NavTabs, type NavTabsWords } from "watchpot/ui";
import { badgeText } from "./Badge";
import s from "./TabBar.module.css";

/** One tab: its id, its name, its icon, what waits behind it and whether it is open yet. */
export interface TabBarItem<T extends string = string> {
  id: T;
  label: string;
  icon?: ReactNode;
  /** Things waiting: a figure on the tab, said in `words.count`. */
  count?: number;
  /** Not open yet: dimmed, said in `words.locked`. It still presses. */
  locked?: boolean;
}

/** Props of `TabBar`: the tabs, the open one, the press, the nav's name, its words and its shape. */
export interface TabBarProps<T extends string> {
  tabs: readonly TabBarItem<T>[];
  current: T;
  onSelect: (id: T) => void;
  /** The nav landmark's name: the game's. */
  label: string;
  /** What a count and a lock add to a tab's name, in the game's words. */
  words?: NavTabsWords;
  /** A wide page's rail down the side, each block its icon and its name; otherwise a bar of icons along the foot. */
  rail?: boolean;
  className?: string;
}

/**
 * The game's tabs on `NavTabs`: a flat block per tab ruled in the control's edge, the gutter between them, the open
 * one (`data-current`) the signal block. Narrow, a bar of icons alone along the foot (the names are read, not drawn:
 * five names do not fit a phone); as the rail, a column of tall blocks, each its icon at the top and its name at the
 * foot. A count is a square at the top right, capped at 99, said through `words.count`.
 */
export function TabBar<T extends string>({
  tabs,
  current,
  onSelect,
  label,
  words,
  rail = false,
  className,
}: TabBarProps<T>) {
  return (
    <NavTabs.Root
      current={current}
      onSelect={(id) => onSelect(id as T)}
      aria-label={label}
      className={cx(s.bar, className)}
      data-rail={rail ? "" : undefined}
    >
      {tabs.map((tab) => (
        <NavTabs.Item
          key={tab.id}
          value={tab.id}
          locked={tab.locked}
          count={tab.count}
          words={words}
          className={s.tab}
          data-tab={tab.id}
        >
          {tab.icon !== undefined && (
            <span className={s.icon} aria-hidden="true">
              {tab.icon}
            </span>
          )}
          <span className={s.label}>{tab.label}</span>
          <NavTabs.Badge className={s.count} format={badgeText} />
        </NavTabs.Item>
      ))}
    </NavTabs.Root>
  );
}
