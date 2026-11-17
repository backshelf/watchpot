/** The layers of a `derived` block as one record; throws on a name given in two layers. */
export function flatDerived(given: unknown): Readonly<Record<string, (state: never) => unknown>> {
  type Block = Record<string, (state: never) => unknown>;
  if (!Array.isArray(given)) return (given ?? {}) as Block;
  const out: Block = {};
  for (const layer of given as readonly (Block | undefined)[])
    for (const [name, fn] of Object.entries(layer ?? {})) {
      if (name in out)
        throw new Error(
          `a derived value "${name}" is declared in two layers of the \`derived\` block: rename one, or fold the two into one layer`,
        );
      out[name] = fn;
    }
  return out;
}

/** A feature's `derived` block: each value as a function of the state `In` (its saved slice and its reach). */
export type DerivedDef<In, Dv> = { readonly [P in keyof Dv]: (state: In) => Dv[P] };

/**
 * A `derived` block in layers: one block, or up to four in a list, each seeing the values of the blocks before it
 * on the feature's own slice.
 */
export type DerivedLayers<K extends string, S, Reached, D1, D2, D3, D4> =
  | DerivedDef<Record<K, S> & Reached, D1>
  | readonly [
      DerivedDef<Record<K, S> & Reached, D1>,
      DerivedDef<Record<K, S & D1> & Reached, D2>?,
      DerivedDef<Record<K, S & D1 & D2> & Reached, D3>?,
      DerivedDef<Record<K, S & D1 & D2 & D3> & Reached, D4>?,
    ];
