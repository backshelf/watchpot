/** A colour, shadow, spacing, grid or radius token: one value, or one per theme id. */
export type ColorToken = {
    name: string;
    value: string | Record<string, string>;
    usage?: string;
};
/** A type style, compiled to a `.name` class. */
export type Style = {
    name: string;
    fontSize: string;
    lineHeight?: number | string;
    fontWeight?: number | string;
    fontStyle?: string;
    letterSpacing?: string;
    opticalSize?: number;
    /** Extra variation axes, appended after the optical size: `"WONK" 1`, `"wdth" 78`. */
    fontVariation?: string;
    /** `uppercase` for the code style; nothing else transforms. */
    textTransform?: string;
    family?: string;
};
/** A woff2 font file, compiled to an `@font-face`. */
export type Font = {
    family: string;
    file: string;
    weight?: string;
    style?: string;
    stretch?: string;
};
/** A scheme's or a scheme theme block's overrides: token name to value (`{other.token}` reads another token). */
export type TokenOverrides = {
    tokens: Record<string, string>;
    colorScheme?: string;
    /** Token name to a custom property the game writes at runtime; the token reads it, its own value the fallback. */
    skin?: Record<string, string>;
};
/** The shape of a game's tokens.json, as `buildTokens` reads it. */
export type TokensFile = {
    /** Named in the generated file's header. */
    name: string;
    color: {
        /** The themes by `data-theme`, the first being the game's own (also `:root`). */
        themes: {
            id: string;
            skin?: Record<string, string>;
        }[];
        tokens: ColorToken[];
        /** By `data-scheme` on <html>: overrides over the first theme, and by `themes` over another theme. */
        schemes?: Record<string, TokenOverrides & {
            themes?: Record<string, TokenOverrides>;
        }>;
        /** By `data-world` on the page root: overrides over the first theme. */
        worlds?: Record<string, {
            tokens: Record<string, string>;
        }>;
        /** By an attribute a screen sets: overrides over the first theme. */
        moments?: Record<string, {
            tokens: Record<string, string>;
        }>;
    };
    shadow?: {
        tokens: ColorToken[];
    };
    spacing?: {
        tokens: ColorToken[];
    };
    grid?: {
        tokens: ColorToken[];
    };
    radius?: {
        tokens: ColorToken[];
    };
    type: {
        /** Family key to a font stack, compiled to `--font-<key>`. */
        families: Record<string, string>;
        groups: {
            family: string;
            styles: Style[];
        }[];
        fonts?: Font[];
    };
};
/** Options for `buildTokens`. */
export type BuildTokensOptions = {
    /** The game's tokens.json. */
    tokens: string;
    /** The css file to write. */
    out: string;
    /** The folder the @font-face urls read the fonts from, as the css file sees it (default `fonts`). */
    fontBase?: string;
};
/** Compiles a game's tokens.json (a `TokensFile`) into its tokens.css. */
export declare function buildTokens(opts: BuildTokensOptions): Promise<void>;
