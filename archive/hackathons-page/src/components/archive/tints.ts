import type { Tint } from "../../content/types";

interface TintStyle {
  /** Column wash. */
  column: string;
  /** Solid offset block behind the event image. */
  accentBg: string;
  /** Same accent as a text color, for currentColor fills (the pixel placeholder). */
  accentText: string;
}

// The one place a tint maps to its accent. Full class names, so Tailwind can see them.
export const tintStyles: Record<Tint, TintStyle> = {
  peach: { column: "bg-tint-peach", accentBg: "bg-glyph-orange", accentText: "text-glyph-orange" },
  butter: { column: "bg-tint-butter", accentBg: "bg-gold", accentText: "text-gold" },
  mint: { column: "bg-tint-mint", accentBg: "bg-poly-bright", accentText: "text-poly-bright" },
  sky: { column: "bg-tint-sky", accentBg: "bg-glyph-blue", accentText: "text-glyph-blue" },
  lilac: { column: "bg-tint-lilac", accentBg: "bg-glyph-purple", accentText: "text-glyph-purple" },
};
