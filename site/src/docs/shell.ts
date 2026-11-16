// Filling the lead's shell page for one docs page.

/** `%BASE%`: the prefix from a page in the docs output to the site root (the docs output's parent). */
export function basePrefix(out: string): string {
  return "../".repeat(out.split("/").length);
}

/** Fills the shell's placeholders for one page. Inserted text is never rescanned for placeholders. */
export function fillShell(shell: string, out: string, slots: Record<string, string>): string {
  const base = basePrefix(out);
  const values: Record<string, string> = { ...slots, BASE: base };
  return shell
    .replaceAll('"./assets/', `"${base}assets/`)
    .replace(
      /%(TITLE|DESCRIPTION|NAV|CONTENT|PAGER|TOC|BASE)%/g,
      (whole, key: string) => values[key] ?? whole,
    );
}
