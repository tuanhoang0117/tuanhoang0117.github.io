import { mustyIdle } from "../musty-idle";
import { dress } from "./dress";

/** A Heritage Orange sweatband with trailing ties, and a volleyball under the chin. */
export const mustyVolleyballHeadband = dress(mustyIdle, {
  name: "volleyball-headband",
  palette: {
    k: "var(--color-ink)",
    r: "var(--color-heritage)",
    w: "var(--color-card)",
    y: "var(--color-gold-bright)",
    c: "var(--color-cove)",
  },
  overlay: [
    "................",
    "................",
    "................",
    "...rrrrrrrrr....",
    ".rrrrrrrrrrrr...",
    "rr..............",
    "................",
    "................",
    "................",
    "................",
    "................",
    "...........kkk..",
    "..........kycwk.",
    "..........kcwyk.",
    "..........kwyck.",
    "...........kkk..",
  ],
});
