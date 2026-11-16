// Clicker input: `Pressable` counts one activation per press across mouse, touch (one per finger), pen and keyboard,
// and says where it landed; `HoldButton` repeats an action while held, faster the longer it is held.
import {
  type ComponentPropsWithRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLatest } from "./hooks";
import { type AsChild, mergeProps, renderPart } from "./slot";

/** One press: where it landed in the element (px from its top-left), in the viewport, and what made it. */
export interface PressInfo {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  /** "virtual" is a click with no pointer or key (assistive tech, `element.click()`). */
  pointerType: "mouse" | "touch" | "pen" | "keyboard" | "virtual";
}

/** Options of `usePress`: the press callback, whether keys repeat, and disabled. */
export interface PressOptions {
  onPress: (press: PressInfo) => void;
  /** A held Space or Enter presses again on each key repeat. Default false. */
  keyRepeat?: boolean;
  disabled?: boolean;
}

/** What `usePress` hands back: whether anything holds it down now, and the element's props. */
export interface PressApi {
  pressed: boolean;
  pressProps: Record<string, unknown>;
}

const centre = (el: Element, pointerType: PressInfo["pointerType"]): PressInfo => {
  const r = el.getBoundingClientRect();
  return {
    x: r.width / 2,
    y: r.height / 2,
    clientX: r.left + r.width / 2,
    clientY: r.top + r.height / 2,
    pointerType,
  };
};

/**
 * Press counting for a click target: each pointer down is one press (so two fingers are two), Space and Enter are
 * one each (repeats only with `keyRepeat`), and a click with no pointer or key behind it (assistive tech) is one. The
 * browser's own click after a pointer or key is not counted again.
 */
export function usePress(options: PressOptions): PressApi {
  const latest = useLatest(options);
  const down = useRef(new Set<number | "key">());
  const [pressed, setPressed] = useState(false);
  const sync = () => setPressed(down.current.size > 0);
  const release = (id: number | "key") => {
    if (down.current.delete(id)) sync();
  };
  const press = (info: PressInfo) => {
    if (!latest.current.disabled) latest.current.onPress(info);
  };

  useEffect(() => {
    if (options.disabled) {
      down.current.clear();
      setPressed(false);
    }
  }, [options.disabled]);

  return {
    pressed,
    pressProps: {
      "data-pressed": pressed ? "" : undefined,
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (latest.current.disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
        down.current.add(event.pointerId);
        sync();
        const r = event.currentTarget.getBoundingClientRect();
        press({
          x: event.clientX - r.left,
          y: event.clientY - r.top,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerType: (event.pointerType || "mouse") as PressInfo["pointerType"],
        });
      },
      onPointerUp: (event: PointerEvent) => release(event.pointerId),
      onPointerCancel: (event: PointerEvent) => release(event.pointerId),
      onPointerLeave: (event: PointerEvent) => release(event.pointerId),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== " " && event.key !== "Enter") return;
        // Ours to count: the browser's click from this key would be a second press.
        event.preventDefault();
        if (event.repeat && !latest.current.keyRepeat) return;
        down.current.add("key");
        sync();
        press(centre(event.currentTarget, "keyboard"));
      },
      onKeyUp: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        release("key");
      },
      onBlur: () => release("key"),
      onClick: (event: MouseEvent<HTMLElement>) => {
        // `detail` is 0 for a click no pointer made: a screen reader's activation or a script's.
        if (event.detail === 0) press(centre(event.currentTarget, "virtual"));
      },
    },
  };
}

/** Props of `Pressable`: the press options and a button's. */
export interface PressableProps
  extends Omit<ComponentPropsWithRef<"button">, "onClick">,
    Omit<PressOptions, "disabled">,
    AsChild {}

/**
 * A clicker's click target: a button that calls `onPress` once per press, with where it landed (for floating
 * numbers), across mouse, multi-touch, pen and keyboard. `data-pressed` while held. Its words are the game's.
 */
