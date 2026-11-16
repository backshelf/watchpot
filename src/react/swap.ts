import { useState } from "react";

/** Options for `useLayerSwap`: the layers, the current one, how to set it, whether it can swap and the cue. */
export interface LayerSwapOptions<L extends string> {
  /** Every layer the window can show (the ids its tabs or doors press with). */
  layers: readonly L[];
  /** The front layer as the store has it; it changes only when a switch ends. */
  layer: L;
  /** Commits the switch: called once, as it ends. */
  setLayer(to: L): void;
  /** False while nothing may switch (before the boot ends, during a ceremony). */
  canSwap: boolean;
  /** The press's sound, played as a switch starts. */
  cue?: () => void;
}

/** What `useLayerSwap` returns: `select`, `finish` and `swap`, committing the layer when the transition ends. */
export interface LayerSwap<L extends string> {
  /** The switch in flight: the layer it goes to and the one it leaves. */
  swap: { to: L; from: L } | null;
  /** A press on a layer's tab: starts a switch to it, unless one is in flight, it is front, or `canSwap` is false. */
  select(id: string): void;
  /** The switch's transition has ended: the layer is committed first, then the switch clears. */
  finish(): void;
}

/**
 * A switch between a game's layers (two pages in one window): pressing starts it, the transition plays, and only
 * at its end does the store's layer change, so whatever the store does on a switch happens once the new page is
 * painted. Read the front page from `swap?.to ?? layer`.
 */
export function useLayerSwap<L extends string>(options: LayerSwapOptions<L>): LayerSwap<L> {
  const { layers, layer, setLayer, canSwap, cue } = options;
  const [swap, setSwap] = useState<{ to: L; from: L } | null>(null);
  const isLayer = (id: string): id is L => (layers as readonly string[]).includes(id);
  return {
    swap,
    select: (id) => {
      if (!canSwap || swap !== null || !isLayer(id) || id === layer) return;
      cue?.();
      setSwap({ to: id, from: layer });
    },
    // The layer first: if the store's update commits on its own, the pages still read from `swap.to`.
    finish: () => {
      if (swap !== null) setLayer(swap.to);
      setSwap(null);
    },
  };
}
