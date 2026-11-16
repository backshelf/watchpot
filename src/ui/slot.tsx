// `Slot` and the prop merging under every part's `asChild`: a game hands in its own element (a `motion.div`, a link)
// and the part's behaviour lands on it. Child props win, except handlers (both run) and refs (both set).
import {
  type CSSProperties,
  cloneElement,
  type ElementType,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefCallback,
  type RefObject,
  type SyntheticEvent,
  useCallback,
  useState,
} from "react";

/**
 * A part's ref, for a game that draws the element itself. It is a callback ref, so `ref={part.ref}` and a spread of
 * the part's props fit any element; it also holds the node as `current`, so a game keeping a ref of its own on the
 * same element can set `part.ref.current = node` from that ref's callback instead.
 */
export type PartRef = ((node: HTMLElement | null) => void) & { current: HTMLElement | null };

/** A `PartRef` over the ref a primitive keeps for itself: the same one for the component's life. */
export function usePartRef(inner: RefObject<HTMLElement | null>): PartRef {
  return useState(() => {
    const ref = (node: HTMLElement | null) => {
      inner.current = node;
    };
    return Object.defineProperty(ref, "current", {
      get: () => inner.current,
      set: (node: HTMLElement | null) => {
        inner.current = node;
      },
    }) as PartRef;
  })[0];
}

/** Sets every ref to the node; the returned callback's cleanup clears them (React 19 ref cleanup). */
export function composeRefs<T>(...refs: readonly (Ref<T> | undefined)[]): RefCallback<T> {
  return (node) => {
    const cleanups: (() => void)[] = [];
    for (const ref of refs) {
      if (typeof ref === "function") {
        const cleanup = ref(node);
        cleanups.push(typeof cleanup === "function" ? cleanup : () => ref(null));
      } else if (ref) {
        ref.current = node;
        cleanups.push(() => {
          ref.current = null;
        });
      }
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  };
}

/** `composeRefs` held stable while the refs are the same, so React does not detach and reattach every render. */
export function useComposedRefs<T>(...refs: readonly (Ref<T> | undefined)[]): RefCallback<T> {
  // biome-ignore lint/correctness/useExhaustiveDependencies: the refs themselves are the dependencies
  return useCallback(composeRefs(...refs), refs);
}

type Handler = (event: SyntheticEvent) => void;

/**
 * Runs the game's handler, then the part's own unless the game's called `preventDefault`: a game cancels a part's
 * behaviour the way it cancels the browser's.
 */
export function chain<E extends SyntheticEvent>(
  theirs: ((event: E) => void) | undefined,
  ours: ((event: E) => void) | undefined,
): ((event: E) => void) | undefined {
  if (!theirs) return ours;
  if (!ours) return theirs;
  return (event) => {
    theirs(event);
    if (!event.defaultPrevented) ours(event);
  };
}

const isHandler = (key: string, value: unknown): value is Handler =>
  /^on[A-Z]/.test(key) && typeof value === "function";

/**
 * Merges a part's props (`ours`) under a game element's (`theirs`): handlers chain (theirs first), classes join,
 * styles merge (theirs win), everything else is theirs where given. Refs are not merged here.
 */
export function mergeProps(ours: object, theirs: object): Record<string, unknown> {
  const base = ours as Readonly<Record<string, unknown>>;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(theirs)) {
    const mine = base[key];
    if (key === "ref") continue;
    if (isHandler(key, value) && isHandler(key, mine)) out[key] = chain(value, mine);
    else if (key === "className" && typeof mine === "string" && typeof value === "string")
      out[key] = `${mine} ${value}`;
    else if (key === "style" && mine && value)
      out[key] = { ...(mine as CSSProperties), ...(value as CSSProperties) };
    else if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Props of `Slot`: the props to land on its one child element, and that child. */
export interface SlotProps extends Record<string, unknown> {
  children?: ReactNode;
  ref?: Ref<unknown>;
}

/**
 * Renders its one child element with these props merged in (`mergeProps`) and both refs set. What a part's
 * `asChild` renders: the game's element takes the part's behaviour, ARIA and data attributes.
 */
export function Slot({ children, ref, ...props }: SlotProps): ReactElement | null {
  const child = isValidElement<Record<string, unknown>>(children) ? children : null;
  const childRef = child?.props.ref as Ref<unknown> | undefined;
  const refs = useComposedRefs(ref, childRef);
  if (!child) return null;
  return cloneElement(child, { ...mergeProps(props, child.props), ref: refs });
}

/**
 * Draws a part: its own `tag`, or with `asChild` the game's element through `Slot`. `props` are already merged
 * (`mergeProps`) with the ref composed.
 */
export function renderPart(tag: ElementType, asChild: boolean | undefined, props: Record<string, unknown>) {
  if (asChild) return <Slot {...props} />;
  const Tag = tag;
  return <Tag {...props} />;
}

/** Every part that can hand its behaviour to the game's own element takes this. */
export interface AsChild {
  /** Render the one child element instead of the part's own, with the part's props merged onto it (`Slot`). */
  asChild?: boolean;
}
