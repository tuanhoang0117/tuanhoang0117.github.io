import { TRANSPARENT, type Frame, type Palette, type SpriteDef } from "../../types";
import { pixelsOf } from "../../validate";

/**
 * An accessory drawn as a transparent overlay for one base sprite (docs/contracts/sprite-format.md,
 * "Accessories as separate layered sprites"). The overlay is the same size as the base's frames.
 */
export interface Costume {
  /** Kebab-case. The dressed sprite is named `<base>-<costume>`, e.g. "musty-idle-cowboy-hat". */
  name: string;
  /** Colors for the overlay's own keys. A key the base also uses must have the same color. */
  palette: Palette;
  /** One grid laid over every base frame. `.` lets the base show through. */
  overlay: Frame;
}

const sizeOf = (frame: Frame) =>
  `${frame[0] === undefined ? 0 : pixelsOf(frame[0]).length}×${frame.length}`;

/**
 * Composites a costume onto every frame of a base sprite, producing an ordinary SpriteDef: overlay
 * pixels win, `.` stays transparent, and the base's frame rate carries over. Throws on a size
 * mismatch, an overlay key the costume's palette lacks, or a key the two palettes color
 * differently, since any of those would silently draw the wrong picture.
 */
export function dress(base: SpriteDef, costume: Costume): SpriteDef {
  const name = `${base.name}-${costume.name}`;

  for (const [key, color] of Object.entries(costume.palette)) {
    if (Object.hasOwn(base.palette, key) && base.palette[key] !== color) {
      throw new Error(
        `${name}: palette key "${key}" is ${base.palette[key]} in ${base.name} but ${color} in ` +
          `the ${costume.name} costume. Pick another key.`,
      );
    }
  }

  const overlay = costume.overlay.map(pixelsOf);
  for (const row of overlay) {
    for (const ch of row) {
      if (ch !== TRANSPARENT && !Object.hasOwn(costume.palette, ch)) {
        throw new Error(`${name}: overlay uses "${ch}", which isn't in the costume's palette.`);
      }
    }
  }

  const frames = base.frames.map((frame) => {
    const rows = frame.map(pixelsOf);
    const fits =
      rows.length === overlay.length && rows.every((row, y) => row.length === overlay[y]!.length);
    if (!fits) {
      throw new Error(
        `${name}: the overlay is ${sizeOf(costume.overlay)}, but ${base.name} is ${sizeOf(frame)}.`,
      );
    }
    return rows.map((row, y) =>
      row
        .map((pixel, x) => {
          const top = overlay[y]![x]!;
          return top === TRANSPARENT ? pixel : top;
        })
        .join(""),
    );
  });

  return {
    name,
    palette: { ...base.palette, ...costume.palette },
    frames,
    ...(base.fps === undefined ? {} : { fps: base.fps }),
  };
}
