import { mustyIdle } from "../musty-idle";
import { dress } from "./dress";

/** A striped party hat with a pom-pom. */
export const mustyPartyHat = dress(mustyIdle, {
  name: "party-hat",
  palette: {
    k: "var(--color-ink)",
    r: "var(--color-heritage)",
    c: "var(--color-cove)",
    y: "var(--color-gold-bright)",
  },
  overlay: [
    ".......rr.......",
    "......kcck......",
    "......kyyk......",
    ".....kcccck.....",
    ".....kyyyyk.....",
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
