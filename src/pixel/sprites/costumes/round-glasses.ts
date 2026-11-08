import { mustyIdle } from "../musty-idle";
import { dress } from "./dress";

/** Round gold wire glasses over the eye, the arm running back to the mane. */
export const mustyRoundGlasses = dress(mustyIdle, {
  name: "round-glasses",
  palette: { k: "var(--color-ink)", o: "var(--color-gold)", l: "var(--color-serenity)" },
  overlay: [
    "................",
    "................",
    "................",
    "......ooo.......",
    ".....olllo......",
    "..oooollko......",
    ".....olllo......",
    "......ooo.......",
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
