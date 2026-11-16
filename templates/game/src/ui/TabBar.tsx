import { cx, NavTabs, type NavTabsWords } from "watchpot/ui";
import type { ReactNode } from "react";
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
  /** A wide page's rail down the side, the names drawn; otherwise a bar along the foot, icons over short names. */
  rail?: boolean;
  className?: string;
}

/**
 * The game's tabs on `NavTabs`: each a tab stop, the open one `aria-current="page"` (`data-current`). A count is a
 * figure capped at 99 (`NavTabs.Badge`'s `format`), said through `words.count`.
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
