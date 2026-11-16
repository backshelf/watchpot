// The docs pages' script: the scheme switch, the page finder, the contents drawer on a phone, copy buttons, and the
// on-page contents that follow the reader. Every part checks for its elements first: a source page has no on-page
// contents and no pager. Without this script the pages still read and navigate: every link is a plain link.
import { slugify } from "./docs/text";

const root = document.documentElement;
const $ = <T extends Element = HTMLElement>(selector: string, from: ParentNode = document) =>
  from.querySelector<T>(selector);
const $$ = <T extends Element = HTMLElement>(selector: string, from: ParentNode = document) => [
  ...from.querySelectorAll<T>(selector),
];

const announcer = $("[data-announce]");
let announceTimer: ReturnType<typeof setTimeout> | undefined;
/** Says something to a screen reader, politely. */
function announce(text: string) {
  if (!announcer) return;
  clearTimeout(announceTimer);
  announcer.textContent = "";
  announceTimer = setTimeout(() => {
    announcer.textContent = text;
  }, 60);
}

// ---------------------------------------------------------------- the scheme switch (agrees with site/src/app/scheme.ts)

type Scheme = "light" | "dark";
const SCHEME_KEY = "watchpot.site.scheme";
const schemeName = (scheme: Scheme) => (scheme === "dark" ? "Blueprint" : "Blueline");
const currentScheme = (): Scheme => (root.dataset.scheme === "dark" ? "dark" : "light");

function storedScheme(): string | null {
  try {
    return localStorage.getItem(SCHEME_KEY);
  } catch {
    return null;
  }
}

function paintSchemeSwitch() {
  const scheme = currentScheme();
  const other: Scheme = scheme === "dark" ? "light" : "dark";
  for (const button of $$("[data-scheme-toggle]")) {
    button.setAttribute(
      "aria-label",
      `${schemeName(scheme)}: switch to the ${schemeName(other).toLowerCase()} (${other})`,
    );
    const label = $("[data-scheme-label]", button);
    if (label) label.textContent = schemeName(scheme);
  }
}

function setScheme(scheme: Scheme) {
  root.dataset.scheme = scheme;
  try {
    localStorage.setItem(SCHEME_KEY, scheme);
  } catch {
    // A browser that refuses storage still switches for this visit.
  }
  paintSchemeSwitch();
}

for (const button of $$("[data-scheme-toggle]")) {
  button.addEventListener("click", () => setScheme(currentScheme() === "dark" ? "light" : "dark"));
}
paintSchemeSwitch();

// Follow the system while the reader has not chosen.
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
  const chosen = storedScheme();
  if (chosen === "light" || chosen === "dark") return;
  root.dataset.scheme = event.matches ? "dark" : "light";
  paintSchemeSwitch();
});

// Print in the blueline whatever is on screen: a printer drops the blueprint's ground and keeps its pale ink.
let schemeBeforePrint: Scheme | null = null;
addEventListener("beforeprint", () => {
  schemeBeforePrint = currentScheme();
  root.dataset.scheme = "light";
});
addEventListener("afterprint", () => {
  if (schemeBeforePrint) root.dataset.scheme = schemeBeforePrint;
  schemeBeforePrint = null;
});

// ---------------------------------------------------------------- copy buttons

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // An older or locked-down browser: copy through a selection.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

const copyTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
document.addEventListener("click", async (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-copy]");
  const code = button?.closest("figure")?.querySelector("pre code");
  if (!button || !code) return;
  const ok = await copyText(code.textContent ?? "");
  button.textContent = ok ? "Copied" : "Not copied";
  button.toggleAttribute("data-copied", ok);
  announce(ok ? "Copied to the clipboard" : "The browser did not allow the copy");
  clearTimeout(copyTimers.get(button));
  copyTimers.set(
    button,
    setTimeout(() => {
      button.textContent = "Copy";
      button.removeAttribute("data-copied");
    }, 1800),
  );
});

