import { mustyIdle } from "../musty-idle";
import { dress } from "./dress";

/** A black mortarboard with a gold tassel hanging over the brow. */
export const mustyGraduationCap = dress(mustyIdle, {
  name: "graduation-cap",
  palette: { k: "var(--color-ink)", s: "var(--color-seal)", t: "var(--color-gold)" },
  overlay: [
    "......kkkk......",
    "..kkssssssskkt..",
    ".....kkkkkk..t..",
    "....kkkkkkkk.t..",
    ".............tt.",
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
