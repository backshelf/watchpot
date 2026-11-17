import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Desk, MixFile, SampleHost } from "../sound/desk";
import { DEFAULT_STORAGE_KEY, readPrefs, writePrefs } from "./desk/prefs";
import "./tokens.css";

/**
 * A switch of the game's own in the desk's top bar: one of a few named states, set from the desk (which scene the
 * sound is in, say, so a mix can be worked on without playing to it). `options` and `value` are read on every draw.
 */
export interface DeskSwitch {
  id: string;
  label: string;
  options(): readonly { value: string; label: string }[];
  value(): string;
  set(value: string): void;
}

/** What a game hands the mix desk's window. */
export interface SoundDeskOptions {
  /** The sound's desk (`sound.desk`). */
  desk: Desk;
  /**
   * Who processes a dropped recording and writes it into a pack (`fetchSampleHost(url)` over a dev server that
   * mounts `watchpot/sound/pack`'s `sampleHost`). Without one the desk shows samples and takes and replaces none.
   * Save commits what is staged through it before `onSave`.
   */
  samples?: SampleHost;
  /** The game's own switches, in the top bar. */
  switches?: readonly DeskSwitch[];
  /**
   * Saves the mix: called with `desk.file()` when the person presses Save. A game writes it where its own
   * `createSound({ mix })` reads it from (a route on its dev server that writes the file into the repository).
   * The desk calls `desk.saved()` once the promise resolves, and shows the failure when it rejects.
   */
  onSave: (file: MixFile) => void | Promise<void>;
  /** The window's title (default "Mix desk"). */
  title?: string;
  /**
   * A key under which the desk keeps, on this device, what is not the mix: which scenes have been heard (only those
   * are shown, so a game's later scenes are not named before they play), the window's size, how its panes are
   * sized, what is folded and what is selected.
   */
  storageKey?: string;
}

const NAME = "watchpot-sound-desk";
const SIZE = { w: 1320, h: 860 };

/**
 * The desk's view, loaded when the window first opens and never in a production build: as with the dev panel's gate,
 * Bun makes `process.env.NODE_ENV` a constant there, the import is dead code, and the view's script and stylesheet
 * stay out of the bundle.
 */
const loadView =
  process.env.NODE_ENV === "production"
    ? null
    : () => import("./desk/SoundDeskView").then((m) => m.SoundDeskView);

interface Open {
  win: Window;
  close: () => void;
}
let open: Open | null = null;
const warned = new Set<string>();
function warnOnce(key: string, text: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(text);
}

/**
 * Copies the opener's stylesheets into the desk's document and keeps them in step: the bundler puts a CSS module's
 * rules in the opener's `<head>` (the desk's own arrive there when its view first loads, after the window opens).
 */
function mirrorStyles(from: Document, to: Document): () => void {
  const clones = new Map<Node, HTMLElement>();
  const isSheet = (n: Node): n is HTMLStyleElement | HTMLLinkElement =>
    n.nodeName === "STYLE" ||
    (n.nodeName === "LINK" && ((n as HTMLLinkElement).rel ?? "").split(/\s+/).includes("stylesheet"));
  const sync = () => {
    const live = new Set<Node>();
    for (const node of from.head.querySelectorAll("style, link")) {
      if (!isSheet(node)) continue;
      live.add(node);
      let clone = clones.get(node);
      if (!clone) {
        clone = to.createElement(node.nodeName === "STYLE" ? "style" : "link");
        for (const { name, value } of [...node.attributes]) clone.setAttribute(name, value);
        clones.set(node, clone);
        to.head.append(clone);
      }
      // A link's own href is absolute; a style's text may be rewritten in place by a hot reload.
      if (node.nodeName === "LINK") {
        const href = (node as HTMLLinkElement).href;
        if (clone.getAttribute("href") !== href) clone.setAttribute("href", href);
      } else if (clone.textContent !== node.textContent) {
        clone.textContent = node.textContent;
      }
    }
    for (const [node, clone] of clones) {
      if (live.has(node)) continue;
      clone.remove();
      clones.delete(node);
    }
  };
  sync();
  const Observer = from.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  const watch = new Observer(sync);
  watch.observe(from.head, { childList: true, subtree: true, characterData: true, attributes: true });
  return () => watch.disconnect();
}

