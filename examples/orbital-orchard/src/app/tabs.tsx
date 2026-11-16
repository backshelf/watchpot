import type { NavTabsWords } from "watchpot/ui";
import { TAB_NAMES } from "../content/words";
import { MakeScreen } from "../screens/Make";
import { PrestigeScreen } from "../screens/Prestige";
import { PullScreen } from "../screens/Pull";
import { ShowerScreen } from "../screens/Shower";
import { UpgradesScreen } from "../screens/Upgrades";
import type { ShellTab } from "../ui";
import { TAB_ICONS } from "./icons";

export type Tab = "make" | "tree" | "gacha" | "event" | "prestige";

/** The tab bar, in order: one tab per screen the game has. */
export const TABS: readonly ShellTab<Tab>[] = [
  { id: "make", label: TAB_NAMES.make, icon: TAB_ICONS.make, Screen: MakeScreen },
  { id: "tree", label: TAB_NAMES.tree, icon: TAB_ICONS.tree, Screen: UpgradesScreen },
  { id: "gacha", label: TAB_NAMES.gacha, icon: TAB_ICONS.gacha, Screen: PullScreen },
  { id: "event", label: TAB_NAMES.event, icon: TAB_ICONS.event, Screen: ShowerScreen },
  { id: "prestige", label: TAB_NAMES.prestige, icon: TAB_ICONS.prestige, Screen: PrestigeScreen },
];

/** What a tab's count and lock add to its name: only the shower's tab counts, the things waiting on it. */
export const TAB_WORDS: NavTabsWords = {
  count: (n) => `, ${n} ${n === 1 ? "thing waiting" : "things waiting"}`,
  locked: ", locked",
};
