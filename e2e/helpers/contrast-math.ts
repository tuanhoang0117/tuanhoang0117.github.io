/**
 * The arithmetic behind the contrast check: parsing the colors a browser reports, blending
 * semi-transparent colors, and the WCAG contrast ratio. Pure functions with no browser in them,
 * so e2e/helpers/contrast-math.spec.ts can test them directly.
 */

export interface Rgba {
  /** Channels are 0-255. */
  r: number;
  g: number;
  b: number;
  /** Alpha is 0-1. */
  a: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Parses a computed CSS color. Chrome reports `rgb(r, g, b)`, `rgba(r, g, b, a)`, the space
 * syntax `rgb(r g b / a)`, and `color(srgb r g b / a)` for mixed colors. Anything else returns
 * null, so the caller can fail loudly instead of treating an unknown color as passing.
 */
export function parseCssColor(value: string): Rgba | null {
  const text = value.trim().toLowerCase();
  if (text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  const rgb = /^rgba?\(\s*([^)]+)\)$/.exec(text);
  const srgb = /^color\(\s*srgb\s+([^)]+)\)$/.exec(text);
  const body = rgb?.[1] ?? srgb?.[1];
  if (body === undefined) return null;

  const [channels = "", alphaPart] = body.split("/");
  const parts = channels.split(/[\s,]+/).filter(Boolean);
  // The comma syntax puts alpha as a fourth value instead of after a slash.
  const alphaText = alphaPart?.trim() ?? (parts.length === 4 ? parts[3] : undefined);
  if (parts.length < 3) return null;

  // color(srgb ...) channels are 0-1; rgb() channels are 0-255 (or percentages).
  const toChannel = (part: string): number => {
    if (part.endsWith("%")) return (Number.parseFloat(part) / 100) * 255;
    const n = Number.parseFloat(part);
    return srgb ? n * 255 : n;
  };
  const [r, g, b] = parts.slice(0, 3).map(toChannel) as [number, number, number];
  let a = 1;
  if (alphaText !== undefined) {
    a = alphaText.endsWith("%") ? Number.parseFloat(alphaText) / 100 : Number.parseFloat(alphaText);
  }
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
  return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(a, 0, 1) };
}

/** `top` laid over an opaque `bottom`. Returns an opaque color. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, b: number) => t * top.a + b * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

/** Relative luminance as WCAG 2.x defines it, 0 (black) to 1 (white). */
export function relativeLuminance({ r, g, b }: Rgba): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two opaque colors, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG "large text": 24px and up, or 18.66px (14pt) and up when bold. */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

/** The ratio text needs: 3:1 for large text, 4.5:1 for everything else. */
export function requiredRatio(fontSizePx: number, fontWeight: number): number {
  return isLargeText(fontSizePx, fontWeight) ? 3 : 4.5;
}

/**
 * The background text sits on. `layers` are the non-transparent background colors from the text's
 * element up to the root, nearest first. Layers are stacked until one is fully opaque; if none
 * is, the stack sits on `fallback` (the page's paper color).
 */
export function effectiveBackground(layers: Rgba[], fallback: Rgba): Rgba {
  const stack: Rgba[] = [];
  let base = fallback;
  for (const layer of layers) {
    if (layer.a >= 1) {
      base = layer;
      break;
    }
    stack.push(layer);
  }
  // `stack` is nearest first, so paint it from the farthest layer to the nearest.
  return stack.reduceRight((under, layer) => composite(layer, under), { ...base, a: 1 });
}

/** The text color as it reaches the screen: its own alpha times the opacity of its element chain. */
export function effectiveText(color: Rgba, opacity: number, background: Rgba): Rgba {
  return composite({ ...color, a: clamp(color.a * opacity, 0, 1) }, background);
}

/** `#rrggbb` for messages, so a failure shows colors a person can look up. */
export function toHex({ r, g, b }: Rgba): string {
  const part = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}
