// In-world text: words drawn on a canvas and used as a texture (never troika or drei Text, whose materials are
// GLSL and do not draw on the node renderer). A texture is drawn once at once and again when the game's fonts have
// loaded, so the first draw's fallback face never lasts.
import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from "three/webgpu";

/** A typeface as canvas text wants it: style and weight (`"italic 500"`), then the family stack. */
export interface Face {
  readonly style: string;
  readonly family: string;
}

/**
 * A valid CSS font string for `ctx.font`: style and weight, then the size, then the family. (A size in front of the
 * style is invalid CSS, and a canvas silently keeps its previous font.) `weight` overrides the face's own.
 */
export function cssFont(face: Face, px: number, weight?: number): string {
  const style = weight === undefined ? face.style : face.style.replace(/\d+$/, String(weight));
  return `${style} ${px}px ${face.family}`;
}

/**
 * Resolves once every face can draw: each CSS font string (`"italic 500 32px Fraunces"`) loaded at its probe size
 * (the browser has every size after). Never rejects; with no document it resolves at once.
 */
export function fontsReady(faces: readonly string[]): Promise<void> {
  const fonts = (globalThis as { document?: { fonts?: { load(font: string): Promise<unknown> } } }).document
    ?.fonts;
  if (!fonts) return Promise.resolve();
  return Promise.all(faces.map((f) => fonts.load(f)))
    .then(() => undefined)
    .catch(() => undefined);
}

/** What `textTexture` draws. */
export interface TextTextureOptions {
  /** Canvas size in pixels. */
  readonly width: number;
  readonly height: number;
  draw(ctx: CanvasRenderingContext2D): void;
  /** Redraws once this settles: the game's `fontsReady(...)`. */
  readonly ready?: Promise<unknown>;
  /** Default 8. */
  readonly anisotropy?: number;
}

/** A canvas texture drawn by `draw`, in sRGB with mipmaps; redrawn when `ready` settles. */
export function textTexture(opts: TextTextureOptions): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = opts.anisotropy ?? 8;
  redraw(texture, opts.draw);
  if (opts.ready) void opts.ready.then(() => redraw(texture, opts.draw)).catch(() => undefined);
  return texture;
}

/** Clears and redraws a texture made by `textTexture`, and flags it for upload. */
export function redraw(texture: CanvasTexture, draw: (ctx: CanvasRenderingContext2D) => void): void {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  draw(ctx);
  texture.needsUpdate = true;
}
