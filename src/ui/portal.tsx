import { createContext, type ReactNode, useContext } from "react";
import { createPortal } from "react-dom";

/** Props of `Portal`: what to move and where. */
export interface PortalProps {
  children?: ReactNode;
  /** Where the children go; `document.body` by default. Pick an element inside the game's theme scope to keep its tokens. */
  container?: Element | null;
}

/** Renders its children into `container` (the body by default), outside the parent's overflow and stacking. */
export function Portal({ children, container }: PortalProps) {
  if (typeof document === "undefined") return null;
  return createPortal(children, container ?? document.body);
}

/**
 * A named context whose hook throws a readable error outside its root: `Dialog.Title` without a `Dialog.Root` says
 * so, instead of failing on an undefined value.
 */
export function partContext<T>(root: string) {
  const Context = createContext<T | null>(null);
  const use = (part: string): T => {
    const value = useContext(Context);
    if (value === null) throw new Error(`${part} must be rendered inside ${root}`);
    return value;
  };
  return [Context.Provider, use] as const;
}
