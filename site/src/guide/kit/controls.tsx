// The page's controls: each sets one value in the example (a token in its code), and the game runs again with it at
// once. Sliders and steppers for numbers, a switch or a row of choices for code that can be one of a few things.
import { useId } from "react";
import { useGuide } from "./context";
import type { ChoiceParam, NumberParam } from "./page";
import { written } from "./prose";

function NumberControl({ name, def }: { name: string; def: NumberParam }) {
  const { params, setParam, data } = useGuide();
  const id = useId();
  const value = Number(params[name] ?? def.min);
  const original = Number(data.defaults[name]);
  const set = (next: number) => {
    const clamped = Math.min(def.max, Math.max(def.min, next));
    // The step's grid, without float dust (0.1 + 0.2).
    const decimals = (String(def.step).split(".")[1] ?? "").length;
    setParam(name, Number(clamped.toFixed(decimals)));
  };
  const shown = written(def, value);
  return (
    <div className="control" data-kind={def.kind} data-changed={value !== original ? "" : undefined}>
      <label className="control__label" htmlFor={id}>
        {def.label}
      </label>
      <output className="control__value num" htmlFor={id}>
        {shown}
        {def.unit ? <span className="control__unit"> {def.unit}</span> : null}
      </output>
      {def.kind === "slider" ? (
        <input
          id={id}
          className="control__slider"
          type="range"
          min={def.min}
          max={def.max}
          step={def.step}
          value={value}
          aria-valuetext={`${shown}${def.unit ? ` ${def.unit}` : ""}`}
          onChange={(e) => set(Number(e.currentTarget.value))}
        />
      ) : (
        <span className="control__stepper">
          <button
            type="button"
            className="control__step"
            aria-label={`Less: ${def.label}`}
            disabled={value <= def.min}
            onClick={() => set(value - def.step)}
          >
            −
          </button>
          <input
            id={id}
            className="control__field num"
            type="number"
            inputMode="decimal"
            min={def.min}
            max={def.max}
            step={def.step}
            value={value}
            onChange={(e) => {
              const n = Number(e.currentTarget.value);
              if (e.currentTarget.value !== "" && Number.isFinite(n)) set(n);
            }}
          />
          <button
            type="button"
            className="control__step"
            aria-label={`More: ${def.label}`}
            disabled={value >= def.max}
            onClick={() => set(value + def.step)}
          >
            +
          </button>
        </span>
      )}
      <button
        type="button"
        className="control__back"
        hidden={value === original}
        onClick={() => setParam(name, original)}
      >
        Back to {written(def, original)}
      </button>
    </div>
  );
}

function ChoiceControl({ name, def }: { name: string; def: ChoiceParam }) {
  const { params, setParam, data } = useGuide();
  const id = useId();
  const value = Number(params[name] ?? 0);
  const original = Number(data.defaults[name]);
  if (def.options.length === 2) {
    const other = original === 0 ? 1 : 0;
    const on = value === original;
    return (
      <div className="control" data-kind="switch" data-changed={!on ? "" : undefined}>
        <span className="control__label" id={id}>
          {def.label}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={id}
          className="control__switch"
          onClick={() => setParam(name, on ? other : original)}
        >
          <span className="control__switch-on">{def.options[original]?.label}</span>
          <span className="control__switch-off">{def.options[other]?.label}</span>
        </button>
      </div>
    );
  }
  return (
    <fieldset className="control" data-kind="choice" data-changed={value !== original ? "" : undefined}>
      <legend className="control__label">{def.label}</legend>
      <span className="control__choices">
        {def.options.map((option, i) => (
          <label key={option.code} className="control__choice">
            <input type="radio" name={id} checked={value === i} onChange={() => setParam(name, i)} />
            <span>{option.label}</span>
          </label>
        ))}
      </span>
    </fieldset>
  );
}

/**
 * The page's controls (all of them, or the ones named), in a ruled strip. Put it next to the listing whose tokens
 * they change.
 */
export function Controls({ names, title = "Turn it" }: { names?: readonly string[]; title?: string }) {
  const { page } = useGuide();
  const defs = page.params ?? {};
  const shown = (names ?? Object.keys(defs)).flatMap((name) => {
    const def = defs[name];
    return def ? [[name, def] as const] : [];
  });
  return (
    <section className="controls" aria-label={title}>
      <h2 className="controls__title">{title}</h2>
      {shown.map(([name, def]) =>
        def.kind === "choice" ? (
          <ChoiceControl key={name} name={name} def={def} />
        ) : (
          <NumberControl key={name} name={name} def={def} />
        ),
      )}
    </section>
  );
}
