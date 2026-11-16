// What the engine wrote: the attributes on the part in hand, and the last discrete writes on the panel, read off the
// DOM by `watch.ts`. It takes no focus and is no live region: it is there to be looked at, not announced.
import { useSyncExternalStore } from "react";
import type { Watch } from "./watch";

export function Readout({ watch }: { watch: Watch }) {
  const snap = useSyncExternalStore(watch.subscribe, watch.snapshot, watch.snapshot);
  const held = snap.subject;

  return (
    <div className="plate uiread">
      <div className="plate__head">
        <h3>What the engine wrote</h3>
        <span className="num uiread__count">
          {snap.classed === 0 ? "no class names on the panel" : `${snap.classed} elements with a class`}
        </span>
      </div>
      <div className="plate__body uiread__body">
        <div className="uiread__held">
          <p className="lettering uiread__cap">In hand</p>
          {held ? (
            <>
              <p className="num uiread__who">{held.who}</p>
              <dl className="num uiread__attrs">
                {held.attrs.map((a) => (
                  <div key={a.name} className={a.fresh ? "is-live" : undefined}>
                    <dt>{a.name}</dt>
                    <dd>
                      {a.name === "class" && !a.value ? (
                        <span className="uiread__none">none</span>
                      ) : (
                        `"${a.value}"`
                      )}
                    </dd>
                  </div>
                ))}
                {held.kids.length ? (
                  <div>
                    <dt>children</dt>
                    <dd>{held.kids.join(", ")}</dd>
                  </div>
                ) : null}
              </dl>
            </>
          ) : (
            <p className="uiread__empty">Point at a part of the panel, or move focus onto one.</p>
          )}
        </div>
        <div className="uiread__logwrap">
          <p className="lettering uiread__cap">Last writes, newest first</p>
          {snap.log.length ? (
            <ol className="num uiread__log">
              {snap.log.map((line) => (
                <li key={line.id}>
                  <span className="uiread__on">{line.who}</span>
                  <span className="uiread__attr">{line.name}</span>
                  {line.name === "added" || line.name === "removed" ? null : (
                    <span className="uiread__change">
                      {line.from === null ? "absent" : `"${line.from}"`} →{" "}
                      {line.to === null ? "absent" : `"${line.to}"`}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="uiread__empty">Nothing yet. Operate the panel and the writes land here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
