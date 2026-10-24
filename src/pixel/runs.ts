import { TRANSPARENT, type Frame, type Palette, type PixelRun } from "./types";
import { pixelsOf } from "./validate";

/**
 * Turns a frame into horizontal runs, one per stretch of same-colored pixels in a row. Runs merge
 * by color, not by key, so two keys that map to the same color share a rect. Transparent pixels
 * are skipped, and so is any character missing from the palette (validateSprite reports those).
 */
export function toRuns(frame: Frame, palette: Palette): PixelRun[] {
  const runs: PixelRun[] = [];
  frame.forEach((row, y) => {
    let current: PixelRun | undefined;
    pixelsOf(row).forEach((ch, x) => {
      const color = ch !== TRANSPARENT && Object.hasOwn(palette, ch) ? palette[ch] : undefined;
      if (color === undefined) {
        current = undefined;
      } else if (current && current.color === color) {
        current.width += 1;
      } else {
        current = { x, y, width: 1, color };
        runs.push(current);
      }
    });
  });
  return runs;
}
