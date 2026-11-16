// The theme compiler: a game's tokens.json into the tokens.css laid out the way the Design System page compiles it.
// A design-time tool (not in the kit barrel): a game calls it from a three-line script.

type ColorToken = { name: string; value: string | Record<string, string>; usage?: string };
type Style = {
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
type Font = { family: string; file: string; weight?: string; style?: string; stretch?: string };

export type BuildTokensOptions = {
  /** The game's tokens.json. */
  tokens: string;
  /** The css file to write. */
  out: string;
  /** The folder the @font-face urls read the fonts from, as the css file sees it (default `fonts`). */
  fontBase?: string;
};

export async function buildTokens(opts: BuildTokensOptions): Promise<void> {
  const tokens = await Bun.file(opts.tokens).json();
  const fontBase = opts.fontBase ?? "fonts";
  const esc = (n: string) => n.replace(/\./g, "\\.");
  const themes: { id: string; skin?: Record<string, string> }[] = tokens.color.themes;
  const first = themes[0]?.id ?? "";
  const val = (t: ColorToken, theme: string) =>
    typeof t.value === "string" ? t.value : (t.value[theme] ?? t.value[first] ?? "");
  const cssVal = (v: string) => (/^\{.+\}$/.test(v) ? `var(--${v.slice(1, -1)})` : v);
  // A theme's (or a scheme's theme block's) `skin` maps a token to a custom property the game writes at runtime (the
  // colours of a scope the player customises): the token reads it, with its own value as the fallback.
  const skinned = (skin: Record<string, string> | undefined, name: string, v: string) =>
    skin?.[name] ? `var(--${skin[name]}, ${v})` : v;

  const lines: string[] = [`/* ${tokens.name} — generated from tokens.json */`];

  const perTheme = (theme: string) => {
    const rows: string[] = [];
    const skin = themes.find((t) => t.id === theme)?.skin;
    for (const t of tokens.color.tokens as ColorToken[])
      rows.push(`  --${esc(t.name)}: ${skinned(skin, t.name, cssVal(val(t, theme)))};`);
    for (const t of (tokens.shadow?.tokens ?? []) as ColorToken[])
      rows.push(`  --${esc(t.name)}: ${val(t, theme)};`);
    return rows;
  };
  lines.push(`:root, [data-theme="${first}"] {`, ...perTheme(first), "}");
  for (const th of themes.slice(1)) lines.push(`[data-theme="${th.id}"] {`, ...perTheme(th.id), "}");

  // The schemes, chosen by `data-scheme` on <html> (Settings > Appearance). One choice drives both worlds: a scheme's
  // own `tokens` lay over the first theme (the game's) and each of its `themes` over that theme (any other scope the
  // game themes). The first theme's block reaches every game scope, one inside another theme's scope included (a
  // page painting in while <html> still names the other theme). Its `:where()` keeps it at one
  // attribute's weight, so it wins over the theme block by order alone; <html> itself (the shell sets its
  // `data-theme`) needs the weight to pass `:root`. A world block sets only the signal. Another theme's block carries
  // the full weight, so its `color-scheme` passes the one the foundations declare on that theme.
  type SchemeBlock = { tokens: Record<string, string>; colorScheme?: string; skin?: Record<string, string> };
  const shadowNames = new Set(((tokens.shadow?.tokens ?? []) as ColorToken[]).map((t) => t.name));
  const schemes: Record<string, SchemeBlock & { themes?: Record<string, SchemeBlock> }> =
    tokens.color.schemes ?? {};
  const colorNames = new Set((tokens.color.tokens as ColorToken[]).map((t) => t.name));
  const schemeRows = (id: string, block: SchemeBlock) => {
    const rows: string[] = [];
    for (const [name, value] of Object.entries(block.tokens)) {
      if (!colorNames.has(name) && !shadowNames.has(name))
        throw new Error(`scheme ${id} overrides unknown token ${name}`);
      rows.push(`  --${esc(name)}: ${skinned(block.skin, name, cssVal(value))};`);
    }
    if (block.colorScheme) rows.push(`  color-scheme: ${block.colorScheme};`);
    return rows;
  };
  for (const [id, scheme] of Object.entries(schemes)) {
    lines.push(
      `:where(html[data-scheme="${id}"]) [data-theme="${first}"], html[data-scheme="${id}"][data-theme="${first}"] {`,
      ...schemeRows(id, scheme),
      "}",
    );
    for (const [theme, block] of Object.entries(scheme.themes ?? {})) {
      if (!themes.some((t) => t.id === theme)) throw new Error(`scheme ${id} darkens unknown theme ${theme}`);
      lines.push(
        `html[data-scheme="${id}"] [data-theme="${theme}"], html[data-scheme="${id}"][data-theme="${theme}"] {`,
        ...schemeRows(`${id}/${theme}`, block),
        "}",
      );
    }
  }

  // The worlds: each an overlay on the first theme, keyed by the page root's `data-world`, overriding only the
  // tokens it lists. Anything not listed falls through to the theme block above.
  const known = new Set((tokens.color.tokens as ColorToken[]).map((t) => t.name));
  const worlds: Record<string, { tokens: Record<string, string> }> = tokens.color.worlds ?? {};
  for (const [id, world] of Object.entries(worlds)) {
    lines.push(`[data-theme="${first}"][data-world="${id}"] {`);
    for (const [name, value] of Object.entries(world.tokens)) {
      if (!known.has(name)) throw new Error(`world ${id} overrides unknown token ${name}`);
      lines.push(`  --${esc(name)}: ${cssVal(value)};`);
    }
    lines.push("}");
  }

  // The moments: an overlay a screen asks for by attribute (`data-dark` on a reveal's root), over the first theme.
  const moments: Record<string, { tokens: Record<string, string> }> = tokens.color.moments ?? {};
  for (const [id, moment] of Object.entries(moments)) {
    lines.push(`[data-theme="${first}"][data-${id}], [data-theme="${first}"] [data-${id}] {`);
    for (const [name, value] of Object.entries(moment.tokens)) {
      if (!known.has(name)) throw new Error(`moment ${id} overrides unknown token ${name}`);
      lines.push(`  --${esc(name)}: ${cssVal(value)};`);
    }
    lines.push("}");
  }

  const rootRows: string[] = [];
  for (const fam of ["spacing", "grid", "radius"]) {
    for (const t of (tokens[fam]?.tokens ?? []) as ColorToken[])
      rootRows.push(`  --${esc(t.name)}: ${t.value};`);
  }
  for (const [k, v] of Object.entries(tokens.type.families as Record<string, string>))
    rootRows.push(`  --font-${k}: ${v};`);
  lines.push(":root {", ...rootRows, "}");

  /** `font-variation-settings` from the optical size and any extra axes; empty when a style sets neither. */
  function variationSettings(s: Style): string {
    const axes = [s.opticalSize !== undefined ? `"opsz" ${s.opticalSize}` : "", s.fontVariation ?? ""].filter(
      Boolean,
    );
    return axes.length ? `font-variation-settings: ${axes.join(", ")}` : "";
  }

  for (const g of tokens.type.groups) {
    for (const s of g.styles as Style[]) {
      const fam = s.family ?? g.family;
      const decl = [
        `font-family: var(--font-${fam})`,
        `font-size: ${s.fontSize}`,
        s.lineHeight !== undefined ? `line-height: ${s.lineHeight}` : "",
        s.fontWeight !== undefined ? `font-weight: ${s.fontWeight}` : "",
        s.fontStyle ? `font-style: ${s.fontStyle}` : "",
        s.letterSpacing ? `letter-spacing: ${s.letterSpacing}` : "",
        s.textTransform ? `text-transform: ${s.textTransform}` : "",
        variationSettings(s),
      ].filter(Boolean);
      lines.push(`.${esc(s.name)} { ${decl.join("; ")}; }`);
    }
  }

  for (const f of (tokens.type.fonts ?? []) as Font[]) {
    const file = f.file.replace(/^fonts\//, `${fontBase}/`);
    // A width axis declared here lets `font-stretch` drive it; without the range a browser ignores the property.
    const stretch = f.stretch ? ` font-stretch: ${f.stretch};` : "";
    lines.push(
      `@font-face { font-family: "${f.family}"; src: url("${file}") format("woff2"); font-weight: ${f.weight ?? "400"}; font-style: ${f.style ?? "normal"};${stretch} font-display: swap; }`,
    );
  }

  await Bun.write(opts.out, `${lines.join("\n")}\n`);
  console.log(`wrote ${opts.out} (${lines.length} lines)`);
}
