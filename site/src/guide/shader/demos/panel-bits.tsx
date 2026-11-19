// Two controls the guide's own kit does not carry, drawn in its look: a small stepper and a switch. Both are the
// panel's own (like `PanelChoice`), not tokens in an example, so nothing a reader moves here re-runs anything.
import { useId } from "react";

/** A number stepped by a pair of ruled buttons, drawn as the kit's steppers are. */
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="control" data-kind="stepper">
      <span className="control__label" id={id}>
        {label}
      </span>
      <output className="control__value num" htmlFor={id}>
        {value}
        {unit ? <span className="control__unit"> {unit}</span> : null}
      </output>
      <span className="control__stepper">
        <button
          type="button"
          className="control__step"
          aria-label={`Less: ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          −
        </button>
        <output className="control__field num" aria-labelledby={id}>
          {value}
        </output>
        <button
          type="button"
          className="control__step"
          aria-label={`More: ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
        >
          +
        </button>
      </span>
    </div>
  );
}

/** A switch of two ruled cells: the one that holds is inked, as the panel's clock switch is. */
export function Toggle({
  label,
  on,
  onText,
  offText,
  onChange,
}: {
  label: string;
  on: boolean;
  onText: string;
  offText: string;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="panel__row">
      <span className="panel__label" id={id}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={id}
        className="control__switch"
        onClick={() => onChange(!on)}
      >
        <span className="control__switch-on">{onText}</span>
        <span className="control__switch-off">{offText}</span>
      </button>
    </div>
  );
}
