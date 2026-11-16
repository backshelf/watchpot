import { useState } from "react";
import { burst, useRevealSequence } from "watchpot/kit";
import { Dialog, Portal } from "watchpot/ui";
import { type Rarity, TOY } from "./vocab";

/** What an open dealt: each payload names its rung on the game's ladder. */
export interface Prize {
  rarity: Rarity;
  name: string;
}

/**
 * A gacha reveal for any ladder. The sequence (box, lid, deal, one face per tap, the big rung charging first, Skip,
 * the best rung) is the engine's; every element, word and effect is the game's. `payloads` must be a stable array
 * for the open, and `result` changes when the game opens again.
 */
export function PrizeReveal({ prizes, onClose }: { prizes: readonly Prize[]; onClose: () => void }) {
  const [said, setSaid] = useState("");
  const reveal = useRevealSequence({
    result: prizes,
    ladder: TOY.rarities.ids,
    payloads: prizes,
    onLand: (prize, _i, landing) => {
      setSaid(`${prize.rarity} ${prize.name}.`);
      if (landing.big) burst(landing.tier);
    },
    onSummary: () => setSaid(`${prizes.length} prizes.`),
  });
  const { state } = reveal;
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Portal>
        <Dialog.Panel className="reveal" data-phase={state.phase} data-tone={reveal.tone ?? undefined}>
          <Dialog.Title>Banner</Dialog.Title>
          <p aria-live="polite">{said}</p>
          {/* The stage: a tap or Enter moves on, never before the face in the centre has shown. */}
          <div className="stage" tabIndex={-1} onClick={reveal.tap} onKeyDown={reveal.onKeyDown}>
            {state.phase === "chest" || state.phase === "opening" ? (
              <div className="box" data-state={state.phase} />
            ) : (
              reveal.stage && <div className="face">{reveal.stage.payload.name}</div>
            )}
          </div>
          {state.phase === "summary" ? (
            <div className="lot" data-best={reveal.best}>
              <ul>
                {prizes.map((p, i) => (
                  <li key={i}>{p.name}</li>
                ))}
              </ul>
              <Dialog.Close>Done</Dialog.Close>
            </div>
          ) : (
            <button type="button" onClick={reveal.skip}>
              Skip
            </button>
          )}
        </Dialog.Panel>
      </Portal>
    </Dialog.Root>
  );
}
