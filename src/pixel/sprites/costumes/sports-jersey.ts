import { horseTrot } from "../horse-trot";
import { dress } from "./dress";

/** A generic Morro Cove sports jersey with a white number 7. No school marks or wordmarks. */
export const horseSportsJersey = dress(horseTrot, {
  name: "sports-jersey",
  palette: { j: "var(--color-cove)", n: "var(--color-card)" },
  overlay: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "...jjjnnnjjjj...",
    "...jjjjjnjjjj...",
    "...jjjjnjjjjj...",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
});