export function Pressable({ onPress, keyRepeat, disabled, asChild, ...props }: PressableProps) {
  const { pressProps } = usePress({ onPress, keyRepeat, disabled });
  return renderPart("button", asChild, { type: "button", ...mergeProps(pressProps, props), disabled });
}

// ---------------------------------------------------------------------------------------------------------------
// Hold to repeat

/** Options of `useHoldRepeat`: the action and the repeat curve. */
export interface HoldRepeatOptions {
  /** Runs once at the press and again on every repeat; return `false` to stop (nothing left to buy). */
  action: () => unknown;
  /** Wait before the first repeat, ms. Default 400. */
  delay?: number;
  /** The first repeat interval, ms. Default 150. */
  interval?: number;
  /** The fastest interval, ms. Default 30. */
  minInterval?: number;
  /** Each repeat's interval is the last one times this. Default 0.85. */
  acceleration?: number;
  disabled?: boolean;
}

/** What `useHoldRepeat` hands back: whether it is held now, the element's props and a stop. */
export interface HoldRepeatApi {
  holding: boolean;
  stop: () => void;
  holdProps: Record<string, unknown>;
}

/**
 * Buy-while-held: the action runs at the press, then after `delay` repeats with an interval shrinking by
 * `acceleration` to `minInterval`. It stops on release, on the pointer leaving, on blur, on disable, or when the
 * action returns `false`. Keyboard holds work the same (Space or Enter, the key's own repeats ignored).
 */
export function useHoldRepeat(options: HoldRepeatOptions): HoldRepeatApi {
  const latest = useLatest(options);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);

  const stop = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, []);

  const start = () => {
    const o = latest.current;
    if (o.disabled || timer.current !== null) return;
    if (o.action() === false) return;
    setHolding(true);
    const { delay = 400, interval = 150, minInterval = 30, acceleration = 0.85 } = o;
    const step = (wait: number) => {
      timer.current = setTimeout(() => {
        if (latest.current.disabled || latest.current.action() === false) {
          stop();
          return;
        }
        step(Math.max(minInterval, wait * acceleration));
      }, wait);
    };
    timer.current = setTimeout(() => {
      if (latest.current.disabled || latest.current.action() === false) {
        stop();
        return;
      }
      step(Math.max(minInterval, interval));
    }, delay);
  };

  useEffect(() => {
    if (options.disabled) stop();
  }, [options.disabled, stop]);
  useEffect(() => stop, [stop]);

  return {
    holding,
    stop,
    holdProps: {
      "data-holding": holding ? "" : undefined,
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        start();
      },
      onPointerUp: stop,
      onPointerLeave: stop,
      onPointerCancel: stop,
      onBlur: stop,
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (!event.repeat) start();
      },
      onKeyUp: (event: KeyboardEvent) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        stop();
      },
      onClick: (event: MouseEvent) => {
        // Assistive tech activates without a pointer: one action, no hold.
        if (event.detail === 0 && !latest.current.disabled) latest.current.action();
      },
      // A long press on touch must not open the context menu over the button.
      onContextMenu: (event: MouseEvent) => event.preventDefault(),
    },
  };
}

/** Props of `HoldButton`: the hold-repeat options and a button's. */
export interface HoldButtonProps
  extends Omit<ComponentPropsWithRef<"button">, "onClick">,
    Omit<HoldRepeatOptions, "disabled">,
    AsChild {}

/** A button that repeats `action` while held, accelerating (buy-while-held); `data-holding` while it repeats. */
export function HoldButton({
  action,
  delay,
  interval,
  minInterval,
  acceleration,
  disabled,
  asChild,
  ...props
}: HoldButtonProps) {
  const { holdProps } = useHoldRepeat({ action, delay, interval, minInterval, acceleration, disabled });
  return renderPart("button", asChild, { type: "button", ...mergeProps(holdProps, props), disabled });
}
