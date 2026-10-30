import { mustyIdle } from "../musty-idle";
import { dress } from "./dress";

/** Over-ear headphones: a band over the top of the head and Heritage Orange cups. */
export const mustyHeadphones = dress(mustyIdle, {
  name: "headphones",
  palette: { k: "var(--color-ink)", p: "var(--color-heritage)", h: "var(--color-seal)" },
  overlay: [
    "....kkkkkkk.....",
    "...khhhhhhhk....",
    "...kk.....kk....",
    "..kkkk....kpk...",
    ".kppppk...kpk...",
    ".kppppk...kk....",
    ".kppppk.........",
    "..kkkk..........",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
});
