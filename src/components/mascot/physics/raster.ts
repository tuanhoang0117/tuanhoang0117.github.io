/** A bare RGBA pixel buffer, shaped like ImageData so it can come from or go to a canvas. */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Rotation is drawn in this many steps per turn, like animation frames (design rule 4). */
export const ROTATION_STEPS = 32;

/** The nearest drawable rotation step for an angle in radians, in 0..ROTATION_STEPS-1. */
export function rotationStep(angle: number): number {
  const turn = 2 * Math.PI;
  const normalized = ((angle % turn) + turn) % turn;
  return Math.round((normalized / turn) * ROTATION_STEPS) % ROTATION_STEPS;
}

/**
 * Rotates pixels around their center by nearest-neighbor sampling, so every output pixel is an
 * exact copy of one input pixel: no new colors, no partial alpha. Canvas rotation antialiases
 * the edges of a drawn image even with smoothing off, which this avoids. The output is square,
 * big enough for any angle.
 */
export function rotateNearest(src: Pixels, angle: number, out: Pixels): Pixels {
  const side = out.width;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = src.width / 2;
  const cy = src.height / 2;
  out.data.fill(0);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const dx = x + 0.5 - side / 2;
      const dy = y + 0.5 - side / 2;
      // Inverse rotation: which source pixel lands here?
      const sx = Math.floor(dx * cos + dy * sin + cx);
      const sy = Math.floor(-dx * sin + dy * cos + cy);
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const from = (sy * src.width + sx) * 4;
      const to = (y * side + x) * 4;
      for (let c = 0; c < 4; c++) out.data[to + c] = src.data[from + c]!;
    }
  }
  return out;
}

/**
 * Output side length for rotating a `width` × `height` image to any angle. It has the same
 * parity as `width`, so an unrotated image lands on whole pixels, centered.
 */
export function rotatedSide(width: number, height: number): number {
  const side = Math.ceil(Math.hypot(width, height));
  return (side - width) % 2 === 0 ? side : side + 1;
}
