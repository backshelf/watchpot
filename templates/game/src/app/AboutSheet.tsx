import { useId, useState } from "react";
import { NAME, PREMISE } from "../content/words";
import { Button } from "../ui/Button";
import { ConfirmButton, Sheet } from "../ui/Sheet";
import s from "./app.module.css";
import { useGameState, useGameStore } from "./hooks";

/**
 * The about sheet, which holds the settings: the premise; sound and motion; the save as text, out and in; and
 * starting over (two presses, so it is never an accident). The sheet is a true modal: Escape closes it, Tab stays
 * inside, and focus goes back to what opened it.
 */
export function AboutSheet({ onClose }: { onClose(): void }) {
  const store = useGameStore();
  const sound = useGameState((st) => st.settings.sound);
  const motion = useGameState((st) => st.settings.motion);
  const [text, setText] = useState("");
  const [said, setSaid] = useState("");
  const boxId = useId();

  const { change } = store.getState().settings;
  const copySave = async () => {
    let save: string;
    try {
      save = store.getState().exportProfile();
    } catch {
      setSaid("The save is not ready yet. Try again in a moment.");
      return;
    }
    setText(save);
    try {
      await navigator.clipboard.writeText(save);
      setSaid("Save copied.");
    } catch {
      setSaid("The clipboard said no. The save is in the box: copy it from there.");
    }
  };
  const readSave = () => {
    try {
      store.getState().importProfile(text.trim());
      setSaid("Save loaded.");
    } catch {
      setSaid("That save could not be read. Nothing changed.");
    }
  };
  const startOver = () => {
    store.getState().resetProfile();
    onClose();
  };

  return (
    <Sheet
      title={`About ${NAME}`}
      description={PREMISE}
      onClose={onClose}
      actions={
        <>
          <ConfirmButton onConfirm={startOver}>
            {(armed) => (armed ? "Press again to start over" : "Start over")}
          </ConfirmButton>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className={s.group}>
        <label className={s.toggle}>
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => change({ sound: e.currentTarget.checked })}
          />
          <span>Sound</span>
        </label>
        <label className={s.toggle}>
          <input
            type="checkbox"
            checked={motion === "reduced"}
            onChange={(e) => change({ motion: e.currentTarget.checked ? "reduced" : "system" })}
          />
          <span>Still the motion</span>
        </label>
      </div>
      <div className={s.group}>
        <label className={s.label} htmlFor={boxId}>
          Save as text
        </label>
        <textarea
          id={boxId}
          className={s.saveBox}
          rows={3}
          spellCheck={false}
          placeholder="Paste a save here, then read it."
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
        <div className={s.row}>
          <Button onClick={copySave}>Copy save</Button>
          <Button onClick={readSave} disabled={!text.trim()}>
            Read save
          </Button>
        </div>
        <p role="status" className={s.status}>
          {said}
        </p>
      </div>
    </Sheet>
  );
}