// ---------------------------------------------------------------- the contents rail and its drawer

const rail = $("[data-nav]");
const toggle = $<HTMLButtonElement>("[data-nav-toggle]");
const scrim = $("[data-nav-scrim]");
const phone = matchMedia("(max-width: 53.74em)");
const behind = () => $$(".mast, .docs__main, .docs__toc");

const isOpen = () => rail?.hasAttribute("data-open") ?? false;

function setDrawer(open: boolean, { restoreFocus = true } = {}) {
  if (!rail || !toggle || open === isOpen()) return;
  rail.toggleAttribute("data-open", open);
  root.toggleAttribute("data-nav-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  if (scrim) scrim.hidden = !open;
  for (const element of behind()) element.inert = open;
  if (open) {
    rail.setAttribute("role", "dialog");
    rail.setAttribute("aria-modal", "true");
    rail.scrollTop = 0;
    const here = $<HTMLElement>('.doc-nav a[aria-current="page"]', rail);
    if (here) centreInRail(here);
    (here ?? $<HTMLElement>("[data-nav-close]", rail))?.focus({ preventScroll: true });
  } else {
    rail.removeAttribute("role");
    rail.removeAttribute("aria-modal");
    if (restoreFocus) toggle.focus({ preventScroll: true });
  }
}

toggle?.addEventListener("click", () => setDrawer(!isOpen()));
scrim?.addEventListener("click", () => setDrawer(false));
if (rail) $("[data-nav-close]", rail)?.addEventListener("click", () => setDrawer(false));
// A link followed inside the drawer (a heading on this page, say) closes it.
rail?.addEventListener("click", (event) => {
  if (isOpen() && (event.target as Element).closest("a")) setDrawer(false, { restoreFocus: false });
});
phone.addEventListener("change", () => {
  if (!phone.matches) setDrawer(false, { restoreFocus: false });
});

/** Scrolls the rail (not the page) so a link sits in the middle of it. */
function centreInRail(link: HTMLElement) {
  if (!rail) return;
  const top = link.offsetTop - rail.clientHeight / 2 + link.offsetHeight / 2;
  rail.scrollTop = Math.max(0, top);
}

// The current page in view on load, when the rail is a column of its own.
const current = rail ? $<HTMLElement>('.doc-nav a[aria-current="page"]', rail) : null;
if (current && rail && !phone.matches) {
  const top = current.offsetTop;
  if (top + current.offsetHeight > rail.clientHeight - 24) centreInRail(current);
}

// ---------------------------------------------------------------- the finder

type Entry = { url: string; title: string; group: string; headings: string[]; text: string };

const field = $<HTMLInputElement>("[data-nav-filter]");
const results = $("[data-nav-results]");
const status = $("[data-nav-status]");
const nav = rail ? $(".doc-nav", rail) : null;
const navLinks = nav ? $$<HTMLAnchorElement>("a", nav) : [];
const titles = new Map(navLinks.map((link) => [link, link.textContent ?? ""]));

// The docs folder: the first top link is the Overview at its root. search.json sits beside it.
const overview = nav ? $<HTMLAnchorElement>(".doc-nav__top a", nav) : null;
const docsRoot = overview ? new URL(".", overview.href) : null;
let entries: Entry[] | null = null;
let loading: Promise<void> | null = null;

function loadEntries() {
  if (loading || !docsRoot) return loading;
  loading = fetch(new URL("search.json", docsRoot))
    .then((response) => (response.ok ? (response.json() as Promise<Entry[]>) : []))
    .then((list) => {
      entries = Array.isArray(list) ? list : [];
    })
    .catch(() => {
      entries = [];
    });
  return loading;
}

const termsOf = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);
const matchesAll = (text: string, terms: string[]) => {
  const lower = text.toLowerCase();
  return terms.every((term) => lower.includes(term));
};

