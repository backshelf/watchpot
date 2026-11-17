import { cx, NavTabs, type NavTabsWords } from "watchpot/ui";
import type { ReactNode } from "react";
import { badgeText } from "./Badge";

// The look: Tailwind utilities over the --ui-* tokens (theme.css), where the CSS module was. Narrow: a bar along the
// foot, one equal cell per tab. Wide (`data-rail`): a rail down the side, one row per tab.
const s = {
  bar:
    "group/bar grid auto-cols-fr grid-flow-col gap-1 pt-1.5 px-2 [padding-bottom:calc(6px_+_env(safe-area-inset-bottom,0px))] border-t border-ui-line bg-ui-surface data-[rail]:grid-flow-row data-[rail]:auto-rows-min data-[rail]:content-start data-[rail]:p-3 data-[rail]:border-t-0 data-[rail]:border-r data-[rail]:border-ui-line",
  tab: "relative grid justify-items-center gap-0.5 min-w-0 min-h-12 py-1.5 px-1 border-0 rounded-ui bg-transparent text-ui-ink-muted cursor-pointer [transition:background-color_var(--ui-duration)_ease-out] group-data-[rail]/bar:grid-cols-[auto_1fr_auto] group-data-[rail]/bar:justify-items-start group-data-[rail]/bar:items-center group-data-[rail]/bar:gap-2.5 group-data-[rail]/bar:py-2.5 group-data-[rail]/bar:px-3 hover:text-ui-ink data-[current]:bg-ui-sunken data-[current]:text-ui-ink data-[locked]:opacity-[0.45]",
  icon: "inline-flex",
  label:
    "max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold group-data-[rail]/bar:text-[14px]",
  // The count: on the icon's corner in the bar, at the row's end on the rail.
  count:
    "absolute top-0.5 right-[calc(50%_-_22px)] min-w-4 px-1 py-0.5 box-border rounded-ui bg-ui-accent text-ui-on-accent font-ui-num text-[10px] font-semibold leading-none text-center group-data-[rail]/bar:static",
};

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
