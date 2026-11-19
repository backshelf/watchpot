// A guide page's frame: where it sits in the sequence, its title and idea, the words beside the live panel, and the
// way on. The site's docs shell (masthead, contents) is around it; this is the article.
import { useCallback, useEffect, useMemo, useState } from "react";
import { type Guide, GuideContext } from "./context";
import type { GameHost } from "./host";
import type { Link, PageData, PageDef, TermData } from "./page";
import type { ParamValue } from "./run";

function Progress({ data }: { data: PageData }) {
  const total = data.steps.length;
  return (
    <nav className="steps" aria-label={`${data.section}, step by step`}>
      <p className="steps__where">
        {data.section} <span className="num">{String(data.n).padStart(2, "0")}</span>
        <span className="steps__of"> of {total}</span>
      </p>
      <ol className="steps__list">
        {data.steps.map((step) => {
          const state =
            step.n < data.n ? "done" : step.n === data.n ? "here" : step.href ? "ahead" : "unwritten";
          const words = `${step.n}. ${step.title}${step.href ? "" : " (being written)"}`;
          return (
            <li key={step.n}>
              {step.href && step.n !== data.n ? (
                <a className="steps__cell" data-state={state} href={step.href} title={words}>
                  <span className="visually-hidden">{words}</span>
                </a>
              ) : (
                <span
                  className="steps__cell"
                  data-state={state}
                  title={words}
                  aria-current={step.n === data.n ? "step" : undefined}
                >
                  <span className="visually-hidden">{words}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Pager({ prev, next }: { prev: Link | null; next: Link | null }) {
  if (!prev && !next) return null;
  return (
    <nav className="doc-pager guide-pager" aria-label="Previous and next step">
      {prev ? (
        <a className="doc-pager__prev" rel="prev" href={prev.href}>
          <span>{prev.label ?? "Previous"}</span>
          <strong>{prev.title}</strong>
        </a>
      ) : null}
      {next ? (
        <a className="doc-pager__next" rel="next" href={next.href}>
          <span>{next.label ?? "Next"}</span>
          <strong>{next.title}</strong>
        </a>
      ) : null}
    </nav>
  );
}

export interface GuideRootProps {
  page: PageDef;
  data: PageData;
  host: GameHost & { setParams?: (params: Record<string, ParamValue>) => void };
  glossary?: Record<string, TermData>;
  used?: Set<string>;
}

/** The whole article for one page, drawn the same at build time and in the browser. */
export function GuideRoot({ page, data, host, glossary, used }: GuideRootProps) {
  const [params, setParams] = useState<Record<string, ParamValue>>(data.defaults);
  const setParam = useCallback((name: string, value: ParamValue) => {
    setParams((prior) => (prior[name] === value ? prior : { ...prior, [name]: value }));
  }, []);

  // The game starts once the page is drawn, and runs again whenever a control moves.
  useEffect(() => {
    host.start();
    return () => host.stop();
  }, [host]);
  useEffect(() => {
    if (params !== data.defaults) host.setParams?.(params);
  }, [host, params, data.defaults]);

  const guide = useMemo<Guide>(
    () => ({ page, data, host, params, setParam, glossary, used }),
    [page, data, host, params, setParam, glossary, used],
  );
  const { Body, Panel } = page;
  return (
    <GuideContext value={guide}>
      <article className="doc step">
        <header className="doc__head step__head">
          <Progress data={data} />
          <h1>{page.title}</h1>
          <p className="step__idea">{page.idea}</p>
        </header>
        <div className="step__grid">
          <aside className="step__panel">
            <Panel />
          </aside>
          <div className="doc__body step__body">
            <Body />
          </div>
        </div>
        <Pager prev={data.prev} next={data.next} />
      </article>
    </GuideContext>
  );
}
