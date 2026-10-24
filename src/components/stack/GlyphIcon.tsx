import type { Glyph } from "../../content/types";
import { glyphs } from "./glyphs";

/** Decorative: the category label next to it carries the meaning. */
export function GlyphIcon({ glyph }: { glyph: Glyph }) {
  const { char, color } = glyphs[glyph];
  return (
    <span aria-hidden="true" data-glyph={glyph} className={color}>
      {char}
    </span>
  );
}
