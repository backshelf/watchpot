import { CanvasTexture } from "three/webgpu";
/** A typeface as canvas text wants it: style and weight (`"italic 500"`), then the family stack. */
export interface Face {
    readonly style: string;
    readonly family: string;
}
/**
 * A valid CSS font string for `ctx.font`: style and weight, then the size, then the family. (A size in front of the
 * style is invalid CSS, and a canvas silently keeps its previous font.) `weight` overrides the face's own.
 */
export declare function cssFont(face: Face, px: number, weight?: number): string;
/**
 * Resolves once every face can draw: each CSS font string (`"italic 500 32px Fraunces"`) loaded at its probe size
 * (the browser has every size after). Never rejects; with no document it resolves at once.
 */
export declare function fontsReady(faces: readonly string[]): Promise<void>;
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
export declare function textTexture(opts: TextTextureOptions): CanvasTexture;
/** Clears and redraws a texture made by `textTexture`, and flags it for upload. */
export declare function redraw(texture: CanvasTexture, draw: (ctx: CanvasRenderingContext2D) => void): void;
