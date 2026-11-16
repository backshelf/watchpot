// Running an example in the page: the example's modules, already turned into CommonJS-shaped JavaScript (by sucrase,
// at build time or in the code box's worker), evaluated with a `require` that hands out the real engine. The same
// function runs in the build (to draw a page's starting state), on the page and in the worker.

/** An example's modules: each path under `docs/examples/` to its JavaScript, and which one is the page's. */
export interface ModuleSet {
  main: string;
  js: Record<string, string>;
}

/** The packages a page's example may import, by specifier: `watchpot/core` and whatever the page adds. */
export type Externals = Record<string, unknown>;

/** A value a page's control sets, read by the example where its token was. */
export type ParamValue = number | string | boolean;

/** Thrown for a mistake in the reader's code that is not a JavaScript error of its own (a missing import). */
export class RunError extends Error {}

function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function resolve(from: string, spec: string, js: Record<string, string>): string | null {
  const dir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
  const base = normalize(`${dir}/${spec}`);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (candidate in js) return candidate;
  }
  return null;
}

/** The line JavaScript engines add above a `new Function` body, measured once (2 in V8 and SpiderMonkey). */
let fnOffset: number | null = null;
export function functionLineOffset(): number {
  if (fnOffset !== null) return fnOffset;
  try {
    new Function("throw new Error('x')\n//# sourceURL=probe.js")();
  } catch (error) {
    const m = /probe\.js:(\d+)/.exec(String((error as Error).stack ?? ""));
    fnOffset = m ? Number(m[1]) - 1 : 2;
  }
  return fnOffset ?? 2;
}

/** The name a module's frames carry in a stack, so an error can be traced to its line. */
export const sourceUrl = (path: string) => `example:///${path}`;

/**
 * Evaluates `set.main` and what it requires, and returns its exports. `params` answers `__param(name)`, the
 * placeholder a page's control put where its token was. `loaded`, when given, collects every module's exports by
 * path (a page reading a helper from a file its game imports).
 */
export function runModules(
  set: ModuleSet,
  externals: Externals,
  params: Record<string, ParamValue> = {},
  loaded: Record<string, Record<string, unknown>> = {},
): Record<string, unknown> {
  const done = new Map<string, Record<string, unknown>>();
  const param = (name: string) => {
    if (!(name in params)) throw new RunError(`the page has no control called "${name}"`);
    return params[name];
  };
  const load = (path: string): Record<string, unknown> => {
    const hit = done.get(path);
    if (hit) return hit;
    const exports: Record<string, unknown> = {};
    const module = { exports };
    done.set(path, exports);
    const require = (spec: string): unknown => {
      if (spec in externals) return externals[spec];
      if (spec.startsWith(".")) {
        const found = resolve(path, spec, set.js);
        if (found) return load(found);
      }
      throw new RunError(
        `this page cannot import "${spec}": only ${Object.keys(externals).join(", ")} is here`,
      );
    };
    const code = `${set.js[path] ?? ""}\n//# sourceURL=${sourceUrl(path)}`;
    new Function("require", "exports", "module", "__param", code)(require, exports, module, param);
    done.set(path, module.exports);
    loaded[path] = module.exports;
    return module.exports;
  };
  if (!(set.main in set.js)) throw new RunError(`no module ${set.main}`);
  return load(set.main);
}
