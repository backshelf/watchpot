import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { SoundDeskView } from "../../src/devtools/desk/SoundDeskView";
import { guessLoop } from "../../src/devtools/desk/samples";
import { openSoundDesk } from "../../src/devtools/SoundDesk";
import type { MixFile, SampleEntry, SampleHost } from "../../src/sound/desk";
import { type FakeDesk, fakeDesk, fakeSampleHost } from "./fixtures/desk";

const KEY = "test.sound-desk";

beforeEach(() => localStorage.clear());

function draw(
  desk: FakeDesk = fakeDesk(),
  options: { onSave?: (file: MixFile) => Promise<void>; samples?: SampleHost } = {},
) {
  render(
    <StrictMode>
      <SoundDeskView
        desk={desk}
        onSave={options.onSave ?? (async () => {})}
        samples={options.samples}
        storageKey={KEY}
      />
    </StrictMode>,
  );
  return desk;
}

// Role queries walk the accessibility tree of a large desk and cost a tenth of a second each: these find a control
// by its accessible name directly and check its role.
const IMPLICIT: Record<string, string> = { button: "BUTTON", combobox: "SELECT", textbox: "INPUT" };
function find(role: string, name: string): HTMLElement | null {
  for (const el of document.body.querySelectorAll<HTMLElement>(`[aria-label="${name}"]`)) {
    if (el.getAttribute("role") === role || el.tagName === IMPLICIT[role]) return el;
  }
  for (const el of role === "button" ? document.body.querySelectorAll<HTMLElement>("button") : []) {
    if (!el.hasAttribute("aria-label") && el.textContent?.trim() === name) return el;
  }
  for (const el of role === "radio" ? document.body.querySelectorAll<HTMLElement>("label") : []) {
    if (el.textContent?.trim() === name) return el.querySelector("input");
  }
  return null;
}
function get(role: string, name: string): HTMLElement {
  const el = find(role, name);
  if (!el) throw new Error(`no ${role} named "${name}"`);
  return el;
}
const slider = (name: string) => get("slider", name);
const lastCall = (desk: FakeDesk) => desk.calls[desk.calls.length - 1];
const methods = (desk: FakeDesk) => desk.calls.map((c) => c[0]);
/** Picks the layer every write lands in. */
const editLayer = (layer: string) =>
  fireEvent.change(get("combobox", "Layer to edit"), { target: { value: layer } });
const ENTRY: SampleEntry = { seconds: 0.2, channels: 1, lufs: -18, peak: 0.7, kind: "shot" };

