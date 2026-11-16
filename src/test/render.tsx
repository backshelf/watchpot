import { type RenderResult, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { IdleStoreProvider, type RuntimeStore } from "../react/store";

/**
 * Testing Library's `render` under the store's provider (`watchpot/react`), kept across `rerender`: what a screen
 * test of a game mounts with. Needs a DOM (happy-dom) and `@testing-library/react`.
 */
export function renderWith(store: RuntimeStore, ui: ReactNode): RenderResult {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <IdleStoreProvider store={store}>{children}</IdleStoreProvider>
  );
  return render(ui, { wrapper });
}
