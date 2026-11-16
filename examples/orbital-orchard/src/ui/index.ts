// The game's own components: thin wrappers over the engine's headless `watchpot/ui` (and, for the reveal, its
// headless sequence), each with its CSS module beside it. Started from the template's registry, restyled to the
// station's terminal look; `theme.css` holds the token contract they read.
export { Badge, type BadgeProps, badgeText } from "./Badge";
export { Button, type ButtonProps, type ButtonVariant } from "./Button";
export { Chest, type ChestOdds, type ChestProps } from "./Chest";
export { Counter, type CounterProps } from "./Counter";
export { CurrencyPill, type CurrencyPillProps } from "./CurrencyPill";
export { Foil, type FoilProps } from "./Foil";
export { Panel, type PanelProps } from "./Panel";
export { ProgressBar, type ProgressBarProps } from "./ProgressBar";
export { RarityChip, type RarityChipProps } from "./RarityChip";
export { Reveal, type RevealFace, type RevealProps, type RevealRole, type RevealWords } from "./Reveal";
export { ConfirmButton, type ConfirmButtonProps, Sheet, type SheetProps } from "./Sheet";
export { Shell, type ShellProps, type ShellTab } from "./Shell";
export { TabBar, type TabBarItem, type TabBarProps } from "./TabBar";
export { Timer, type TimerProps } from "./Timer";
export { Tree, type TreeNodeView, type TreeProps, type TreeWords } from "./Tree";
