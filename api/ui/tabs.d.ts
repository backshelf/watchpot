import { type ComponentPropsWithRef, type ReactNode } from "react";
import { type Orientation } from "./hooks";
import { type AsChild } from "./slot";
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
    tabProps: (value: string, options?: {
        disabled?: boolean;
    }) => Record<string, unknown>;
    panelProps: (value: string) => Record<string, unknown>;
}
/**
 * Tabs for a game's own markup: spread `listProps` on the tablist, `tabProps(value)` on each tab (a button) and
 * `panelProps(value)` on each panel. One tab stop; arrows, Home and End move along the list.
 */
export declare function useTabs(options?: TabsOptions): TabsApi;
/** Props of `Tabs.Root`: the `useTabs` options and a div's. */
export interface TabsRootProps extends TabsOptions, Omit<ComponentPropsWithRef<"div">, "defaultValue">, AsChild {
}
declare function TabsRoot({ value, defaultValue, onValueChange, orientation, activation, loop, asChild, ...props }: TabsRootProps): import("react").JSX.Element;
/** Props of `Tabs.List`: a div's; name it with `aria-label`. */
export type TabsListProps = ComponentPropsWithRef<"div"> & AsChild;
declare function TabsList({ asChild, ref, ...props }: TabsListProps): import("react").JSX.Element;
/** Props of `Tabs.Tab`: its value and a button's. */
export interface TabsTabProps extends ComponentPropsWithRef<"button">, AsChild {
    value: string;
}
declare function TabsTab({ value, disabled, asChild, ...props }: TabsTabProps): import("react").JSX.Element;
/** Props of `Tabs.Panel`: its value, whether to keep it mounted when hidden, and a div's. */
export interface TabsPanelProps extends ComponentPropsWithRef<"div">, AsChild {
    value: string;
    /** Keep the children mounted while hidden (their state survives a switch). Default false. */
    keepMounted?: boolean;
}
declare function TabsPanel({ value, keepMounted, asChild, children, ...props }: TabsPanelProps): import("react").JSX.Element;
/**
 * Tabs (WAI-ARIA tabs): `Root` holds the value, `List` is the tablist, each `Tab` names a `Panel` of the same value.
 * Arrows, Home and End move; one tab stop. `data-state` ("active" | "inactive") and `data-orientation` style it.
 */
export declare const Tabs: {
    Root: typeof TabsRoot;
    List: typeof TabsList;
    Tab: typeof TabsTab;
    Panel: typeof TabsPanel;
};
/** Props of `NavTabs.Root`: the open page, the press callback and a nav's (name it with `aria-label`). */
export interface NavTabsRootProps extends Omit<ComponentPropsWithRef<"nav">, "onSelect">, AsChild {
    /** The open page's value: its item is `aria-current="page"`. */
    current: string;
    /** Every press, the current page and a locked one included: the game decides what it means. */
    onSelect: (value: string) => void;
}
declare function NavTabsRoot({ current, onSelect, asChild, ...props }: NavTabsRootProps): import("react").JSX.Element;
/** The words a `NavTabs.Item` adds to its accessible name, after its label. */
export interface NavTabsWords {
    /** Said after the label of a locked item (", locked"). */
    locked?: string;
    /** Said after the label while `count` is over 0 (n => `, ${n} to claim`). */
    count?: (count: number) => string;
}
/** Props of `NavTabs.Item`: its value, lock and count, the words for them, and a button's. */
export interface NavTabsItemProps extends ComponentPropsWithRef<"button">, AsChild {
    value: string;
    /** Not open yet: `data-locked`, and its words in the name. It still presses (`onSelect` says when it opens). */
    locked?: boolean;
    /** Things waiting behind it; 0 or absent says nothing. A locked item's count is not said. */
    count?: number;
    words?: NavTabsWords;
}
declare function NavTabsItem({ value, locked, count, words, asChild, children, ...props }: NavTabsItemProps): import("react").JSX.Element;
/** Props of `NavTabs.Badge`: how to print the count, and a span's. */
export interface NavTabsBadgeProps extends ComponentPropsWithRef<"span"> {
    /** The figure drawn; the item's words say it. Default the number itself. */
    format?: (count: number) => ReactNode;
}
/** The item's count as a figure, hidden from assistive tech (the item's words say it); nothing at 0. */
declare function NavTabsBadge({ format, ...props }: NavTabsBadgeProps): import("react").JSX.Element | null;
/**
 * Page navigation: a `nav` of buttons, each its own tab stop, the open one `aria-current="page"` (`data-current`).
 * A locked item still presses; a count is drawn by `Badge` and said through the item's `words`.
 */
export declare const NavTabs: {
    Root: typeof NavTabsRoot;
    Item: typeof NavTabsItem;
    Badge: typeof NavTabsBadge;
};
/** A buy mode: a fixed count, as many as affordable, or up to the next milestone. */
export type BuyMode = number | "max" | "next";
/**
 * How many a mode buys: a number buys that many; "max" what is affordable; "next" what is left to the next
 * milestone. Never negative, always whole. 0 means nothing (the caller shows the price of one). Pure.
 */
export declare function buyCount(mode: BuyMode, at: {
    affordable: number;
    untilNext: number;
}): number;
/** One option of a `BuyAmount`: its mode and the words or figure drawn for it. */
export interface BuyAmountOption<T extends BuyMode = BuyMode> {
    value: T;
    label: ReactNode;
}
/** Props of `BuyAmount`: the options, the chosen one and a div's (name it with `aria-label`). */
export interface BuyAmountProps<T extends BuyMode = BuyMode> extends Omit<ComponentPropsWithRef<"div">, "defaultValue" | "onChange">, AsChild {
    options: readonly BuyAmountOption<T>[];
    value?: T;
    defaultValue?: T;
    onValueChange?: (value: T) => void;
    /** Each option's own props (a class, a title, a `data-*` attribute), by option. */
    optionProps?: (option: BuyAmountOption<T>) => ComponentPropsWithRef<"button"> & {
        [data: `data-${string}`]: string | number | boolean | undefined;
    };
}
/**
 * The buy-mode switch (x1, x10, x100, max, next): a radio group, one tab stop, arrows move and select. Each option
 * is a `role="radio"` button with `data-state` ("checked" | "unchecked") and `data-value`.
 */
export declare function BuyAmount<T extends BuyMode>({ options, value, defaultValue, onValueChange, optionProps, asChild, ref, onKeyDown, ...props }: BuyAmountProps<T>): import("react").JSX.Element;
export {};
