import { type ReactNode } from "react";
import type { RootActions } from "../core/store";
import { type PacedViewOptions } from "./paced";
/**
 * Any store `createIdleStore` made, as the generic hooks read it: its state (the root actions on it), a
 * subscription and an immer `setState`. Methods, so a game's store, typed over its whole state, is one.
 */
export interface RuntimeStore {
    getState(): RootActions;
    setState(recipe: (draft: object) => void): void;
    subscribe(listener: (state: object, prev: object) => void): () => void;
}
/** A store's state type, read off its `getState`. */
export type StoreState<Store> = Store extends {
    getState(): infer S;
} ? S : never;
/**
 * The store the game renders against. There is no default: the composition root builds the store and provides it
 * (`mountGame`, `IdleStoreProvider`), and a test provides one built on a memory backend (`renderWith`).
 */
export declare const IdleStoreContext: import("react").Context<RuntimeStore | null>;
/** Provides the game's store to the tree; `mountGame` renders under it. */
export declare function IdleStoreProvider({ store, children }: {
    store: RuntimeStore;
    children: ReactNode;
}): import("react").JSX.Element;
/** The store in context, untyped: what the engine's own hooks, the shell and the dev panel read. */
export declare function useIdleStore(): RuntimeStore;
/** The typed store hooks `createRuntimeHooks` makes for a game: `useGameStore`, `useGameState` and `useGameView`. */
export interface RuntimeHooks<Store extends RuntimeStore> {
    /** The store in context, as the game's own type. Handlers read it with `store.getState()`. */
    useGameStore(): Store;
    /** `useStore(selector)` against the store in context. Object-building selectors want `useShallow`. */
    useGameState<T>(selector: (state: StoreState<Store>) => T): T;
    /**
     * The whole state at a slow pace (`usePacedState`), for a screen that reads much of it: at once after the
     * player's input, a few times a second while the game runs by itself, never while the tab is hidden. A figure
     * that must move every tick is read with a narrow `useGameState` selector instead.
     */
    useGameView(): StoreState<Store>;
}
/** Options of `createRuntimeHooks`: the pace of `useGameView`. */
export interface RuntimeHooksOptions {
    view?: PacedViewOptions;
}
/**
 * The game's typed store hooks over the one context: `createRuntimeHooks<GameStore>()`, once, in the game's own
 * runtime module. Systems and the app read the store only through these.
 */
export declare function createRuntimeHooks<Store extends RuntimeStore>(options?: RuntimeHooksOptions): RuntimeHooks<Store>;
/** Renders `node` into `#root` (or `rootId`) under the store's provider: a game's root and every dev page mount this way. */
export declare function mountGame(store: RuntimeStore, node: ReactNode, rootId?: string): void;
