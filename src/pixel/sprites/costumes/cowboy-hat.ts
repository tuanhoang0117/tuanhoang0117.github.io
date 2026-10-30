import { mustyIdle } from "../musty-idle";
import { dress } from "./dress";

/** A Mustang Gold cowboy hat with a Heritage Orange band. The brim sits just above the eye. */
export const mustyCowboyHat = dress(mustyIdle, {
  name: "cowboy-hat",
  palette: { k: "var(--color-ink)", h: "var(--color-gold)", r: "var(--color-heritage)" },
  overlay: [
    ".....kkkkkk.....",
    "....khhkhhhk....",
    ".k..krrrrrrk..k.",
    ".khhhhhhhhhhhhk.",
    "..kkkkkkkkkkkk..",
    "................",
    "................",
    "................",
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
