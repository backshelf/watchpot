// Three ways to pick one of several: `Tabs` (the WAI-ARIA tabs pattern, one tab stop), `NavTabs` (page navigation,
// each a tab stop, `aria-current`) and `BuyAmount` (a radio group of buy modes).
import {
  type ComponentPropsWithRef,
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useId,
  useRef,
} from "react";
import { type Orientation, useControllable, useRovingFocus } from "./hooks";
import { partContext } from "./portal";
import { VisuallyHidden } from "./simple";
import { type AsChild, chain, mergeProps, renderPart, useComposedRefs } from "./slot";

/** An id-safe form of a value, for the ids that tie a tab to its panel. */
const idPart = (value: string) => value.replace(/[^\w-]/g, "_");

// ---------------------------------------------------------------------------------------------------------------
// Tabs

/** Options of `useTabs`: the selected value, the axis and how arrows select. */
export interface TabsOptions {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Which arrows move between tabs. Default "horizontal". */
  orientation?: Exclude<Orientation, "both">;
  /** "automatic" selects as focus moves; "manual" waits for Enter or Space. Default "automatic". */
  activation?: "automatic" | "manual";
  /** Arrows wrap at the ends. Default true. */
  loop?: boolean;
  /**
   * Which tabs name their panel with `aria-controls`. "all" (the default) is for panels that are all in the page,
   * the closed ones `hidden`; "selected" is for a game that mounts only the open panel, so no tab points at an id
   * that is not there.
   */
  controls?: "all" | "selected";
}

/** What `useTabs` hands back: the selection and the props for the list, each tab and each panel. */
export interface TabsApi {
  value: string;
  setValue: (value: string) => void;
  orientation: "horizontal" | "vertical";
  listProps: Record<string, unknown>;
  tabProps: (value: string, options?: { disabled?: boolean }) => Record<string, unknown>;
  panelProps: (value: string) => Record<string, unknown>;
}

/**
 * Tabs for a game's own markup: spread `listProps` on the tablist, `tabProps(value)` on each tab (a button) and
 * `panelProps(value)` on each panel. One tab stop; arrows, Home and End move along the list.
 */
export function useTabs(options: TabsOptions = {}): TabsApi {
  const { orientation = "horizontal", activation = "automatic", loop = true } = options;
  const [value, setValue] = useControllable(options.value, options.defaultValue ?? "", options.onValueChange);
  const base = useId();
  const list = useRef<HTMLElement>(null);
  const onKeyDown = useRovingFocus(list, {
    items: '[role="tab"]',
    orientation,
    loop,
    onMove: (el) => {
      const next = el.dataset.value;
      if (activation === "automatic" && next !== undefined) setValue(next);
    },
  });
  const tabId = (v: string) => `${base}-tab-${idPart(v)}`;
  const panelId = (v: string) => `${base}-panel-${idPart(v)}`;
  return {
    value,
    setValue,
    orientation,
    listProps: { ref: list, role: "tablist", "aria-orientation": orientation, onKeyDown },
    tabProps: (v, { disabled = false } = {}) => {
      const selected = v === value;
      return {
        type: "button",
        role: "tab",
        id: tabId(v),
        "aria-selected": selected,
        "aria-controls": selected || options.controls !== "selected" ? panelId(v) : undefined,
        "aria-disabled": disabled || undefined,
        tabIndex: selected ? 0 : -1,
        "data-value": v,
        "data-state": selected ? "active" : "inactive",
        "data-disabled": disabled ? "" : undefined,
        "data-orientation": orientation,
        onClick: () => {
          if (!disabled) setValue(v);
        },
      };
    },
    panelProps: (v) => {
      const selected = v === value;
      return {
        role: "tabpanel",
        id: panelId(v),
        "aria-labelledby": tabId(v),
        hidden: !selected,
        // A panel with no control inside is still reached by Tab from its tab.
        tabIndex: 0,
        "data-state": selected ? "active" : "inactive",
        "data-orientation": orientation,
      };
    },
  };
}

const [TabsProvider, useTabsContext] = partContext<TabsApi>("Tabs.Root");

/** Props of `Tabs.Root`: the `useTabs` options and a div's. */
export interface TabsRootProps
  extends TabsOptions,
    Omit<ComponentPropsWithRef<"div">, "defaultValue">,
    AsChild {}

function TabsRoot({
  value,
  defaultValue,
  onValueChange,
  orientation,
  activation,
  loop,
  asChild,
  ...props
}: TabsRootProps) {
  const api = useTabs({ value, defaultValue, onValueChange, orientation, activation, loop });
  return (
    <TabsProvider value={api}>
      {renderPart("div", asChild, mergeProps({ "data-orientation": api.orientation }, props))}
    </TabsProvider>
  );
}

