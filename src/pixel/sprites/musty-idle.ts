import type { SpriteDef } from "../types";

/**
 * PLACEHOLDER ART. A rough stand-in for Musty so the engine and /lab have something to render.
 * Replace with the artist's idle frames once they're converted from PNG.
 *
 * Frame 1 blinks.
 */
export const mustyIdle: SpriteDef = {
  name: "musty-idle",
  palette: {
    k: "var(--color-ink)",
    g: "var(--color-poly)",
    y: "var(--color-gold-bright)",
    w: "var(--color-card)",
  },
  frames: [
    [
      "......kk........",
      ".....kgk..kk....",
      "....kggkkkgk....",
      "...kyggggggk....",
      "..kyygggggggk...",
      "..kyyggwkggggk..",
      ".kyyggkkgggggk..",
      ".kyygggggggggggk",
      ".kyyggggggggkggk",
      "..kyyggggggggggk",
      "..kyygggkkkkkkk.",
      "...kyyggk.......",
      "...kyyggk.......",
      "....kyggk.......",
      "....kgggk.......",
      "....kkkkk.......",
    ],
    [
      "......kk........",
      ".....kgk..kk....",
      "....kggkkkgk....",
      "...kyggggggk....",
      "..kyygggggggk...",
      "..kyyggggggggk..",
      ".kyyggkkgggggk..",
      ".kyygggggggggggk",
      ".kyyggggggggkggk",
      "..kyyggggggggggk",
      "..kyygggkkkkkkk.",
      "...kyyggk.......",
      "...kyyggk.......",
      "....kyggk.......",
      "....kgggk.......",
      "....kkkkk.......",
    ],
  ],
  fps: 2,
};