/**
 * Opens the mix desk in a window of its own (a development tool: a game calls it from a dev build only) and returns
 * a function that closes it. Called while it is open, it brings the window forward. Where a window cannot be opened
 * (a blocked popup), it returns a function that does nothing and warns once.
 */
export function openSoundDesk(options: SoundDeskOptions): () => void {
  if (open && !open.win.closed) {
    open.win.focus();
    return open.close;
  }
  if (!loadView) {
    warnOnce(
      "production",
      "openSoundDesk: the mix desk's window is a development tool and is not in this build.",
    );
    return () => {};
  }
  const key = options.storageKey ?? DEFAULT_STORAGE_KEY;
  const title = options.title ?? "Mix desk";
  const g = readPrefs(key).geometry;
  const features = [
    "popup",
    `width=${Math.round(g?.w ?? SIZE.w)}`,
    `height=${Math.round(g?.h ?? SIZE.h)}`,
    ...(g ? [`left=${Math.round(g.x)}`, `top=${Math.round(g.y)}`] : []),
  ].join(",");
  let win: Window | null = null;
  try {
    win = window.open("", NAME, features);
  } catch {
    win = null;
  }
  if (!win) {
    warnOnce(
      "blocked",
      "openSoundDesk: the browser blocked the mix desk's window. Allow popups for this page.",
    );
    return () => {};
  }
  const w = win;
  const doc = w.document;
  // A new window's blank document renders in quirks mode: start it over as a standards one.
  doc.open();
  doc.write("<!doctype html><html><head><meta charset=utf-8></head><body></body></html>");
  doc.close();
  doc.title = title;
  doc.documentElement.lang = document.documentElement.lang || "en";
  // The page itself, before any stylesheet arrives: stock in the system's scheme (the blueline or the blueprint), so
  // no flash of the wrong one, and it fills the window.
  const dark = w.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  for (const el of [doc.documentElement, doc.body]) {
    el.style.margin = "0";
    el.style.background = dark ? "oklch(0.235 0.078 264)" : "oklch(0.975 0.006 240)";
    el.style.colorScheme = dark ? "dark" : "light";
  }
  doc.body.replaceChildren();
  const mount = doc.createElement("div");
  doc.body.append(mount);
  const unmirror = mirrorStyles(document, doc);

  let root: { unmount: () => void } | null = null;
  let done = false;
  const remember = () => {
    try {
      if (w.closed || !w.outerWidth) return;
      writePrefs(key, { geometry: { x: w.screenX, y: w.screenY, w: w.outerWidth, h: w.outerHeight } });
    } catch {
      // A window already gone has no geometry to keep.
    }
  };
  const teardown = () => {
    if (done) return;
    done = true;
    remember();
    root?.unmount();
    root = null;
    unmirror();
    window.removeEventListener("pagehide", onOpenerHide);
    window.removeEventListener("beforeunload", onOpenerLeave);
    w.removeEventListener("pagehide", onDeskHide);
    w.removeEventListener("resize", onResize);
    if (open?.win === w) open = null;
  };
  const close = () => {
    // Unmounted first, so the window's own unsaved-changes prompt does not stand in the way of a close it asked for.
    teardown();
    if (!w.closed) w.close();
  };
  // The game going away (a reload, a close) takes the desk with it: the sound it mixed is gone.
  const onOpenerHide = () => close();
  // The game reloading loses what the desk has not saved, so it asks too.
  const onOpenerLeave = (e: BeforeUnloadEvent) => {
    if (!options.desk.dirty() && options.desk.staged().length === 0) return;
    e.preventDefault();
    e.returnValue = "";
  };
  const onDeskHide = () => teardown();
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(remember, 300);
  };
  window.addEventListener("pagehide", onOpenerHide);
  window.addEventListener("beforeunload", onOpenerLeave);
  w.addEventListener("pagehide", onDeskHide);
  w.addEventListener("resize", onResize);
  open = { win: w, close };

  loadView().then(
    (SoundDeskView) => {
      if (done) return;
      const r = createRoot(mount);
      r.render(
        createElement(
          StrictMode,
          null,
          createElement(SoundDeskView, {
            desk: options.desk,
            onSave: options.onSave,
            samples: options.samples,
            switches: options.switches,
            title,
            storageKey: key,
            win: w,
            ownsDocument: true,
          }),
        ),
      );
      root = r;
    },
    (error: unknown) => {
      console.error("openSoundDesk: the desk's view did not load", error);
      close();
    },
  );
  return close;
}