/** Props of `Tabs.List`: a div's; name it with `aria-label`. */
export type TabsListProps = ComponentPropsWithRef<"div"> & AsChild;

function TabsList({ asChild, ref, ...props }: TabsListProps) {
  const { ref: ours, ...list } = useTabsContext("Tabs.List").listProps;
  const refs = useComposedRefs(ours as never, ref);
  return renderPart("div", asChild, { ...mergeProps(list, props), ref: refs });
}

/** Props of `Tabs.Tab`: its value and a button's. */
export interface TabsTabProps extends ComponentPropsWithRef<"button">, AsChild {
  value: string;
}

function TabsTab({ value, disabled, asChild, ...props }: TabsTabProps) {
  const tabs = useTabsContext("Tabs.Tab");
  // Manual activation: Enter and Space select the focused tab (a button's click does it).
  return renderPart("button", asChild, mergeProps(tabs.tabProps(value, { disabled }), props));
}

/** Props of `Tabs.Panel`: its value, whether to keep it mounted when hidden, and a div's. */
export interface TabsPanelProps extends ComponentPropsWithRef<"div">, AsChild {
  value: string;
  /** Keep the children mounted while hidden (their state survives a switch). Default false. */
  keepMounted?: boolean;
}

function TabsPanel({ value, keepMounted = false, asChild, children, ...props }: TabsPanelProps) {
  const tabs = useTabsContext("Tabs.Panel");
  const shown = tabs.value === value;
  return renderPart("div", asChild, {
    ...mergeProps(tabs.panelProps(value), props),
    children: shown || keepMounted ? children : null,
  });
}

/**
 * Tabs (WAI-ARIA tabs): `Root` holds the value, `List` is the tablist, each `Tab` names a `Panel` of the same value.
 * Arrows, Home and End move; one tab stop. `data-state` ("active" | "inactive") and `data-orientation` style it.
 */
export const Tabs = { Root: TabsRoot, List: TabsList, Tab: TabsTab, Panel: TabsPanel };

// ---------------------------------------------------------------------------------------------------------------
// NavTabs

interface NavTabsState {
  current: string;
  onSelect: (value: string) => void;
}

const [NavTabsProvider, useNavTabsContext] = partContext<NavTabsState>("NavTabs.Root");

/** Props of `NavTabs.Root`: the open page, the press callback and a nav's (name it with `aria-label`). */
export interface NavTabsRootProps extends Omit<ComponentPropsWithRef<"nav">, "onSelect">, AsChild {
  /** The open page's value: its item is `aria-current="page"`. */
  current: string;
  /** Every press, the current page and a locked one included: the game decides what it means. */
  onSelect: (value: string) => void;
}

function NavTabsRoot({ current, onSelect, asChild, ...props }: NavTabsRootProps) {
  return <NavTabsProvider value={{ current, onSelect }}>{renderPart("nav", asChild, props)}</NavTabsProvider>;
}

/** The words a `NavTabs.Item` adds to its accessible name, after its label. */
export interface NavTabsWords {
  /** Said after the label of a locked item (", locked"). */
  locked?: string;
  /** Said after the label while `count` is over 0 (n => `, ${n} to claim`). */
  count?: (count: number) => string;
}

interface NavItemState {
  count: number;
}

const NavItemContext = createContext<NavItemState>({ count: 0 });

/** Props of `NavTabs.Item`: its value, lock and count, the words for them, and a button's. */
export interface NavTabsItemProps extends ComponentPropsWithRef<"button">, AsChild {
  value: string;
  /** Not open yet: `data-locked`, and its words in the name. It still presses (`onSelect` says when it opens). */
  locked?: boolean;
  /** Things waiting behind it; 0 or absent says nothing. A locked item's count is not said. */
  count?: number;
  words?: NavTabsWords;
}

function NavTabsItem({
  value,
  locked = false,
  count = 0,
  words,
  asChild,
  children,
  ...props
}: NavTabsItemProps) {
  const nav = useNavTabsContext("NavTabs.Item");
  const current = nav.current === value;
  const shown = locked ? 0 : Math.max(0, Math.floor(count));
  const said = locked ? words?.locked : shown > 0 ? words?.count?.(shown) : undefined;
  return (
    <NavItemContext.Provider value={{ count: shown }}>
      {renderPart(
        "button",
        asChild,
        mergeProps(
          {
            type: "button",
            "aria-current": current ? "page" : undefined,
            "data-value": value,
            "data-current": current ? "" : undefined,
            "data-locked": locked ? "" : undefined,
            "data-count": shown > 0 ? shown : undefined,
            onClick: () => nav.onSelect(value),
            children: (
              <>
                {children}
                {said ? <VisuallyHidden>{said}</VisuallyHidden> : null}
              </>
            ),
          },
          props,
        ),
      )}
    </NavItemContext.Provider>
  );
}

