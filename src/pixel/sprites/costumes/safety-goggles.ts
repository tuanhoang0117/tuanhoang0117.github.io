import { mustyIdle } from "../musty-idle";
import { dress } from "./dress";

/** Lab safety goggles over the eye: a chunky Morro Cove frame and strap, a pale lens. */
export const mustySafetyGoggles = dress(mustyIdle, {
  name: "safety-goggles",
  palette: { k: "var(--color-ink)", f: "var(--color-cove)", l: "var(--color-serenity)" },
  overlay: [
    "................",
    "................",
    "................",
    "................",
    ".....ffffff.....",
    "..ffffllklf.....",
    "..ffffllllf.....",
    ".....ffffff.....",
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
