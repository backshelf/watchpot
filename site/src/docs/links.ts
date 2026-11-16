// Where each source file lands and where each link goes. Pure: the filesystem is behind `exists`.

import { posix } from "node:path";

export interface RepoInfo {
  url: string;
  branch: string;
  public: boolean;
}

/** What is at a repository path, or null when nothing is. */
export type Exists = (repoPath: string) => "file" | "dir" | null;

export interface SiteMap {
  /** Repository path of a rendered markdown page → its output path (relative to the docs output). */
  pages: ReadonlyMap<string, string>;
  /** Repository path of a rendered source file → its output path. */
  sources: ReadonlyMap<string, string>;
}

export interface LinkContext {
  map: SiteMap;
  exists: Exists;
  repo: RepoInfo;
}

/** The output path of a markdown file under `docs/`, given its path relative to `docs/`. */
export function docsPageOut(docsPath: string): string {
  const dir = posix.dirname(docsPath);
  const base = posix.basename(docsPath);
  const name = /^(readme|index)\.md$/i.test(base) ? "index" : base.replace(/\.md$/i, "");
  return dir === "." ? `${name}.html` : `${dir}/${name}.html`;
}

/** A link that is not relative to the repository: a scheme (`https:`, `mailto:`) or a protocol-relative URL. */
function isAbsoluteUrl(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}

function safeDecode(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

export interface RepoTarget {
  /** Normalised repository path, no leading or trailing slash ("" is the root). */
  path: string;
  /** `#anchor` (with the hash) or "". */
  hash: string;
  /** True when the link climbs out of the repository. */
  outside: boolean;
}

/** Resolves a relative link against the repository path of the file it is written in. */
export function resolveRepoPath(href: string, fromRepoPath: string): RepoTarget | null {
  if (href === "" || href.startsWith("#") || isAbsoluteUrl(href)) return null;
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const pathPart = (hashAt >= 0 ? href.slice(0, hashAt) : href).replace(/\?.*$/, "");
  const decoded = safeDecode(pathPart);
  const joined = decoded.startsWith("/")
    ? decoded.slice(1)
    : posix.join(posix.dirname(fromRepoPath), decoded);
  const normal = posix.normalize(joined).replace(/\/+$/, "");
  const path = normal === "." ? "" : normal;
  return { path, hash, outside: path === ".." || path.startsWith("../") };
}

/** The URL of `toOut` from the page at `fromOut` (both relative to the docs output). */
export function relativeUrl(fromOut: string, toOut: string): string {
  const rel = posix.relative(posix.dirname(fromOut), toOut);
  return rel === "" ? posix.basename(toOut) : rel;
}

/** The rendered page or source page a repository path stands for, if any. */
export function renderedTarget(path: string, map: SiteMap): string | null {
  const direct = map.pages.get(path) ?? map.sources.get(path);
  if (direct) return direct;
  const prefix = path === "" ? "" : `${path}/`;
  for (const index of ["README.md", "readme.md", "index.md"]) {
    const out = map.pages.get(`${prefix}${index}`);
    if (out) return out;
  }
  return null;
}

export type ResolvedLink =
  /** Draw an `<a>`; `external` marks an http(s) link that leaves the site. */
  | { kind: "link"; href: string; external: boolean; target?: string }
  /** Not a link: the text names a path in a private repository. */
  | { kind: "path"; target: string }
  /** A relative link to nothing: drawn as plain text, with a warning. */
  | { kind: "missing"; target: string };

export interface LinkSource {
  /** Repository path of the markdown file the link is written in. */
  repoPath: string;
  /** Output path of the page it renders to. */
  outPath: string;
}

/** Decides what a link in a rendered page becomes. */
export function resolveLink(href: string, from: LinkSource, ctx: LinkContext): ResolvedLink {
  if (/^https?:\/\//i.test(href) || href.startsWith("//")) return { kind: "link", href, external: true };
  const target = resolveRepoPath(href, from.repoPath);
  if (!target) return { kind: "link", href, external: false };
  if (target.outside) return { kind: "missing", target: target.path };
  const out = renderedTarget(target.path, ctx.map);
  if (out) {
    const self = out === from.outPath && target.hash !== "";
    return {
      kind: "link",
      href: self ? target.hash : relativeUrl(from.outPath, out) + target.hash,
      external: false,
      target: target.path,
    };
  }
  const what = target.path === "" ? "dir" : ctx.exists(target.path);
  if (!what) return { kind: "missing", target: target.path };
  if (!ctx.repo.public) return { kind: "path", target: target.path };
  const base = ctx.repo.url.replace(/\/+$/, "");
  const mode = what === "dir" ? "tree" : "blob";
  const path = target.path.split("/").map(encodeURIComponent).join("/");
  return {
    kind: "link",
    href: `${base}/${mode}/${ctx.repo.branch}${path ? `/${path}` : ""}${target.hash}`,
    external: true,
    target: target.path,
  };
}