/** The text with each term marked: built from text nodes, never from HTML. */
function marked(text: string, terms: string[]): DocumentFragment {
  const lower = text.toLowerCase();
  const hits: [number, number][] = [];
  for (const term of terms) {
    const at = lower.indexOf(term);
    if (at >= 0) hits.push([at, at + term.length]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  const fragment = document.createDocumentFragment();
  let from = 0;
  for (const [start, end] of hits) {
    if (end <= from) continue;
    const begin = Math.max(start, from);
    fragment.append(text.slice(from, begin));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(begin, end);
    fragment.append(mark);
    from = end;
  }
  fragment.append(text.slice(from));
  return fragment;
}

/** A few words of a summary around the first term. */
function snippet(text: string, term: string): string {
  const at = text.toLowerCase().indexOf(term);
  const start = Math.max(0, at - 30);
  const end = Math.min(text.length, at + term.length + 50);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

function filter() {
  if (!field || !nav) return;
  const terms = termsOf(field.value);
  const active = terms.length > 0;
  const titleHits = new Set<string>();

  for (const link of navLinks) {
    const title = titles.get(link) ?? "";
    const hit = !active || matchesAll(title, terms);
    const item = link.closest("li");
    if (item) item.hidden = !hit;
    const label = document.createElement("span");
    label.append(active && hit ? marked(title, terms) : title);
    link.replaceChildren(label);
    if (active && hit) titleHits.add(new URL(link.href).pathname);
  }
  for (const list of $$("ul", nav)) {
    const anyShown = $$("li", list).some((item) => !item.hidden);
    const block = list.closest(".doc-nav__group") ?? list;
    (block as HTMLElement).hidden = !anyShown;
  }

  if (!results) return;
  results.replaceChildren();
  results.hidden = !active;
  if (!active) {
    if (status) status.textContent = "";
    return;
  }

  // Pages whose headings or summary match, below the pages whose names do.
  const found: { href: string; title: string; detail: string; mark: string[] }[] = [];
  if (entries && docsRoot) {
    for (const entry of entries) {
      if (found.length >= 8) break;
      const page = new URL(entry.url, docsRoot);
      if (titleHits.has(page.pathname)) continue;
      const heading = entry.headings.find((h) => matchesAll(h, terms) && h !== entry.title);
      if (heading) {
        found.push({
          href: `${page.href}#${slugify(heading)}`,
          title: entry.title,
          detail: heading,
          mark: terms,
        });
      } else if (matchesAll(entry.text, terms)) {
        found.push({
          href: page.href,
          title: entry.title,
          detail: snippet(entry.text, terms[0] ?? ""),
          mark: terms,
        });
      }
    }
  }

  if (found.length > 0) {
    const label = document.createElement("h2");
    label.className = "doc-nav__label";
    label.textContent = "In the pages";
    const list = document.createElement("ul");
    for (const hit of found) {
      const link = document.createElement("a");
      link.href = hit.href;
      const name = document.createElement("strong");
      name.textContent = hit.title;
      const detail = document.createElement("span");
      detail.append(marked(hit.detail, hit.mark));
      link.append(name, detail);
      const item = document.createElement("li");
      item.append(link);
      list.append(item);
    }
    results.append(label, list);
  } else if (titleHits.size === 0) {
    const none = document.createElement("p");
    none.className = "doc-find__empty";
    none.textContent = entries ? "No page matches." : "No page name matches.";
    results.append(none);
  }

  if (status) {
    const count = (n: number) => `${n} ${n === 1 ? "page" : "pages"}`;
    const parts = [
      titleHits.size ? `${count(titleHits.size)} by name` : "",
      found.length ? `${count(found.length)} by heading or summary` : "",
    ].filter(Boolean);
    status.textContent = parts.length ? parts.join(", ") : "No page matches";
  }
}

/** The links a reader can move through with the arrow keys: what the finder left showing. */
const shownLinks = () =>
  rail
    ? $$<HTMLAnchorElement>(".doc-nav a, .doc-find__results a", rail).filter((a) => !a.closest("[hidden]"))
    : [];

if (field && rail) {
  field.addEventListener("focus", () => void loadEntries(), { once: true });
  field.addEventListener("input", () => {
    filter();
    // The headings arrive once; run again when they do.
    if (!entries) void loadEntries()?.then(filter);
  });
  field.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && field.value) {
      event.preventDefault();
      event.stopPropagation();
      field.value = "";
      filter();
    } else if (event.key === "Enter") {
      const first = field.value.trim() ? shownLinks()[0] : undefined;
      if (first) {
        event.preventDefault();
        first.click();
      }
    } else if (event.key === "ArrowDown") {
      const first = shownLinks()[0];
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  rail.addEventListener("keydown", (event) => {
    const link = (event.target as Element).closest?.("a");
    if (!link || !field.value.trim() || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    const links = shownLinks();
    const at = links.indexOf(link as HTMLAnchorElement);
    event.preventDefault();
    const next = event.key === "ArrowDown" ? links[at + 1] : links[at - 1];
    (next ?? (event.key === "ArrowUp" ? field : link)).focus();
  });
}

// `/` finds a page from anywhere but a field; Escape closes the drawer.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isOpen()) {
    event.preventDefault();
    setDrawer(false);
    return;
  }
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || !field) return;
  const target = event.target as HTMLElement;
  if (target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
  event.preventDefault();
  if (phone.matches) setDrawer(true);
  field.focus();
  field.select();
});

// ---------------------------------------------------------------- the on-page contents

const fold = $<HTMLDetailsElement>("[data-toc-fold]");
const wide = matchMedia("(min-width: 68.75em)");
if (fold) {
  const syncFold = () => {
    fold.open = wide.matches;
  };
  syncFold();
  wide.addEventListener("change", syncFold);
}

const toc = $(".doc-toc");
const tocBox = $(".docs__toc");
if (toc && "IntersectionObserver" in window) {
  const byId = new Map<string, HTMLAnchorElement>();
  for (const link of $$<HTMLAnchorElement>("a[href^='#']", toc)) {
    byId.set(decodeURIComponent(link.hash.slice(1)), link);
  }
  const headings = $$(".doc__body :is(h2, h3)[id]").filter((h) => byId.has(h.id));
  let shown: HTMLAnchorElement | undefined;

  const mastHeight = () => $(".mast")?.getBoundingClientRect().height ?? 56;
  const update = () => {
    const line = mastHeight() + innerHeight * 0.25;
    let reading = headings[0];
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= line) reading = heading;
      else break;
    }
    // At the foot of the page the last sections cannot reach the line: the last one in view is the one read.
    if (innerHeight + scrollY >= root.scrollHeight - 2) {
      const last = headings.at(-1);
      if (last && last.getBoundingClientRect().top < innerHeight) reading = last;
    }
    const link = reading ? byId.get(reading.id) : undefined;
    if (link === shown) return;
    shown?.removeAttribute("aria-current");
    link?.setAttribute("aria-current", "location");
    shown = link;
    // Keep it in view inside the contents column, without moving the page.
    if (link && tocBox && wide.matches && tocBox.scrollHeight > tocBox.clientHeight) {
      const top = link.offsetTop;
      if (top < tocBox.scrollTop + 40 || top > tocBox.scrollTop + tocBox.clientHeight - 60) {
        tocBox.scrollTop = Math.max(0, top - tocBox.clientHeight / 3);
      }
    }
  };

  const observer = new IntersectionObserver(update, {
    rootMargin: `-${Math.round(mastHeight())}px 0px -60% 0px`,
    threshold: [0, 1],
  });
  for (const heading of headings) observer.observe(heading);
  addEventListener("scrollend", update, { passive: true });
  update();
}
