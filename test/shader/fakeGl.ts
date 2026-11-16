import { spyOn } from "bun:test";

/** One uniform call: the location's name, the setter's suffix (`1f`, `4f`, `1fv`) and its numbers. */
export interface UniformCall {
  name: string;
  kind: string;
  values: number[];
}

/**
 * A WebGL2 stand-in that records what matters: programs made, draws, uniforms set, shaders' sources. Upper-case names
 * are constants (a number each); any other unknown call is a no-op. `status` holds the driver's answers.
 */
export function fakeGl() {
  const status = { compile: true, link: true, log: "ERROR: 0:12: 'nope' : undeclared identifier" };
  const counts = { programs: 0, draws: 0, deletes: 0, webgl2: 0 };
  const uniforms: UniformCall[] = [];
  const sources: string[] = [];
  const constants = new Map<string, number>();
  const kinds = new WeakMap<object, unknown>();
  let gl: Record<string, unknown> = {};

  const overrides: Record<string, unknown> = {
    createShader: (type: unknown) => {
      const sh = {};
      kinds.set(sh, type);
      return sh;
    },
    shaderSource: (_sh: object, src: string) => sources.push(src),
    getShaderParameter: (sh: object) => kinds.get(sh) !== gl.FRAGMENT_SHADER || status.compile,
    getShaderInfoLog: () => status.log,
    createProgram: () => {
      counts.programs++;
      return {};
    },
    getProgramParameter: () => status.link,
    getProgramInfoLog: () => status.log,
    deleteProgram: () => {
      counts.deletes++;
    },
    getUniformLocation: (_p: unknown, name: string) => ({ name }),
    drawArrays: () => {
      counts.draws++;
    },
  };

  gl = new Proxy(overrides, {
    get: (target, name) => {
      if (typeof name !== "string") return undefined;
      if (name in target) return target[name];
      if (/^[A-Z_0-9]+$/.test(name)) {
        if (!constants.has(name)) constants.set(name, constants.size + 1);
        return constants.get(name);
      }
      const uniform = /^uniform(\w+)$/.exec(name);
      if (uniform)
        return (loc: { name: string } | null, ...args: unknown[]) => {
          const values = args.flatMap((a) => (a instanceof Float32Array ? Array.from(a) : [Number(a)]));
          uniforms.push({ name: loc?.name ?? "", kind: uniform[1] ?? "", values });
        };
      return () => ({});
    },
  });

  /** The last value set for a uniform, or undefined. */
  const last = (name: string) => uniforms.filter((u) => u.name === name).at(-1)?.values;
  return { gl, status, counts, uniforms, sources, last };
}

/**
 * Installs the fake on every canvas: `webgl2` gets it (or null with `webgl2: false`), `2d` a stub. Returns the
 * recorder and the restore.
 */
export function installFakeGl({ webgl2 = true } = {}) {
  const rec = fakeGl();
  const ctx2d = {
    clearRect: () => {},
    drawImage: () => {},
    fillRect: () => {},
    getImageData: () => ({ data: [] }),
  };
  const spy = spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((kind: string) => {
    if (kind === "webgl2") {
      rec.counts.webgl2++;
      return webgl2 ? rec.gl : null;
    }
    return kind === "2d" ? ctx2d : null;
  }) as unknown as HTMLCanvasElement["getContext"]);
  return { ...rec, restore: () => spy.mockRestore() };
}

/** A manual animation-frame queue in place of the browser's: `flush` runs one frame's callbacks at `now`. */
export function installFrames() {
  let queue = new Map<number, (now: number) => void>();
  let id = 0;
  const raf = spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
    queue.set(++id, cb);
    return id;
  });
  const caf = spyOn(globalThis, "cancelAnimationFrame").mockImplementation((n: number) => {
    queue.delete(n);
  });
  return {
    pending: () => queue.size,
    flush(now: number) {
      const run = queue;
      queue = new Map();
      for (const cb of run.values()) cb(now);
    },
    restore() {
      raf.mockRestore();
      caf.mockRestore();
    },
  };
}
