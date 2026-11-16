// The page an example draws: what its `mountGame` call was handed, rendered in the panel under the example's own
// store, with a boundary that says in plain words why it stopped when one of its components throws.
import { Component, type ReactNode } from "react";
import { useGuide, useSnapshot } from "./context";

/** Errors the panel has shown the reader: the page's root does not log them again. */
const shown = new WeakSet<object>();

export const shownInPanel = (error: unknown) =>
  typeof error === "object" && error !== null && shown.has(error);

/** React's own words for a component that re-drew itself without end (#185 is the same error in a production build). */
const LOOP = /Maximum update depth exceeded|Minified React error #185\b/;

function said(error: unknown): { title: string; detail: string; raw: string } {
  const raw = error instanceof Error ? error.message : String(error);
  if (LOOP.test(raw)) {
    return {
      title: "React stopped drawing the page",
      detail:
        "A component asked to be drawn again every time it was drawn, so React gave up. A selector that hands back a new value each time it is asked does exactly this: the value never looks the same twice, so React never stops.",
      raw,
    };
  }
  return {
    title: "A component threw while it was drawn",
    detail: "The page stopped drawing at the component that threw. Your game would show a blank page here.",
    raw,
  };
}

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    if (typeof error === "object" && error !== null) shown.add(error);
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const { title, detail, raw } = said(error);
    return (
      <div className="example-page__problem" role="alert">
        <p className="example-page__title">{title}</p>
        <p>{detail}</p>
        <details>
          <summary className="example-page__summary">What React said</summary>
          <code className="example-page__raw">{raw}</code>
        </details>
      </div>
    );
  }
}

/**
 * The page the example mounts (`mountGame(store, <App />)` in its file), drawn by its own components against its own
 * store. The look is this site's: the example's markup carries none.
 */
export function ExamplePage({ label = "The page it draws" }: { label?: ReactNode }) {
  const { host } = useGuide();
  const { build } = useSnapshot();
  const node = host.mounted() as ReactNode;
  return (
    <div className="example-page">
      <p className="panel__label">{label}</p>
      <div className="example-page__sheet">
        {/* A new build is a new page: the boundary starts over with it. */}
        <Boundary key={build}>{node ?? <p>Nothing mounted yet.</p>}</Boundary>
      </div>
    </div>
  );
}
