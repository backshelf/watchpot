// The game's own components: thin wrappers over the engine's headless `watchpot/ui`, each styled with Tailwind
// utilities over the `--ui-*` tokens in theme.css. They are this game's to restyle, rewrite or delete (README.md says
// what the classes read).
// @if achievements
export { AchievementWall, type AchievementWallProps } from "./AchievementWall";
// @end
// @if visitor
export { Arrival, type ArrivalProps } from "./Arrival";
// @end
export { Backdrop, type BackdropProps } from "./Backdrop";
export { Badge, type BadgeProps, badgeText } from "./Badge";
// @if visitor
export { BuffChip, type BuffChipProps } from "./BuffChip";
// @end
export { Button, type ButtonProps, type ButtonVariant } from "./Button";
export { BuyAmount, type BuyAmountProps } from "./BuyAmount";
// @if clicker
export { ClickTarget, type ClickTargetProps } from "./ClickTarget";
// @end
export { Counter, type CounterProps } from "./Counter";
export { CurrencyPill, type CurrencyPillProps } from "./CurrencyPill";
export { Panel, type PanelProps } from "./Panel";
export { ProgressBar, type ProgressBarProps } from "./ProgressBar";
// @if gacha
export { RarityChip, type RarityChipProps } from "./RarityChip";
// @end
export { ConfirmButton, type ConfirmButtonProps, Sheet, type SheetProps } from "./Sheet";
export { Shell, type ShellProps, type ShellTab } from "./Shell";
export { TabBar, type TabBarItem, type TabBarProps } from "./TabBar";
export { Timer, type TimerProps } from "./Timer";
export { Title, type TitleProps } from "./Title";
export { Toasts, type ToastsProps } from "./Toasts";
export { Tooltip, type TooltipProps } from "./Tooltip";
// @if tree
export { Tree, type TreeNodeView, type TreeProps, type TreeWords } from "./Tree";
// @end
