// A page in the browser: read the data the build put beside the HTML, make the game's host, and hydrate the article
// the build drew. Each page's own script is this, with its page.
import { hydrateRoot } from "react-dom/client";
import { shownInPanel } from "./example-page";
import { LocalHost } from "./host";
import type { PageData, PageDef } from "./page";
import { GuideRoot } from "./shell";
import { WorkerHost } from "./worker-host";

export function hydrateGuide(page: PageDef) {
  const root = document.getElementById("guide-root");
  const json = document.getElementById("guide-data")?.textContent;
  if (!root || !json) return;
  const data = JSON.parse(json) as PageData;
  const options = {
    page: data.slug,
    modules: data.modules,
    keep: page.game.keep ?? "local",
    clock: page.game.clock ?? true,
    intervalMs: page.game.intervalMs,
    externals: page.game.externals,
    store: page.game.store,
    start: page.game.start,
  };
  const host = data.edit
    ? new WorkerHost(
        {
          ...options,
          worker: data.edit.worker,
          source: { before: data.edit.before, after: data.edit.after, indent: data.edit.indent },
          trial: data.edit.trial,
        },
        data.edit.piece,
      )
    : new LocalHost(options, data.defaults);
  hydrateRoot(root, <GuideRoot page={page} data={data} host={host} />, {
    onRecoverableError: (error) => console.warn("guide: hydration", error),
    // A mistake the page shows on purpose (an example's component that throws) is said in the panel, in plain words.
    onCaughtError: (error, info) => {
      if (!shownInPanel(error)) console.error(error, info.componentStack);
    },
  });
}
