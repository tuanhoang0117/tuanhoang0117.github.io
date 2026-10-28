/**
 * Pure math for the glyph mascot: how a source raster becomes a grid of glyph cells, and how
 * brightness, the wave, and the pointer ripple pick each cell's glyph and color. No DOM here, so
 * all of it is unit-tested directly.
 */

/** RGBA pixels, row-major, 4 bytes per pixel (the shape of `ImageData`). */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Glyphs ordered from least ink to most. The mascot sits on light paper, so more ink reads as
 * darker: shadowed parts of the source get dense glyphs and highlights get sparse ones.
 */
export const FILL_RAMP = Array.from("·.:-=+*▪■▒▓█");
/** Thin-to-thick strokes for cells on the silhouette's edge, so the outline reads as a line. */
export const OUTLINE_RAMP = Array.from("·¦│┃▌▐█");

/**
 * Color tokens from least ink to most, matched to the same tone as the glyph. Highlights are gold,
 * the body is green, the deepest shadow is Poly Green. Names only: the renderer reads each value
 * from the stylesheet, so the palette lives in one place (src/styles/index.css).
 */
export const COLOR_RAMP = [
  "--color-canyon",
  "--color-gold",
  "--color-poly-bright",
  "--color-poly",
] as const;

/** Below this source alpha (0–255) a cell is empty. */
export const MIN_ALPHA = 24;
/** Opacity levels cells are batched into, so the renderer changes `globalAlpha` at most this often. */
export const ALPHA_LEVELS = 4;

/** Grid spacing and glyph size in CSS pixels, by the mascot's on-screen width. */
export function cellLayout(cssWidth: number): { step: number; font: number } {
  if (cssWidth < 480) return { step: 5, font: 8 };
  if (cssWidth < 800) return { step: 6, font: 9 };
  return { step: 7, font: 10 };
}

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Relative luminance (Rec. 709 weights) of 0–255 channels, as 0–1. */
export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Index into a ramp of `length` entries for a tone in 0–1. Out-of-range tones clamp. */
export function rampIndex(tone: number, length: number): number {
  return Math.min(length - 1, Math.floor(clamp01(tone) * length));
}

/** The glyph for a cell: edge cells use the outline ramp, the rest the fill ramp. */
export function glyphFor(ink: number, edge: boolean): string {
  const ramp = edge ? OUTLINE_RAMP : FILL_RAMP;
  return ramp[rampIndex(ink, ramp.length)]!;
}

/** The color token for a cell's ink amount. */
export function colorFor(ink: number): (typeof COLOR_RAMP)[number] {
  return COLOR_RAMP[rampIndex(ink, COLOR_RAMP.length)]!;
}

/** Which of `ALPHA_LEVELS` opacity batches a source alpha falls in (0 = faintest). */
export function alphaLevel(alpha: number): number {
  return Math.min(ALPHA_LEVELS - 1, Math.floor((alpha / 256) * ALPHA_LEVELS));
}

function alphaAt(raster: Raster, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return 0;
  return raster.data[(y * raster.width + x) * 4 + 3]!;
}

export interface Sample {
  /** Source alpha, 0–255. */
  alpha: number;
  /** Source luminance, 0–1. */
  luminance: number;
  /** True when a neighbor one cell away is empty: the cell sits on the silhouette's edge. */
  edge: boolean;
}

/**
 * Samples the raster at normalized coordinates (0–1). `reach` is the distance to the neighbors
 * checked for the edge test, in the same units (one grid cell, so the outline is one cell thick).
 * Returns null for empty or out-of-bounds cells.
 */
export function sampleAt(raster: Raster, u: number, v: number, reach: number): Sample | null {
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return null;
  const x = Math.floor(u * raster.width);
  const y = Math.floor(v * raster.height);
  const i = (y * raster.width + x) * 4;
  const alpha = raster.data[i + 3]!;
  if (alpha < MIN_ALPHA) return null;
  const dx = Math.max(1, Math.round(reach * raster.width));
  const dy = Math.max(1, Math.round(reach * raster.height));
  const edge =
    alphaAt(raster, x - dx, y) < MIN_ALPHA ||
    alphaAt(raster, x + dx, y) < MIN_ALPHA ||
    alphaAt(raster, x, y - dy) < MIN_ALPHA ||
    alphaAt(raster, x, y + dy) < MIN_ALPHA;
  return {
    alpha,
    luminance: luminance(raster.data[i]!, raster.data[i + 1]!, raster.data[i + 2]!),
    edge,
  };
}

/** Radius of the pointer ripple, as a fraction of the mascot's width. */
export const RIPPLE_RADIUS = 0.24;

/** How strongly the pointer affects a cell `distance` away: 1 under it, easing to 0 at the radius. */
export function rippleInfluence(distance: number): number {
  if (distance >= RIPPLE_RADIUS) return 0;
  const t = 1 - (distance / RIPPLE_RADIUS) ** 2;
  return t * t;
}

export interface Motion {
  /** Animation clock in seconds. */
  time: number;
  /** Smoothed pointer position, normalized to the canvas (0–1). */
  pointerX: number;
  pointerY: number;
  /** Recent pointer speed, 0–1. Zero means no ripple. */
  energy: number;
}

/** A still frame: no clock, pointer centered, no ripple. Used for reduced motion. */
export const STILL: Motion = { time: 0, pointerX: 0.5, pointerY: 0.5, energy: 0 };

/**
 * The ink amount (0–1) for a cell. Mostly the source's darkness, so the shading reads as depth,
 * plus a slow diagonal wave, a ring rippling outward from the pointer, and a lift near it.
 * `x` and `y` are the cell's position normalized to the canvas.
 */
export function inkTone(lum: number, x: number, y: number, motion: Motion): number {
  const base = 1 - lum;
  const wave = motion.time === 0 ? 0 : Math.sin((x + y) * 7 - motion.time * 1.3) * 0.5;
  const distance = Math.hypot(x - motion.pointerX, y - motion.pointerY);
  const influence = rippleInfluence(distance) * motion.energy;
  const ripple = influence === 0 ? 0 : Math.sin(distance * 34 - motion.time * 6) * influence;
  return clamp01(base * 0.86 + 0.07 + wave * 0.1 + ripple * 0.22 - influence * 0.14);
}

/** Pointer smoothing per 60 fps frame: how far the drawn pointer moves toward the real one. */
export const POINTER_EASE = 0.2;
/** Energy kept per 60 fps frame, so the ripple fades about a second after the pointer stops. */
export const ENERGY_DECAY = 0.93;
/** Maximum source offset from parallax, as a fraction of the mascot, at the canvas edge. */
export const PARALLAX = 0.016;

/**
 * Advances pointer smoothing and ripple energy by `frames` 60 fps frames (fractional at other
 * rates), so the motion feels the same at 30 fps and at 120 fps.
 */
export function stepMotion(
  motion: Motion,
  targetX: number,
  targetY: number,
  seconds: number,
): Motion {
  const frames = seconds * 60;
  const ease = 1 - (1 - POINTER_EASE) ** frames;
  const pointerX = motion.pointerX + (targetX - motion.pointerX) * ease;
  const pointerY = motion.pointerY + (targetY - motion.pointerY) * ease;
  const moved = Math.hypot(pointerX - motion.pointerX, pointerY - motion.pointerY);
  const energy = Math.min(1, motion.energy * ENERGY_DECAY ** frames + moved * 10);
  return { time: motion.time + seconds, pointerX, pointerY, energy };
}
