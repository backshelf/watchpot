// `llms.txt` (https://llmstxt.org): a plain map of the docs for a language model, written at the site's root from the
// same entries the docs search reads, so it lists every page the finder does, in the same groups and order.
import type { SearchEntry } from "./index";
import { firstSentences } from "./text";

/** The `llms.txt` body for `entries`, with links relative to the site's root (the docs live under `docs/`). */
export function llmsTxt(name: string, summary: string, entries: readonly SearchEntry[]): string {
  const groups = new Map<string, SearchEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.group) ?? [];
    list.push(entry);
    groups.set(entry.group, list);
  }
  const lines = [`# ${name}`, "", `> ${summary}`, ""];
  for (const [group, list] of groups) {
    lines.push(`## ${group}`, "");
    for (const entry of list) {
      const says = firstSentences(entry.text, 160);
      lines.push(`- [${entry.title}](docs/${entry.url})${says ? `: ${says}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