/** Props of `NavTabs.Badge`: how to print the count, and a span's. */
export interface NavTabsBadgeProps extends ComponentPropsWithRef<"span"> {
  /** The figure drawn; the item's words say it. Default the number itself. */
  format?: (count: number) => ReactNode;
}

/** The item's count as a figure, hidden from assistive tech (the item's words say it); nothing at 0. */
function NavTabsBadge({ format = String, ...props }: NavTabsBadgeProps) {
  const { count } = useContext(NavItemContext);
  if (count <= 0) return null;
  return (
    <span aria-hidden="true" data-count={count} {...props}>
      {format(count)}
    </span>
  );
}

/**
 * Page navigation: a `nav` of buttons, each its own tab stop, the open one `aria-current="page"` (`data-current`).
 * A locked item still presses; a count is drawn by `Badge` and said through the item's `words`.
 */
export const NavTabs = { Root: NavTabsRoot, Item: NavTabsItem, Badge: NavTabsBadge };

// ---------------------------------------------------------------------------------------------------------------
// BuyAmount

/** A buy mode: a fixed count, as many as affordable, or up to the next milestone. */
export type BuyMode = number | "max" | "next";

/**
 * How many a mode buys: a number buys that many; "max" what is affordable; "next" what is left to the next
 * milestone. Never negative, always whole. 0 means nothing (the caller shows the price of one). Pure.
 */
export function buyCount(mode: BuyMode, at: { affordable: number; untilNext: number }): number {
  const whole = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
  if (mode === "max") return whole(at.affordable);
  if (mode === "next") return whole(at.untilNext);
  return whole(mode);
}

/** One option of a `BuyAmount`: its mode and the words or figure drawn for it. */
export interface BuyAmountOption<T extends BuyMode = BuyMode> {
  value: T;
  label: ReactNode;
}

/** Props of `BuyAmount`: the options, the chosen one and a div's (name it with `aria-label`). */
export interface BuyAmountProps<T extends BuyMode = BuyMode>
  extends Omit<ComponentPropsWithRef<"div">, "defaultValue" | "onChange">,
    AsChild {
  options: readonly BuyAmountOption<T>[];
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  /** Each option's own props (a class, a title, a `data-*` attribute), by option. */
  optionProps?: (
    option: BuyAmountOption<T>,
  ) => ComponentPropsWithRef<"button"> & { [data: `data-${string}`]: string | number | boolean | undefined };
}

/**
 * The buy-mode switch (x1, x10, x100, max, next): a radio group, one tab stop, arrows move and select. Each option
 * is a `role="radio"` button with `data-state` ("checked" | "unchecked") and `data-value`.
 */
export function BuyAmount<T extends BuyMode>({
  options,
  value,
  defaultValue,
  onValueChange,
  optionProps,
  asChild,
  ref,
  onKeyDown,
  ...props
}: BuyAmountProps<T>) {
  const first = options[0]?.value as T;
  const [chosen, setChosen] = useControllable(value, defaultValue ?? first, onValueChange);
  const group = useRef<HTMLElement>(null);
  const refs = useComposedRefs(group, ref as never);
  const roving = useRovingFocus(group, {
    items: '[role="radio"]',
    orientation: "both",
    onMove: (_el, index) => {
      const option = options[index];
      if (option) setChosen(option.value);
    },
  });
  return renderPart(
    "div",
    asChild,
    mergeProps(
      {
        ref: refs,
        role: "radiogroup",
        onKeyDown: chain(onKeyDown, roving as (event: KeyboardEvent<HTMLDivElement>) => void),
        children: options.map((option) => {
          const checked = option.value === chosen;
          return (
            <button
              key={String(option.value)}
              {...mergeProps(
                {
                  type: "button",
                  role: "radio",
                  "aria-checked": checked,
                  tabIndex: checked ? 0 : -1,
                  "data-state": checked ? "checked" : "unchecked",
                  "data-value": String(option.value),
                  onClick: () => setChosen(option.value),
                },
                optionProps?.(option) ?? {},
              )}
            >
              {option.label}
            </button>
          );
        }),
      },
      props,
    ),
  );
}