describe("the tracks", () => {
  test("a column per bus in summing order, the returns after them, the master last", () => {
    draw();
    const tracks = document.body.querySelector('[aria-label="Tracks"]') as HTMLElement;
    const names = [...tracks.querySelectorAll("[role=slider]")]
      .map((el) => el.getAttribute("aria-label") ?? "")
      .filter((n) => n.endsWith(" level"))
      .map((n) => n.slice(0, -" level".length));
    // room and echo are sent into; glue is the bus the desk made.
    expect(names).toEqual([
      "music",
      "pads",
      "drums",
      "ambience",
      "sfx",
      "ui",
      "ticks",
      "voice",
      "foley",
      "glue",
      "room",
      "echo",
      "master",
    ]);
  });

  test("a strip shows only the sends something says, and a new one is written at off in the edit layer", () => {
    const desk = draw();
    expect(find("slider", "sfx send to room")).not.toBeNull();
    expect(find("slider", "sfx send to echo")).toBeNull();
    fireEvent.change(get("combobox", "Add a send from sfx"), { target: { value: "echo" } });
    expect(lastCall(desk)).toEqual(["set", "mix", "send:sfx>echo", 0]);
    expect(find("slider", "sfx send to echo")).not.toBeNull();
  });

  test("a control a mod route drives is shown read-only and writes nothing", () => {
    const desk = draw();
    const foley = slider("foley level");
    expect(foley).toHaveAttribute("aria-readonly", "true");
    fireEvent.keyDown(foley, { key: "ArrowUp" });
    expect(desk.calls.some((c) => c[2] === "level:foley")).toBe(false);
  });

  test("mute and solo call the desk, and a made bus can be removed", () => {
    const desk = draw();
    fireEvent.click(get("button", "Mute sfx"));
    expect(lastCall(desk)).toEqual(["mute", "bus:sfx", true]);
    expect(get("button", "Mute sfx")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(get("button", "Solo sfx"));
    expect(lastCall(desk)).toEqual(["solo", "bus:sfx", true]);
    expect(find("button", "Remove music")).toBeNull();
    fireEvent.click(get("button", "Remove glue"));
    expect(lastCall(desk)).toEqual(["removeBus", "glue"]);
  });
});

describe("the layer being edited", () => {
  test("decides where a write lands, for a level, a trim and a tunable alike", () => {
    const desk = draw();
    // All scenes: the mix says music is at -6.
    fireEvent.keyDown(slider("music level"), { key: "ArrowUp" });
    expect(lastCall(desk)).toEqual(["set", "mix", "level:music", -5.5]);

    editLayer("scene:tier2");
    // Tier 2 says -5 of its own: the fader shows that and moves from there.
    fireEvent.keyDown(slider("music level"), { key: "ArrowUp" });
    expect(lastCall(desk)).toEqual(["set", "scene:tier2", "level:music", -4.5]);
    // It says nothing of drums' trim: the fader shows the mix's -1.5, and the move is the scene's alone.
    fireEvent.keyDown(get("textbox", "drums trim"), { key: "ArrowUp" });
    expect(lastCall(desk)).toEqual(["set", "scene:tier2", "trim:drums", -1]);
    expect(desk.get("mix", "trim:drums")).toBe(-1.5);

    fireEvent.click(get("button", "Tunables"));
    fireEvent.keyDown(slider("Swing"), { key: "End" });
    expect(lastCall(desk)).toEqual(["set", "scene:tier2", "tune:ticks.swing", 0.5]);
  });

  test("a reset takes away the edit layer's write and nothing else", () => {
    const desk = draw();
    // The file the desk started with holds a write of sfx's level in the mix, and none in Tier 2.
    fireEvent.click(get("button", "Reset sfx level in All scenes"));
    expect(lastCall(desk)).toEqual(["set", "mix", "level:sfx", undefined]);
    expect(get("button", "Reset sfx level in All scenes")).toBeDisabled();

    editLayer("scene:tier2");
    expect(get("button", "Reset sfx level in Tier 2")).toBeDisabled();
    fireEvent.keyDown(slider("sfx level"), { key: "ArrowDown" });
    expect(get("button", "Reset sfx level in Tier 2")).not.toBeDisabled();
    // A double click and Delete are the same reset.
    fireEvent.doubleClick(slider("sfx level"));
    expect(lastCall(desk)).toEqual(["set", "scene:tier2", "level:sfx", undefined]);
    fireEvent.keyDown(slider("sfx level"), { key: "Delete" });
    expect(lastCall(desk)).toEqual(["set", "scene:tier2", "level:sfx", undefined]);
    expect(desk.file().layers?.["scene:tier2"]?.["level:sfx"]).toBeUndefined();
  });

  test("a scene never in force is named nowhere, and is once it has been", () => {
    const desk = draw();
    // The starting file holds a write to Storm's layer, and the mix declares Tier 1 and Tier 3: none may leak.
    const hidden = () => {
      const html = document.body.innerHTML;
      return ["storm", "Storm", "tier1", "Tier 1", "tier3", "Tier 3"].filter((word) => html.includes(word));
    };
    expect(hidden()).toEqual([]);
    const layers = () => [...get("combobox", "Layer to edit").querySelectorAll("option")].map((o) => o.value);
    expect(layers()).toEqual(["mix", "scene:tier2", "scene:dialog"]);
    const copies = () =>
      [...get("combobox", "Copy All scenes to another layer").querySelectorAll("option")]
        .map((o) => o.value)
        .filter(Boolean);
    expect(copies()).toEqual(["scene:tier2", "scene:dialog"]);

    act(() => desk.setScenes("storm", []));
    expect(layers()).toContain("scene:storm");
    expect(localStorage.getItem(KEY)).toContain("storm");
    // Heard once, it stays nameable after it leaves; the others are still unnamed.
    act(() => desk.setScenes("tier2", []));
    expect(layers()).toContain("scene:storm");
    expect(hidden().filter((word) => !/storm/i.test(word))).toEqual([]);
  });

  test("copying writes the edit layer into the one chosen", () => {
    const desk = draw();
    editLayer("scene:tier2");
    fireEvent.change(get("combobox", "Copy Tier 2 to another layer"), { target: { value: "scene:dialog" } });
    expect(lastCall(desk)).toEqual(["copyLayer", "scene:tier2", "scene:dialog"]);
  });
});

describe("the sources", () => {
  test("a cue's row writes to the cue and a role's row to the role", () => {
    const desk = draw();
    // The cue's own row: the starting file trims it by -3.
    fireEvent.keyDown(get("textbox", "chime trim"), { key: "ArrowUp" });
    expect(lastCall(desk)).toEqual(["set", "mix", "ch:cue:chime", -2.5]);
    // Its roles are folded away until asked for; a cue with one role has no rows under it.
    expect(find("textbox", "chime as ui trim")).toBeNull();
    expect(find("button", "click: 1 roles")).toBeNull();
    fireEvent.click(get("button", "chime: 3 roles"));
    fireEvent.keyDown(get("textbox", "chime as ui trim"), { key: "ArrowUp" });
    expect(lastCall(desk)).toEqual(["set", "mix", "ch:cue:chime@ui", 0.5]);
    fireEvent.click(get("button", "Audition chime as ui"));
    expect(lastCall(desk)).toEqual(["audition", "cue:chime@ui"]);
    fireEvent.change(get("combobox", "chime as voice audio to"), { target: { value: "room" } });
    expect(lastCall(desk)).toEqual(["route", "cue:chime@voice", "room"]);
    fireEvent.change(get("combobox", "chime audio to"), { target: { value: "" } });
    expect(lastCall(desk)).toEqual(["route", "cue:chime", undefined]);
  });

  test("a source appears once it sounds", () => {
    const desk = draw();
    expect(find("textbox", "alarm trim")).toBeNull();
    act(() => desk.sound("cue:alarm"));
    expect(find("textbox", "alarm trim")).not.toBeNull();
  });
});

describe("the devices", () => {
  test("an effect's switch is a setting of the edit layer, and the chain is changed through the desk", () => {
    const desk = draw();
    editLayer("scene:dialog");
    fireEvent.click(get("button", "EQ on"));
    expect(lastCall(desk)).toEqual(["set", "scene:dialog", "fx:music:0:on", 0]);
    fireEvent.click(get("button", "Move Compressor earlier"));
    expect(lastCall(desk)).toEqual(["fxMove", "music", "1", 0]);
    fireEvent.change(get("combobox", "Compressor listens to"), { target: { value: "" } });
    expect(lastCall(desk)).toEqual(["fxKey", "music", "1", null]);
    fireEvent.change(get("combobox", "Add a device to music"), { target: { value: "reverb" } });
    expect(lastCall(desk)).toEqual(["fxAdd", "music", "reverb", undefined]);
    fireEvent.click(get("button", "Remove Reverb"));
    expect(lastCall(desk)).toEqual(["fxRemove", "music", "reverb-1"]);
  });
});

describe("undo and redo", () => {
  test("the buttons and the keys call through", () => {
    const desk = draw();
    expect(get("button", "Undo")).toBeDisabled();
    fireEvent.keyDown(slider("pads level"), { key: "ArrowUp" });
    fireEvent.click(get("button", "Undo"));
    expect(lastCall(desk)).toEqual(["undo"]);
    expect(desk.get("mix", "level:pads")).toBe(-10);
    fireEvent.click(get("button", "Redo"));
    expect(lastCall(desk)).toEqual(["redo"]);
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "Z", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "y", ctrlKey: true });
    expect(methods(desk).slice(-4)).toEqual(["undo", "redo", "undo", "redo"]);
  });
});

