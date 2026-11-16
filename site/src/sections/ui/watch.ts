// The read-out's source: a MutationObserver over the panel (and over the dialog's layer while it is open) that keeps
// the element in hand, what the engine has written on it, and a short log of the discrete writes. Everything here is
// read off the DOM as it changes; nothing is narrated.

/** One attribute on the element in hand, and whether it was written a moment ago. */
export interface ShownAttr {
  name: string;
  value: string;
  fresh: boolean;
}

/** One discrete write: on what, which attribute, from what to what. A repeat of the newest line updates it. */
export interface LogLine {
  id: number;
  who: string;
  name: string;
  from: string | null;
  to: string | null;
}

export interface WatchSnapshot {
  subject: { who: string; attrs: readonly ShownAttr[]; kids: readonly string[] } | null;
  log: readonly LogLine[];
  /** Elements on the panel that carry a class name right now. */
  classed: number;
}

/** What counts as a part worth reading: anything with a role, and the native controls. */
const SPEAKS = "[role], button, input, time, [data-toast]";
/** Attributes that move with the clock or a drag: shown on the element in hand, kept out of the log. */
const CONTINUOUS = new Set([
  "class",
  "style",
  "aria-label",
  "aria-valuemin",
  "aria-valuemax",
  "aria-valuenow",
  "aria-valuetext",
  "datetime",
  "value",
]);
/** Attributes no reader needs: ids, the plain button type, the name React keeps on an input. */
const SKIP = new Set(["id", "for", "type", "name"]);
const FRESH_MS = 1200;
const LOG_LINES = 5;

const clip = (text: string, most: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > most ? `${t.slice(0, most - 1)}…` : t;
};

function roleOf(el: Element): string {
  const role = el.getAttribute("role");
  if (role) return role;
  if (el instanceof HTMLInputElement) return el.type === "range" ? "slider" : "input";
  return el.tagName.toLowerCase();
}

function nameOf(el: Element): string {
  const label = el.getAttribute("aria-label");
  if (label) return label;
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const text = by
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    if (text.trim()) return text;
  }
  if (el instanceof HTMLInputElement && el.labels?.[0]) return el.labels[0].textContent ?? "";
  return el.textContent ?? "";
}

const whoOf = (el: Element) => {
  const name = clip(nameOf(el), 24);
  return name ? `${roleOf(el)} "${name}"` : roleOf(el);
};

/** The custom properties in an inline style: what the engine hands the game's CSS. */
const customProps = (style: string) =>
  style
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d.startsWith("--"))
    .join("; ");

const shownAttr = (el: Element, name: string) =>
  !SKIP.has(name) || (name === "type" && el instanceof HTMLInputElement);

export interface Watch {
  subscribe: (wake: () => void) => () => void;
  snapshot: () => WatchSnapshot;
  /** Watch this element's subtree (the panel, the dialog's layer). */
  observe: (root: Element) => () => void;
  /** Put the part at or around `target` in hand, if it is on a watched root. */
  hold: (target: EventTarget | null) => void;
  /** The element the class count reads (the panel). */
  counting: (root: Element | null) => void;
  stop: () => void;
}

export function createWatch(): Watch {
  const roots = new Set<Element>();
  const listeners = new Set<() => void>();
  const changed = new WeakMap<Element, Map<string, number>>();
  let subject: Element | null = null;
  let counted: Element | null = null;
  let log: LogLine[] = [];
  let lineId = 0;
  let snap: WatchSnapshot = { subject: null, log, classed: 0 };
  let frame = 0;
  let fade: ReturnType<typeof setTimeout> | undefined;

  const read = (): WatchSnapshot => {
    const now = performance.now();
    let held: WatchSnapshot["subject"] = null;
    if (subject?.isConnected) {
      const marks = changed.get(subject);
      const attrs: ShownAttr[] = [];
      for (const a of Array.from(subject.attributes)) {
        if (!shownAttr(subject, a.name)) continue;
        const value = a.name === "style" ? customProps(a.value) : a.value;
        if (a.name === "style" && !value) continue;
        attrs.push({ name: a.name, value, fresh: now - (marks?.get(a.name) ?? -Infinity) < FRESH_MS });
      }
      if (!subject.hasAttribute("class")) attrs.push({ name: "class", value: "", fresh: false });
      // What the children carry (a bar's steps): counted by data attribute.
      const kids = new Map<string, number>();
      for (const child of Array.from(subject.children).slice(0, 64)) {
        for (const a of Array.from(child.attributes)) {
          if (a.name.startsWith("data-")) kids.set(a.name, (kids.get(a.name) ?? 0) + 1);
        }
      }
      held = {
        who: whoOf(subject),
        attrs,
        kids: [...kids].map(([name, n]) => `[${name}] ×${n}`),
      };
    }
    return { subject: held, log, classed: counted ? counted.querySelectorAll("[class]").length : 0 };
  };

  const emit = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      snap = read();
      for (const wake of listeners) wake();
    });
  };

  const fadeLater = () => {
    clearTimeout(fade);
    fade = setTimeout(emit, FRESH_MS + 50);
  };

  const push = (who: string, name: string, from: string | null, to: string | null) => {
    const newest = log[0];
    if (newest && newest.who === who && newest.name === name) {
      log = [{ ...newest, to }, ...log.slice(1)];
    } else {
      lineId += 1;
      log = [{ id: lineId, who, name, from, to }, ...log].slice(0, LOG_LINES);
    }
  };

  const observer = new MutationObserver((records) => {
    let touched = false;
    const now = performance.now();
    for (const r of records) {
      if (r.type === "attributes" && r.attributeName && r.target instanceof Element) {
        const el = r.target;
        const name = r.attributeName;
        const to = el.getAttribute(name);
        if (to === r.oldValue) continue;
        let marks = changed.get(el);
        if (!marks) {
          marks = new Map();
          changed.set(el, marks);
        }
        marks.set(name, now);
        if (el === subject) touched = true;
        if (!CONTINUOUS.has(name) && !SKIP.has(name) && el.matches(SPEAKS)) {
          push(whoOf(el), name, r.oldValue, to);
          touched = true;
        }
      } else if (r.type === "childList") {
        for (const node of Array.from(r.addedNodes)) {
          if (node instanceof Element && node.matches("[data-toast]")) {
            push(whoOf(node), "added", null, null);
            touched = true;
          }
        }
        for (const node of Array.from(r.removedNodes)) {
          if (node instanceof Element && node.matches("[data-toast]")) {
            push(whoOf(node), "removed", null, null);
            touched = true;
          }
        }
        if (r.target === counted || counted?.contains(r.target)) touched = true;
      }
    }
    if (touched) {
      emit();
      fadeLater();
    }
  });

  return {
    subscribe(wake) {
      listeners.add(wake);
      return () => listeners.delete(wake);
    },
    snapshot: () => snap,
    observe(root) {
      roots.add(root);
      observer.observe(root, { attributes: true, attributeOldValue: true, subtree: true, childList: true });
      return () => roots.delete(root);
    },
    hold(target) {
      if (!(target instanceof Element)) return;
      const part = target.closest(SPEAKS);
      if (!part || part === subject) return;
      for (const root of roots) {
        if (root.contains(part)) {
          subject = part;
          emit();
          return;
        }
      }
    },
    counting(root) {
      counted = root;
      emit();
    },
    stop() {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(fade);
      roots.clear();
      listeners.clear();
    },
  };
}
