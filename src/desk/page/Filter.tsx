// The filter column: a search box, then the series in groups, each with a checkbox and a toggle for its whole group.
import { useEffect, useRef } from "react";

export interface FilterItem {
  id: string;
  label: string;
  /** The checkbox's accessible name when the label alone is not unique. */
  name?: string;
  dash: number;
}

export interface FilterGroup {
  id: string;
  heading: string;
  items: readonly FilterItem[];
}

function GroupToggle({
  group,
  items,
  selected,
  onSet,
}: {
  group: FilterGroup;
  items: readonly FilterItem[];
  selected: ReadonlySet<string>;
  onSet: (ids: string[], on: boolean) => void;
}) {
  const box = useRef<HTMLInputElement>(null);
  const on = items.filter((i) => selected.has(i.id)).length;
  const all = items.length > 0 && on === items.length;
  useEffect(() => {
    if (box.current) box.current.indeterminate = on > 0 && !all;
  }, [on, all]);
  return (
    <input
      ref={box}
      type="checkbox"
      aria-label={`Toggle every series under ${group.heading}`}
      checked={all}
      disabled={items.length === 0}
      onChange={() =>
        onSet(
          items.map((i) => i.id),
          !all,
        )
      }
    />
  );
}

export function Filter(props: {
  groups: readonly FilterGroup[];
  selected: ReadonlySet<string>;
  search: string;
  onSearch: (text: string) => void;
  onSet: (ids: string[], on: boolean) => void;
}) {
  const { groups, selected, search, onSearch, onSet } = props;
  const needle = search.trim().toLowerCase();
  return (
    <aside className="filter" aria-label="Series">
      <div className="filter__stick">
        <input
          className="filter__search"
          type="search"
          placeholder="Search series"
          aria-label="Search series"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        {groups.map((group) => {
          const items = group.items.filter((i) => i.label.toLowerCase().includes(needle));
          return (
            <fieldset className="filter__group" key={group.id}>
              <legend className="filter__head">
                <GroupToggle group={group} items={items} selected={selected} onSet={onSet} />
                <span className="lettering">{group.heading}</span>
              </legend>
              {items.length === 0 ? (
                <p className="filter__none">
                  {group.items.length === 0 ? "None yet: they appear as the run plays." : "Nothing matches."}
                </p>
              ) : (
                <ul className="filter__list">
                  {items.map((i) => (
                    <li key={i.id}>
                      <label className="filter__item">
                        <input
                          type="checkbox"
                          aria-label={i.name ?? i.label}
                          checked={selected.has(i.id)}
                          onChange={(e) => onSet([i.id], e.target.checked)}
                        />
                        <svg className="filter__swatch" viewBox="0 0 28 8" aria-hidden="true">
                          <line
                            className={`filter__swatchline dash-${i.dash}`}
                            x1="0"
                            x2="28"
                            y1="4"
                            y2="4"
                          />
                        </svg>
                        <span className="filter__name">{i.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          );
        })}
      </div>
    </aside>
  );
}
