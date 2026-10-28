import type { Glyph } from "../../content/types";

/**
 * The only place a category glyph maps to its character and color token
 * (docs/design-system.md, rule 6). Full class names, so Tailwind can see them.
 */
export const glyphs: Record<Glyph, { char: string; color: string }> = {
  square: { char: "■", color: "text-glyph-blue" },
  circle: { char: "●", color: "text-glyph-red" },
  diamond: { char: "◆", color: "text-glyph-purple" },
  triangle: { char: "▲", color: "text-glyph-orange" },
  plus: { char: "✚", color: "text-poly-bright" },
};
