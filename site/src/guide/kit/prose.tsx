// The words of a page: glossary terms with their popups, listings quoted from the examples, and the small blocks a
// page is written in.
import { type MouseEvent, type PointerEvent, type ReactNode, useRef } from "react";
import { useTooltip } from "watchpot/ui";
import { useGuide } from "./context";
import type { ParamDef, Run } from "./page";
import type { ParamValue } from "./run";

/**
 * A word from the glossary. Hover, focus or tap shows its one plain sentence; the word itself links to the full
 * entry (on a touch, the first tap shows the sentence and a second follows the link). `id` is the entry's anchor in
 * the glossary (`derived-value`); the children default to the entry's title in lower case.
 */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const guide = useGuide();
  guide.used?.add(id);
  const term = guide.data.terms[id] ?? guide.glossary?.[id];
  const tip = useTooltip({ delay: 250, closeDelay: 200, touch: "tap", side: "top", padding: 12 });
  const pointer = useRef<string>("mouse");
  if (!term) throw new Error(`the glossary has no entry "${id}"`);
  const { ref, onClick, onPointerDown, ...trigger } = tip.triggerProps as Record<string, unknown> & {
    ref: never;
    onClick: (e: MouseEvent) => void;
    onPointerDown: (e: PointerEvent) => void;
  };
  const { ref: tipRef, ...content } = tip.contentProps as Record<string, unknown> & { ref: never };
  return (
    <span className="term">
      <a
        ref={ref}
        className="term__word"
        href={term.href}
        {...trigger}
        onPointerDown={(e) => {
          pointer.current = e.pointerType;
          onPointerDown(e);
        }}
        onClick={(e) => {
          const open = tip.open;
          onClick(e);
          // A first tap reads the word; a second, with its sentence showing, follows the link.
          if (pointer.current === "touch" && !open) e.preventDefault();
        }}
      >
        {children ?? term.title.toLowerCase()}
      </a>
      <span ref={tipRef} className="term__tip" {...content}>
        <span className="term__name">{term.title}</span>
        <span className="term__short">{term.short}</span>
        <span className="term__more">Select the word for the full entry.</span>
      </span>
    </span>
  );
}

/** The code a control's value is written as. */
export function written(def: ParamDef, value: ParamValue): string {
  if (def.kind === "choice") return def.options[Number(value)]?.code ?? "";
  const n = Number(value);
  if (def.code) return def.code(n);
  if (def.log) return String(n);
  const decimals = (String(def.step).split(".")[1] ?? "").length;
  return n.toFixed(decimals);
}

/** A line's runs, with the runs of one control's token gathered: a plain run alone, a token's runs together. */
function groups(line: Run[]): Run[][] {
  const out: Run[][] = [];
  for (const run of line) {
    const last = out[out.length - 1];
    if (run[2] && last?.[0]?.[2] === run[2]) last.push(run);
    else out.push([run]);
  }
  return out;
}

/**
 * A listing from the page's `code`, quoted from the example at build time. A control's token shows the value the
 * reader chose, boxed like a dimension on a drawing, and filled with the live tone while it differs from the file.
 */
export function Code({ id, caption }: { id: string; caption?: ReactNode }) {
  const { data, page, params } = useGuide();
  const code = data.code[id];
  if (!code) throw new Error(`the page has no listing "${id}"`);
  const defs = page.params ?? {};
  return (
    <figure className="code guide-code" data-lang={code.lang}>
      <figcaption className="code__bar">
        <span className="code__lang">{caption ?? code.file}</span>
      </figcaption>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a listing that scrolls sideways is reached by keyboard */}
      <pre tabIndex={0}>
        <code>
          {code.lines.map((line, i) => (
            <span className="line" key={i}>
              {groups(line).map((group, j) => {
                const [first] = group;
                const param = first?.[2];
                if (!param) {
                  const [text = "", colour = 0] = first ?? [];
                  const style = code.palette[colour] ? { color: code.palette[colour] } : undefined;
                  return (
                    <span key={j} style={style}>
                      {text}
                    </span>
                  );
                }
                // A token the highlighter split into several runs is one value: shown once, in its own colours
                // while it is the file's.
                const text = group.map(([t]) => t).join("");
                const def = defs[param];
                const value = params[param];
                const now = def && value !== undefined ? written(def, value) : text;
                return (
                  <span
                    key={j}
                    className="guide-code__param"
                    data-changed={now !== text ? "" : undefined}
                    title={def?.label}
                  >
                    {now !== text
                      ? now
                      : group.map(([t, colour], k) => (
                          <span
                            key={k}
                            style={code.palette[colour] ? { color: code.palette[colour] } : undefined}
                          >
                            {t}
                          </span>
                        ))}
                  </span>
                );
              })}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}

/** A "try this" list: things to do with the panel, in order. */
export function Try({ children, title = "Try it" }: { children: ReactNode; title?: ReactNode }) {
  return (
    <section className="guide-try" aria-label={typeof title === "string" ? title : "Try it"}>
      <h2 className="guide-try__title">{title}</h2>
      <ol>{children}</ol>
    </section>
  );
}

/** A note set apart from the column: a thing that bites, or a word about what comes later. */
export function Note({ children, title }: { children: ReactNode; title: ReactNode }) {
  return (
    <aside className="guide-note">
      <p className="guide-note__title">{title}</p>
      {children}
    </aside>
  );
}
