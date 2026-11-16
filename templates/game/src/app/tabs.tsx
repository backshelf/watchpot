import { TAB_NAMES } from "../content/words";
import { MakeScreen } from "../screens/Make";
import type { ShellTab } from "../ui/Shell";
import { TAB_ICONS } from "./icons";
// @if tree
import { UpgradesScreen } from "../screens/Upgrades";
// @end
// @if gacha
import { PullScreen } from "../screens/Pull";
// @end
// @if prestige
import { PrestigeScreen } from "../screens/Prestige";
// @end
// @if achievements
import { AchievementsScreen } from "../screens/Achievements";
// @end

/** The screens the game has, by id. */
export type Tab =
  | "make"
  // @if tree
  | "tree"
  // @end
  // @if gacha
  | "gacha"
  // @end
  // @if prestige
  | "prestige"
  // @end
  // @if achievements
  | "achievements"
  // @end
  ;

/** The tab bar, in order: one tab per screen the game has. */
export const TABS: readonly ShellTab<Tab>[] = [
  { id: "make", label: TAB_NAMES.make, icon: TAB_ICONS.make, Screen: MakeScreen },
  // @if tree
  { id: "tree", label: TAB_NAMES.tree, icon: TAB_ICONS.tree, Screen: UpgradesScreen },
  // @end
  // @if gacha
  { id: "gacha", label: TAB_NAMES.gacha, icon: TAB_ICONS.gacha, Screen: PullScreen },
  // @end
  // @if prestige
  { id: "prestige", label: TAB_NAMES.prestige, icon: TAB_ICONS.prestige, Screen: PrestigeScreen },
  // @end
  // @if achievements
  { id: "achievements", label: TAB_NAMES.achievements, icon: TAB_ICONS.achievements, Screen: AchievementsScreen },
  // @end
];
