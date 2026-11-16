// A crash boundary: what the page shows when a render (or the clock, which throws from one) gives up.
import { Component, type ErrorInfo, type ReactNode } from "react";

/** What a crash hands the game's fallback: what was thrown, and a way to try the page again. */
export interface Crash {
  error: unknown;
  /** Clears the crash and renders the children again (a second throw lands back in the fallback). */
  retry: () => void;
}

/** Props of `CrashBoundary`: the fallback's renderer and an optional listener. */
export interface CrashBoundaryProps {
  /** The page shown in place of the children: the game's own words, its save as text, a way to reload. */
  fallback: (crash: Crash) => ReactNode;
  /** Told once per crash, with React's component stack. */
  onCrash?: (error: unknown, info: ErrorInfo) => void;
  children?: ReactNode;
}

/**
 * Catches a throw from anything rendered under it (a screen, or `useGameClock` when the clock stops at its failure
 * limit) and renders `fallback` instead, so a broken pass never leaves a blank page. It has no look and no words:
 * the fallback is the game's, and it may read the store (to offer the save as text) because the boundary sits under
 * the store's provider.
 */
export class CrashBoundary extends Component<CrashBoundaryProps, { crash: { error: unknown } | null }> {
  override state: { crash: { error: unknown } | null } = { crash: null };

  static getDerivedStateFromError(error: unknown): { crash: { error: unknown } } {
    return { crash: { error } };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onCrash?.(error, info);
  }

  retry = (): void => this.setState({ crash: null });

  override render(): ReactNode {
    const { crash } = this.state;
    if (crash) return this.props.fallback({ error: crash.error, retry: this.retry });
    return this.props.children;
  }
}
