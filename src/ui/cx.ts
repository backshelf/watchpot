/** Joins class names, dropping anything falsy (a missing CSS-module key is `undefined`). */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}
