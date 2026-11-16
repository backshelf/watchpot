import { useId, useState } from "react";
import { cx, VisuallyHidden } from "watchpot/ui";
import { NAME, PREMISE } from "../content/words";
import { Button, ConfirmButton, Sheet } from "../ui";
import s from "./app.module.css";
import { useGameState, useGameStore } from "./hooks";

/**
 * The about sheet, which holds the settings: the premise; sound and motion; the save as text, out and in; and
 * starting over (two presses, so it is never an accident). A true modal: Escape closes it, Tab stays inside, and
 * focus goes back to what opened it.
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
      setSaid("The save is not ready yet. Give it a moment.");
      return;
    }
    setText(save);
    try {
      await navigator.clipboard.writeText(save);
      setSaid("Save copied. The whole orchard fits on one line.");
    } catch {
      setSaid("The clipboard would not take it. The save is in the box; copy it from there.");
    }
  };
  const readSave = () => {
    try {
      store.getState().importProfile(text.trim());
      setSaid("Save read. The orchard is as it was.");
    } catch {
      setSaid("That is not a save the station can read. Nothing has changed.");
    }
  };
  const startOver = () => {
    store.getState().resetProfile();
    onClose();
  };

  return (
    <Sheet
      // The heading shows the name; the dialog is called "About" it.
      title={
        <>
          <VisuallyHidden>About </VisuallyHidden>
          {NAME}
        </>
      }
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
          <span className="body">Sound</span>
        </label>
        <label className={s.toggle}>
          <input
            type="checkbox"
            checked={motion === "reduced"}
            onChange={(e) => change({ motion: e.currentTarget.checked ? "reduced" : "system" })}
          />
          <span className="body">Still the motion</span>
        </label>
      </div>
      <div className={s.group}>
        <label className="label" htmlFor={boxId}>
          The save, as text
        </label>
        <textarea
          id={boxId}
          className={s.saveBox}
          rows={3}
          spellCheck={false}
          placeholder="Paste a save here to read it back in."
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
        <div className={s.row}>
          <Button onClick={copySave}>Copy save</Button>
          <Button onClick={readSave} disabled={!text.trim()}>
            Read save
          </Button>
        </div>
        <p role="status" className={cx("small", s.status)}>
          {said}
        </p>
      </div>
    </Sheet>
  );
}