describe("listening", () => {
  test("Escape clears every mute and solo", () => {
    const desk = draw();
    fireEvent.click(get("button", "Mute pop"));
    expect(document.body.textContent).toContain("Mute 1");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(lastCall(desk)).toEqual(["clearListening"]);
    expect(document.body.textContent).not.toContain("Mute 1");
  });
});

describe("saving", () => {
  test("Save commits the staged samples, then hands onSave the file, then marks it saved", async () => {
    const host = fakeSampleHost();
    const seen: string[][] = [];
    const desk = fakeDesk();
    const onSave = mock(async (_file: MixFile) => {
      seen.push(methods(desk).filter((m) => m === "committed" || m === "saved") as string[]);
    });
    draw(desk, { onSave, samples: host });
    await act(async () => {
      await desk.stage("kit/pop", new ArrayBuffer(0), ENTRY, "token-a");
    });
    fireEvent.keyDown(slider("pads level"), { key: "ArrowUp" });
    await act(async () => fireEvent.click(get("button", "Save")));
    expect(host.calls).toEqual([["commit", ["token-a"]]]);
    // When the file was handed over, the samples were already the packs' and nothing was yet marked saved.
    expect(seen).toEqual([["committed"]]);
    expect(onSave).toHaveBeenCalledWith(desk.file());
    expect(lastCall(desk)).toEqual(["saved"]);
    expect(desk.staged()).toEqual([]);
    expect(desk.dirty()).toBe(false);
    expect(document.body.querySelector("[role=status]")).toHaveTextContent("Saved. 1 sample written.");
  });

  test("a commit that fails is said plainly: nothing is committed, saved or handed over", async () => {
    const host = fakeSampleHost({ fail: { commit: "the pack folder is read-only" } });
    const onSave = mock(async (_file: MixFile) => {});
    const desk = draw(fakeDesk(), { onSave, samples: host });
    await act(async () => {
      await desk.stage("kit/pop", new ArrayBuffer(0), ENTRY, "token-a");
    });
    await act(async () => fireEvent.click(get("button", "Save")));
    expect(document.body.querySelector("[role=alert]")).toHaveTextContent(
      "Save failed: the samples were not written (the pack folder is read-only)",
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(methods(desk)).not.toContain("committed");
    expect(methods(desk)).not.toContain("saved");
    expect(desk.staged()).toHaveLength(1);
  });

  test("a failed save says so plainly and stays unsaved", async () => {
    const desk = draw(fakeDesk(), {
      onSave: async () => {
        throw new Error("disk full");
      },
    });
    fireEvent.keyDown(slider("pads level"), { key: "ArrowUp" });
    await act(async () => fireEvent.click(get("button", "Save")));
    expect(document.body.querySelector("[role=alert]")).toHaveTextContent("Save failed: disk full");
    expect(methods(desk)).not.toContain("saved");
    expect(desk.dirty()).toBe(true);
  });
});

describe("samples", () => {
  // The sample's edit reads its source when it opens; happy-dom decodes no audio, so it settles on saying so.
  const settled = () => waitFor(() => expect(document.body.textContent).toMatch(/could not be drawn/));

  test("without a sample host the takes are shown and nothing replaces them", async () => {
    draw();
    fireEvent.click(get("button", "chime: show in the detail"));
    expect(get("textbox", "kit/chime-a take level")).toHaveAttribute("readonly");
    expect(find("button", "Replace kit/chime-a with a file")).toBeNull();
    expect(find("button", "Add a take from a file")).toBeNull();
    await settled();
  });

  test("a recording dropped on a take is processed, staged, compared and discarded through the desk", async () => {
    const host = fakeSampleHost();
    const desk = draw(fakeDesk(), { samples: host });
    fireEvent.click(get("button", "chime: show in the detail"));
    await settled();
    const file = new File([new Uint8Array(8)], "Bell 01.wav", { type: "audio/wav" });
    const row = get("button", "Replace kit/chime-a with a file").closest("li") as HTMLElement;
    await act(async () => {
      fireEvent.drop(row, { dataTransfer: { files: [file], types: ["Files"] } });
    });
    await waitFor(() => expect(methods(desk)).toContain("stage"));
    const request = host.calls.find((c) => c[0] === "process")?.[1] as Record<string, unknown>;
    expect(request).toMatchObject({ pack: "kit", sample: "chime-a", kind: "shot", fileName: "Bell 01.wav" });
    expect(request.file).toBe(file);
    fireEvent.click(get("radio", "A"));
    expect(lastCall(desk)).toEqual(["ab", "kit/chime-a", "a"]);
    fireEvent.click(get("button", "Discard"));
    expect(lastCall(desk)).toEqual(["unstage", "kit/chime-a"]);

    // A new take: a new sample of the cue's pack, named from the file, staged, then one more take.
    await act(async () => {
      fireEvent.drop(get("button", "Add a take from a file").closest("li") as HTMLElement, {
        dataTransfer: { files: [file], types: ["Files"] },
      });
    });
    await waitFor(() => expect(lastCall(desk)?.[0]).toBe("setTakes"));
    expect(lastCall(desk)).toEqual([
      "setTakes",
      "chime",
      [{ sample: "kit/chime-a", weight: 2 }, { sample: "kit/chime-b", level: -3 }, { sample: "kit/bell-01" }],
    ]);
    expect(desk.staged().map((each) => [each.key, each.fresh])).toEqual([["kit/bell-01", true]]);
    await settled();
  });
});

describe("a dropped loop", () => {
  const settled = () => waitFor(() => expect(document.body.textContent).toMatch(/could not be drawn/));
  test("its tempo and bars are read from its name and its length, else from the length alone", () => {
    // Eight bars at 100: the tempo is in the name, and the length agrees.
    expect(guessLoop("ZEN_LCS_100_atmosphere_loop_prologue_Emin.wav", 19.2, 108)).toEqual({
      bpm: 100,
      bars: 8,
    });
    // A number that says it is a tempo wins over one that does not.
    expect(guessLoop("take_090_pad_128bpm.wav", undefined, 108)).toEqual({ bpm: 128 });
    // The name's tempo stands where the length is not whole bars: the bars are left to be set.
    expect(guessLoop("pad_100.wav", 20, 108)).toEqual({ bpm: 100 });
    // No tempo in the name: the one nearest the pack's at which the length is a power of two of bars.
    expect(guessLoop("atmosphere.wav", 19.2, 108)).toEqual({ bpm: 100, bars: 8 });
    expect(guessLoop("atmosphere.wav", 19.2, 190)).toEqual({ bpm: 100, bars: 8 });
    expect(guessLoop("atmosphere.wav", undefined, 108)).toEqual({});
  });

  test("one the pipeline refuses is held in the editor, and runs again with what is set there", async () => {
    const options = {
      fail: { process: "a loop of 19.200 s is 1422 ms from 9 bars at 108 bpm" } as { process?: string },
    };
    const host = fakeSampleHost(options);
    const desk = draw(fakeDesk(), { samples: host });
    fireEvent.click(get("button", "theme/bass: show in the detail"));
    await settled();
    const file = new File([new Uint8Array(8)], "ZEN_LCS_100_atmosphere_loop.wav", { type: "audio/wav" });
    const row = get("button", "Replace theme/bass with a file").closest("li") as HTMLElement;
    await act(async () => {
      fireEvent.drop(row, { dataTransfer: { files: [file], types: ["Files"] } });
    });
    await waitFor(() => expect(find("button", "Forget this file")).not.toBeNull());
    // It was sent with the tempo its name gives, and refused: nothing is staged, and the file is still in hand.
    const first = host.calls.find((c) => c[0] === "process")?.[1] as Record<string, unknown>;
    expect(first).toMatchObject({ sample: "bass", kind: "loop", bpm: 100 });
    expect(methods(desk)).not.toContain("stage");

    options.fail = {};
    const apply = get("button", "Apply") as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(apply);
    });
    await waitFor(() => expect(methods(desk)).toContain("stage"));
    const again = host.calls.filter((c) => c[0] === "process").at(-1)?.[1] as Record<string, unknown>;
    expect(again.file).toBe(file);
    expect(again).toMatchObject({ bpm: 100 });
    expect(find("button", "Forget this file")).toBeNull();
  });
});

