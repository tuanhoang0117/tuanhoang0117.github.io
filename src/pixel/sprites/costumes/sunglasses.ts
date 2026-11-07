import { mustyIdle } from "../musty-idle";
import { dress } from "./dress";

/** Black shades with a white glint on each lens. */
export const mustySunglasses = dress(mustyIdle, {
  name: "sunglasses",
  palette: { k: "var(--color-ink)", w: "var(--color-card)" },
  overlay: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "..kkkkkkkkkkk...",
    ".....kwkk.kwk...",
    "......kk...k....",
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
