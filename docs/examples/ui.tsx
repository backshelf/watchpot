import { type RefObject, useRef, useState } from "react";
import {
  AchievementGrid,
  type AchievementRow,
  BuyAmount,
  type BuyMode,
  buyCount,
  ConfirmPress,
  Countdown,
  createToasts,
  Dialog,
  FloatingNumbers,
  HoldButton,
  NavTabs,
  PageShell,
  type PageViews,
  Portal,
  Pressable,
  Progress,
  type ScreenTable,
  type SheetRegistry,
  Toaster,
  Tooltip,
  TreeGraph,
  type TreeGraphNode,
  useFloatingNumbers,
} from "watchpot/ui";

/** The game's toasts: one store for the whole game, pushed from anywhere. */
export const toasts = createToasts({ max: 3, duration: 4000 });

/** A clicker's target: each press adds gold and floats "+1" where it landed. */
export function GoldMine({ onGold }: { onGold: (n: number) => void }) {
  const floats = useFloatingNumbers({ max: 24 });
  return (
    <div className="mine">
      <Pressable
        className="mine-button"
        onPress={(p) => {
          onGold(1);
          floats.spawn({ x: p.x, y: p.y, node: "+1" });
        }}
      >
        Mine gold
      </Pressable>
      <FloatingNumbers floats={floats} className="floats" />
    </div>
  );
}

/** A buy row: the mode switch, the count it means, and a hold-to-repeat buy. */
export function BuyRow({ affordable, onBuy }: { affordable: number; onBuy: (n: number) => boolean }) {
  const [mode, setMode] = useState<BuyMode>(1);
  const count = buyCount(mode, { affordable, untilNext: 7 });
  return (
    <div className="buy-row">
      <BuyAmount
        aria-label="Buy amount"
        value={mode}
        onValueChange={setMode}
        options={[
          { value: 1, label: "x1" },
          { value: 10, label: "x10" },
          { value: "next", label: "Next" },
          { value: "max", label: "Max" },
        ]}
      />
      <HoldButton className="buy" action={() => onBuy(Math.max(1, count))} disabled={count === 0}>
        Buy {Math.max(1, count)}
      </HoldButton>
    </div>
  );
}

/** A spend the player confirms twice, inside a modal over the page. */
export function GemOffer({ page, onBuy }: { page: RefObject<HTMLElement | null>; onBuy: () => void }) {
  return (
    <Dialog.Root inertTarget={page}>
      <Dialog.Trigger className="open-offer">Gem offer</Dialog.Trigger>
      <Portal>
        <Dialog.Scrim className="scrim" />
        <Dialog.Panel className="sheet">
          <Dialog.Title>100 gems</Dialog.Title>
          <Dialog.Description>Spend gold on gems.</Dialog.Description>
          <ConfirmPress className="pay" onConfirm={onBuy}>
            {(armed) => (armed ? "Press again to buy" : "Buy")}
          </ConfirmPress>
          <Dialog.Close>Not now</Dialog.Close>
        </Dialog.Panel>
      </Portal>
    </Dialog.Root>
  );
}

/** Progress to the next tier in 24 steps, and the event's countdown with its warning. */
export function TierBar({ xp, next, secondsLeft }: { xp: number; next: number; secondsLeft: number }) {
  return (
    <>
      <Progress
        className="bar"
        aria-label="Tier"
        value={xp}
        max={next}
        steps={24}
        valueText={`${xp} of ${next}`}
      />
      <p>
        Ends in{" "}
        <Countdown secondsLeft={secondsLeft} warnUnder={600} onEnd={() => toasts.push({ title: "Ended" })} />
      </p>
    </>
  );
}

/** A gold total that explains itself. */
export function GoldTotal({ gold }: { gold: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger className="pill">{gold}</Tooltip.Trigger>
      <Tooltip.Content className="tip">Gold buys upgrades.</Tooltip.Content>
    </Tooltip.Root>
  );
}