describe("the window", () => {
  const realOpen = window.open;
  const closers: (() => void)[] = [];
  afterEach(() => {
    for (const close of closers.splice(0)) close();
    window.open = realOpen;
  });
  const open = (options: Parameters<typeof openSoundDesk>[0]) => {
    const close = openSoundDesk(options);
    closers.push(close);
    return close;
  };

  /** A window object as the opener sees one: a document of its own, events, frames and a place on the screen. */
  function fakeWindow() {
    const doc = document.implementation.createHTMLDocument("");
    const events = new EventTarget();
    const win = {
      document: doc,
      closed: false,
      focus: mock(() => {}),
      close() {
        if (win.closed) return;
        win.closed = true;
        events.dispatchEvent(new Event("pagehide"));
      },
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      screenX: 10,
      screenY: 20,
      outerWidth: 900,
      outerHeight: 700,
    };
    window.open = (() => win) as unknown as typeof window.open;
    return win;
  }
  // The fake document has no window of its own for role queries: find controls by their names directly.
  const named = (doc: Document, name: string) => doc.querySelector(`[aria-label="${name}"]`);

  test("opens with the desk in it, focuses on a second call, closes by the returned function", async () => {
    const win = fakeWindow();
    const close = open({ desk: fakeDesk(), onSave: async () => {}, storageKey: KEY, title: "Desk" });
    await waitFor(() => expect(named(win.document, "music level")).not.toBeNull());
    expect(win.document.title).toBe("Desk");
    expect(openSoundDesk({ desk: fakeDesk(), onSave: async () => {} })).toBe(close);
    expect(win.focus).toHaveBeenCalled();
    act(() => close());
    expect(win.closed).toBe(true);
    expect(named(win.document, "music level")).toBeNull();
    expect(localStorage.getItem(KEY)).toContain('"w":900');
  });

  test("the opener going away closes it", async () => {
    const win = fakeWindow();
    open({ desk: fakeDesk(), onSave: async () => {}, storageKey: KEY });
    await waitFor(() => expect(named(win.document, "music level")).not.toBeNull());
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(win.closed).toBe(true);
  });

  test("a blocked popup warns once and returns a function that does nothing", () => {
    window.open = (() => null) as unknown as typeof window.open;
    const warn = mock(() => {});
    const real = console.warn;
    console.warn = warn;
    try {
      const a = open({ desk: fakeDesk(), onSave: async () => {} });
      const b = open({ desk: fakeDesk(), onSave: async () => {} });
      expect(() => a()).not.toThrow();
      b();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      console.warn = real;
    }
  });
});
