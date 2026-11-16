// The masthead: the mark, the sheets of this page, the docs, and the switch between the two prints.
import { useState } from "react";
import { Dialog } from "watchpot/ui";
import { schemeName, toggleScheme, useScheme } from "./scheme";

export const SHEETS = [
  { href: "#live", label: "Running" },
  { href: "#systems", label: "Systems" },
  { href: "#sim", label: "Sim" },
  { href: "#ui", label: "UI" },
  { href: "#shader", label: "Shader" },
  { href: "#sound", label: "Sound" },
  { href: "#made-with", label: "A game" },
] as const;

export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <circle className="mark__live" cx="16" cy="16" r="5" />
      <circle cx="16" cy="16" r="9.25" strokeWidth="2" />
      <path d="M3 13.5v5M29 13.5v5" strokeWidth="2" strokeLinecap="square" />
      <path d="M16 1.5v5M16 25.5v5M1.5 16h3M27.5 16h3" strokeWidth="1" />
    </svg>
  );
}

export function Mast() {
  const scheme = useScheme();
  const [open, setOpen] = useState(false);
  const other = scheme === "dark" ? "light" : "dark";

  return (
    <header className="mast">
      <a className="mast__home" href="#content" aria-label="watchpot, top of the page">
        <Mark />
        <span className="mast__name">watchpot</span>
      </a>
      <nav className="mast__sheets" aria-label="On this page">
        {SHEETS.map((sheet) => (
          <a key={sheet.href} href={sheet.href}>
            {sheet.label}
          </a>
        ))}
      </nav>
      <div className="mast__tools">
        <a className="mast__link mast__docs" href="./docs/index.html">
          Docs
        </a>
        <button
          className="scheme"
          type="button"
          onClick={toggleScheme}
          aria-label={`${schemeName(scheme)}: switch to the ${schemeName(other).toLowerCase()} (${other})`}
        >
          <span data-scheme-label>{schemeName(scheme)}</span>
        </button>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger className="mast__menu" aria-label="Contents">
            Contents
          </Dialog.Trigger>
          <Dialog.Scrim className="drawer__scrim" />
          <Dialog.Panel className="drawer" aria-label="Contents">
            <Dialog.Title className="lettering">On this page</Dialog.Title>
            <nav aria-label="On this page">
              {SHEETS.map((sheet) => (
                <a key={sheet.href} href={sheet.href} onClick={() => setOpen(false)}>
                  {sheet.label}
                </a>
              ))}
              <a href="./docs/index.html">Docs</a>
            </nav>
            <Dialog.Close className="button">Close</Dialog.Close>
          </Dialog.Panel>
        </Dialog.Root>
      </div>
    </header>
  );
}
