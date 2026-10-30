import type { MascotVisualSource } from "./types";

// The mascot's shape is drawn in code from the pixel sprites (ADR 0003), not loaded from image files.
export const mascotVisual: MascotVisualSource = { kind: "procedural-placeholder" };

/** The mascot's accessible name. It names the mascot only; it doesn't say how to press it. */
export const mascotLabel = "Musty the Mustang";

/** Shown beside the mascot on the home page, inviting a press. */
export const mascotPrompt = "Click me";

/** Label for the press counter shown beside the mascot, e.g. "Clicks: 12". */
export const mascotCounterLabel = "Clicks";
