import { type ElementType, type ReactElement, type ReactNode, type Ref, type RefCallback, type RefObject, type SyntheticEvent } from "react";
/**
 * A part's ref, for a game that draws the element itself. It is a callback ref, so `ref={part.ref}` and a spread of
 * the part's props fit any element; it also holds the node as `current`, so a game keeping a ref of its own on the
 * same element can set `part.ref.current = node` from that ref's callback instead.
 */
export type PartRef = ((node: HTMLElement | null) => void) & {
    current: HTMLElement | null;
};
/** A `PartRef` over the ref a primitive keeps for itself: the same one for the component's life. */
export declare function usePartRef(inner: RefObject<HTMLElement | null>): PartRef;
/** Sets every ref to the node; the returned callback's cleanup clears them (React 19 ref cleanup). */
export declare function composeRefs<T>(...refs: readonly (Ref<T> | undefined)[]): RefCallback<T>;
/** `composeRefs` held stable while the refs are the same, so React does not detach and reattach every render. */
export declare function useComposedRefs<T>(...refs: readonly (Ref<T> | undefined)[]): RefCallback<T>;
/**
 * Runs the game's handler, then the part's own unless the game's called `preventDefault`: a game cancels a part's
 * behaviour the way it cancels the browser's.
 */
export declare function chain<E extends SyntheticEvent>(theirs: ((event: E) => void) | undefined, ours: ((event: E) => void) | undefined): ((event: E) => void) | undefined;
/**
 * Merges a part's props (`ours`) under a game element's (`theirs`): handlers chain (theirs first), classes join,
 * styles merge (theirs win), everything else is theirs where given. Refs are not merged here.
 */
export declare function mergeProps(ours: object, theirs: object): Record<string, unknown>;
/** Props of `Slot`: the props to land on its one child element, and that child. */
export interface SlotProps extends Record<string, unknown> {
    children?: ReactNode;
    ref?: Ref<unknown>;
}
/**
 * Renders its one child element with these props merged in (`mergeProps`) and both refs set. What a part's
 * `asChild` renders: the game's element takes the part's behaviour, ARIA and data attributes.
 */
export declare function Slot({ children, ref, ...props }: SlotProps): ReactElement | null;
/**
 * Draws a part: its own `tag`, or with `asChild` the game's element through `Slot`. `props` are already merged
 * (`mergeProps`) with the ref composed.
 */
export declare function renderPart(tag: ElementType, asChild: boolean | undefined, props: Record<string, unknown>): import("react").JSX.Element;
/** Every part that can hand its behaviour to the game's own element takes this. */
export interface AsChild {
    /** Render the one child element instead of the part's own, with the part's props merged onto it (`Slot`). */
    asChild?: boolean;
}
