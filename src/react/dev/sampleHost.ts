// The mix desk's `SampleHost` in a browser: it talks to the handler `watchpot/sound/pack`'s `sampleHost` mounts in a
// game's dev server. The wire is described at the top of `src/sound/pack/host.ts`; nothing of the pack pipeline is
// imported here.
import type { SampleEntry, SampleHost, SampleResult, SampleSource } from "../../sound/desk";

export type FetchSampleHostOptions = {
  /** The fetch to use (default the page's). */
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
};

/** Throws the host's own message for an answer that failed. */
async function check(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  let message = `${res.status} ${res.statusText}`.trim();
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") message = body.error;
  } catch {
    // Not JSON: the status says it.
  }
  throw new Error(`sample host ${what}: ${message}`);
}

async function audioOf(form: FormData, field: string): Promise<ArrayBuffer> {
  const part = form.get(field);
  if (part === null || typeof part === "string") throw new Error(`sample host: the answer has no ${field}`);
  return part.arrayBuffer();
}

function metaOf<T>(form: FormData): T {
  const meta = form.get("meta");
  if (typeof meta !== "string") throw new Error("sample host: the answer has no meta");
  return JSON.parse(meta) as T;
}

/**
 * The `SampleHost` a game's dev server serves at `url` (where it mounted `sampleHost`, say `"/__samples"`): give it to
 * `openSoundDesk({ samples })`.
 */
export function fetchSampleHost(url: string, options: FetchSampleHostOptions = {}): SampleHost {
  const base = url.replace(/\/+$/, "");
  const go = (path: string, init?: RequestInit) => (options.fetch ?? fetch)(`${base}/${path}`, init);
  const postJson = (path: string, body: unknown) =>
    go(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  return {
    async process(request) {
      const { file, ...rest } = request;
      const fileName = rest.fileName ?? (file && "name" in file ? (file as File).name : undefined);
      const form = new FormData();
      form.set("request", JSON.stringify({ ...rest, ...(fileName ? { fileName } : {}) }));
      if (file) form.set("file", file, fileName ?? "recording");
      const res = await check(await go("process", { method: "POST", body: form }), "process");
      const answer = await res.formData();
      const meta = metaOf<{ token: string; entry: SampleEntry }>(answer);
      return { token: meta.token, entry: meta.entry, audio: await audioOf(answer, "audio") };
    },

    async describe(pack, sample) {
      const q = new URLSearchParams({ pack, sample });
      const res = await check(await go(`describe?${q}`), "describe");
      const answer = await res.formData();
      return { ...metaOf<SampleSource>(answer), audio: await audioOf(answer, "audio") };
    },

    async commit(tokens) {
      await check(await postJson("commit", { tokens }), "commit");
    },

    async retune(pack, to) {
      const res = await check(await postJson("retune", { pack, ...to }), "retune");
      const answer = await res.formData();
      const meta = metaOf<{ sample: string; token: string; entry: SampleEntry }[]>(answer);
      return Promise.all(
        meta.map(
          async (m, i): Promise<SampleResult & { sample: string }> => ({
            ...m,
            audio: await audioOf(answer, `audio.${i}`),
          }),
        ),
      );
    },
  };
}
