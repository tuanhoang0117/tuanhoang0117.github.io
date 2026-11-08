import { mustyIdle } from "../musty-idle";
import { dress } from "./dress";

/** Pilot goggles pushed up on the forehead: brass rims, sky lenses, a dark strap. */
export const mustyAviatorGoggles = dress(mustyIdle, {
  name: "aviator-goggles",
  palette: { o: "var(--color-gold)", l: "var(--color-sky)", s: "var(--color-seal)" },
  overlay: [
    "................",
    "................",
    "....oooooooo....",
    "..ssolloollo....",
    "....oooooooo....",
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
