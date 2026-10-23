/**
 * Sprite contract. The pixel engine, scenes, and art conversion script all build against these
 * types. Spec and rules: docs/contracts/sprite-format.md. Changing this file is a contract
 * change and needs its own issue.
 */

/** Reserved palette key meaning "no pixel here". */
export const TRANSPARENT = ".";

/**
 * Maps a single-character key to a color. Values are CSS colors, preferably design token
 * references like "var(--color-poly)". The key "." is reserved for transparency and must not
 * appear here.
 */
export type Palette = Record<string, string>;

/** One frame: an array of equal-length rows, one character per pixel. */
export type Frame = readonly string[];

export interface SpriteDef {
  /** Unique, kebab-case, e.g. "musty-idle". */
  name: string;
  palette: Palette;
  /** One or more frames, all with identical dimensions. */
  frames: readonly Frame[];
  /** Playback rate for multi-frame sprites. Ignored for single-frame sprites. */
  fps?: number;
}

/** A merged run of same-colored pixels in one row, ready to render as one SVG <rect>. */
export interface PixelRun {
  x: number;
  y: number;
  width: number;
  color: string;
}
