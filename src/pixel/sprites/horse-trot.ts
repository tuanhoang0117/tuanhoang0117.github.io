import type { SpriteDef } from "../types";

/**
 * PLACEHOLDER ART. A generic four-legged horse in side view, facing right, for the falling tokens
 * (owner request, 2026-10-28). Mustang Gold coat, Poly Green mane and tail.
 *
 * Frame 1 lifts a diagonal pair of legs (back left, front right), so the two frames read as a trot.
 */
const body = [
  "................",
  "..........kk....",
  ".........kbbkk..",
  "........kmbkbbbk",
  "........kmbbbbbk",
  "........kmmbkkk.",
  ".......kmmbbk...",
  ".kkkkkkmmbbk....",
  "kmmbbbbbbbbbbk..",
  "kmkbbbbbbbbbbk..",
  "kmkbbbbbbbbbbk..",
  "k.kbkbkkkbkbkk..",
];

export const horseTrot: SpriteDef = {
  name: "horse-trot",
  palette: {
    k: "var(--color-ink)",
    b: "var(--color-gold)",
    m: "var(--color-poly)",
  },
  frames: [
    [...body, "..kbkbk.kbkbk...", "..kbkbk.kbkbk...", "..kbkbk.kbkbk...", "..kkkkk.kkkkk..."],
    [...body, "..kbkbk.kbkbk...", "..kbkbk.kbkbk...", "..kkkbk.kbkkk...", "....kkk.kkk....."],
  ],
  fps: 4,
};
