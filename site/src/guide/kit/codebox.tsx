// The code box: the reader edits a piece of the example and the game beside it runs their version. The text is a
// plain textarea over a coloured copy of itself, so it edits, selects, undoes and reads aloud like any field.
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useGuide, useSnapshot } from "./context";
import { liteTokens } from "./lite-highlight";
import type { WorkerHost } from "./worker-host";

/** Words with `backticked` names set as code. */
function Ticks({ text }: { text: string }) {
  return <>{text.split("`").map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}</>;
}

/** How long typing has to pause before the box runs what is there. */
const IDLE_MS = 700;
const INDENT = "  ";

export function CodeBox({ label = "Your code" }: { label?: string }) {
  const { data, host } = useGuide();
  const edit = data.edit;
  if (!edit) throw new Error("a code box on a page whose game has no `edit`");
  const [text, setText] = useState(edit.piece);
  const { code } = useSnapshot();
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaving = useRef(false);
  const statusId = useId();
  const hintId = useId();
  const worker = host as WorkerHost;

  const run = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    worker.run?.(next);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const change = (next: string) => {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(next), IDLE_MS);
  };

  /** Replaces the selection (or the lines it touches) and puts the caret where it belongs, keeping undo. */
  const replace = (from: number, to: number, put: string, caret: number) => {
    const el = area.current;
    if (!el) return;
    el.setSelectionRange(from, to);
    // execCommand keeps the browser's undo history; where it is gone, set the value by hand.
    if (!document.execCommand?.("insertText", false, put)) {
      el.setRangeText(put, from, to, "end");
      change(el.value);
    }
    el.setSelectionRange(caret, caret);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end, value } = el;
    if (e.key === "Escape") {
      // Escape, then Tab, leaves the box: Tab alone indents.
      leaving.current = true;
      return;
    }
    if (e.key === "Tab" && !leaving.current && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      if (e.shiftKey) {
        if (value.startsWith(INDENT, lineStart))
          replace(lineStart, lineStart + INDENT.length, "", Math.max(lineStart, start - INDENT.length));
        return;
      }
      replace(start, end, INDENT, start + INDENT.length);
      return;
    }
    leaving.current = false;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run(value);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      // A new line starts at the indent of the one it breaks, one deeper after an opening bracket.
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const indent = /^ */.exec(value.slice(lineStart))?.[0] ?? "";
      const deeper = /[{([]\s*$/.test(value.slice(lineStart, start)) ? INDENT : "";
      const put = `\n${indent}${deeper}`;
      replace(start, end, put, start + put.length);
    }
  };

  const problem = code.kind === "refused" || code.kind === "threw" ? code.problem : null;
  const lines = text.split("\n");
  const bad = problem?.line;
  const status =
    code.kind === "checking"
      ? "Checking your version…"
      : code.kind === "running"
        ? "Running your version."
        : code.kind === "original"
          ? text === edit.piece
            ? "Running the example's own code. Change it: the game picks up your version a moment after you stop typing."
            : "Typing…"
          : null;

  return (
    <section className="codebox" aria-label={label} data-state={code.kind}>
      <header className="code__bar codebox__bar">
        <span className="code__lang">{label}</span>
        <span className="codebox__tools">
          <button type="button" className="codebox__button" onClick={() => run(text)}>
            Run <kbd>Ctrl</kbd>
            <kbd>Enter</kbd>
          </button>
          <button
            type="button"
            className="codebox__button"
            disabled={text === edit.piece && code.kind === "original"}
            onClick={() => {
              setText(edit.piece);
              if (timer.current) clearTimeout(timer.current);
              worker.restore?.();
            }}
          >
            Reset
          </button>
        </span>
      </header>
      <div className="codebox__field">
        <div className="codebox__gutter num" aria-hidden="true">
          {lines.map((_, i) => (
            <span key={i} data-bad={bad === i + 1 ? "" : undefined}>
              {i + 1}
            </span>
          ))}
        </div>
        <div className="codebox__edit">
          <pre className="codebox__paint" aria-hidden="true">
            {lines.map((line, i) => (
              <span className="codebox__line" key={i} data-bad={bad === i + 1 ? "" : undefined}>
                {liteTokens(line).map(([t, kind], j) => (
                  <span key={j} data-k={kind || undefined}>
                    {t}
                  </span>
                ))}
                {"\n"}
              </span>
            ))}
          </pre>
          <textarea
            ref={area}
            className="codebox__text"
            value={text}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            wrap="off"
            rows={lines.length}
            aria-label={`${label}: TypeScript`}
            aria-describedby={`${statusId} ${hintId}`}
            onChange={(e) => change(e.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      <div className="codebox__status" id={statusId} role="status" aria-live="polite">
        {problem ? (
          <div className="codebox__problem">
            <p className="codebox__title">
              <Ticks text={problem.title} />
            </p>
            <p>
              <Ticks text={problem.detail} />
            </p>
            {code.kind === "refused" ? (
              <p className="codebox__kept">The last version that worked is still running.</p>
            ) : null}
            {problem.raw ? (
              <details>
                <summary>What JavaScript said</summary>
                <code>{problem.raw}</code>
              </details>
            ) : null}
          </div>
        ) : (
          <p data-live={code.kind === "running" ? "" : undefined}>{status}</p>
        )}
      </div>
      <p className="codebox__hint" id={hintId}>
        Tab indents; Escape then Tab leaves the box.
      </p>
    </section>
  );
}