const ACHIEVEMENTS: AchievementRow[] = [
  {
    complete: true,
    tiles: [
      { id: "first", name: "First gold", line: "Mine one gold.", reward: "+1% gold", earned: true },
      { id: "hundred", name: "A hundred", line: "Hold 100 gold.", earned: true },
    ],
  },
  {
    tiles: [
      { id: "gem", name: "Shiny", line: "Find a gem.", earned: false },
      { id: "secret", name: "Quiet hours", line: "Leave it running overnight.", earned: false, hidden: true },
    ],
  },
];

/** The achievement wall: icons are the game's, words too. */
export function Achievements() {
  return (
    <AchievementGrid
      className="wall"
      aria-label="Achievements"
      rows={ACHIEVEMENTS}
      words={{ hiddenName: "???", hiddenLine: "Keep playing.", earned: ", earned", locked: ", not yet" }}
      renderIcon={(tile, { hidden }) => <span className="icon">{hidden ? "?" : tile.name.slice(0, 1)}</span>}
      detailProps={{ className: "tip" }}
    />
  );
}

interface Upgrade extends TreeGraphNode {
  name: string;
  rank: number;
  max: number;
}

const UPGRADES: Upgrade[] = [
  { id: "speed", name: "Speed", col: 0, row: 0, rank: 1, max: 5, lit: true, state: "open" },
  { id: "luck", name: "Luck", col: 1, row: 0, rank: 0, max: 3, requires: ["speed"], state: "locked" },
];

/** The upgrade tree: the engine places and links; the game names and prices. */
export function Upgrades() {
  return (
    <TreeGraph
      className="tree"
      aria-label="Upgrades"
      nodes={UPGRADES}
      renderNode={(n) => (
        <>
          {n.name} <span>{`${n.rank} / ${n.max}`}</span>
        </>
      )}
      nodeLabel={(n) => `${n.name}, rank ${n.rank} of ${n.max}`}
      renderDetail={(n) => <p>{n.name} makes everything a little better.</p>}
      firstChoice={(n) => n.state === "open"}
    />
  );
}

type Tab = "mine" | "tree" | "wall";
type Page = "settings";
type Sheet = { kind: "offer" };

const SCREENS: ScreenTable<Tab> = {
  mine: () => <GoldMine onGold={() => {}} />,
  tree: Upgrades,
  wall: Achievements,
};
const PAGES: PageViews<Page> = { settings: () => <p>Settings</p> };

/** The whole page: the shell holds the structure, NavTabs the navigation, the toaster the notices. */
export function Game() {
  const [tab, setTab] = useState<Tab>("mine");
  const [page, setPage] = useState<Page | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const sheets: SheetRegistry<Sheet> = {
    offer: (_, close) => <GemOffer page={root} onBuy={close} />,
  };
  return (
    <PageShell<Tab, Page, Sheet>
      ref={root}
      className="page"
      tab={tab}
      screens={SCREENS}
      page={page}
      pages={PAGES}
      onClosePage={() => setPage(null)}
      pageBar={(_, back) => (
        <button type="button" onClick={back}>
          Back
        </button>
      )}
      sheet={sheet}
      sheets={sheets}
      onCloseSheet={() => setSheet(null)}
      covered={sheet !== null}
      header={({ scrolled }) => (
        <header data-scrolled={scrolled || undefined}>
          <GoldTotal gold="1.2K" />
          <button type="button" onClick={() => setPage("settings")}>
            Settings
          </button>
        </header>
      )}
      nav={({ reselect }) => (
        <NavTabs.Root
          aria-label="Game"
          current={tab}
          onSelect={(v) => (v === tab ? reselect() : setTab(v as Tab))}
        >
          <NavTabs.Item value="mine">Mine</NavTabs.Item>
          <NavTabs.Item value="tree">Upgrades</NavTabs.Item>
          <NavTabs.Item value="wall" count={2} words={{ count: (n) => `, ${n} new` }}>
            Achievements
            <NavTabs.Badge className="badge" />
          </NavTabs.Item>
        </NavTabs.Root>
      )}
      overlays={
        <Toaster
          store={toasts}
          className="toasts"
          aria-label="Notices"
          renderToast={(t, dismiss) => (
            <button type="button" onClick={dismiss}>
              {t.title}
            </button>
          )}
        />
      }
    />
  );
}
