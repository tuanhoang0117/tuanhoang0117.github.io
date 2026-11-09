import type { SpriteDef } from "../types";

/**
 * The secret rare token (issue #95): a unicorn mustang in side view, facing right like
 * `horse-trot`, but with a white coat, a striped gold horn, and a rainbow mane and tail drawn
 * from the palette's accent tokens. 16×16 so it shares the falling tokens' frame size.
 *
 * Frame 1 lifts the front hoof and puts a gold sparkle beside the horn.
 */
const body = [
  "........kkkgkk..",
  ".......krkwwwwk.",
  "......krykwkwwwk",
  "......krydwwwwwk",
  ".....kydswwwkkk.",
  ".....kdscwwk....",
  ".kkkkkscwwwkkk..",
  "krkwwwwwwwwwwk..",
  "kykwwwwwwwwwwk..",
  "kdkwwwwwwwwwwk..",
  "kskkkwkkkkkwkk..",
];

export const secretUnicorn: SpriteDef = {
  name: "secret-unicorn",
  palette: {
    k: "var(--color-ink)",
    w: "var(--color-card)",
    g: "var(--color-gold)",
    h: "var(--color-gold-bright)",
    r: "var(--color-heritage)",
    y: "var(--color-canyon)",
    d: "var(--color-dexter)",
    s: "var(--color-surf)",
    c: "var(--color-cove)",
  },
  frames: [
    [
      "...........k....",
      "..........kgk...",
      "..........khk...",
      ...body,
      "kck.kwk...kwk...",
      ".k..kgk...kgk...",
    ],
    [
      "...........k..g.",
      "..........kgkggg",
      "..........khk.g.",
      ...body,
      "kck.kwk...kgk...",
      ".k..kgk...kkk...",
    ],
  ],
  fps: 4,
};
