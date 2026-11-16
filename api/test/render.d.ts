import { type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { type RuntimeStore } from "../react/store";
/**
 * Testing Library's `render` under the store's provider (`watchpot/react`), kept across `rerender`: what a screen
 * test of a game mounts with. Needs a DOM (happy-dom) and `@testing-library/react`.
 */
export declare function renderWith(store: RuntimeStore, ui: ReactNode): RenderResult;
