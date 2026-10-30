import type { MascotVisualSource } from "./types";

// The mascot's shape is drawn in code from the pixel sprites (ADR 0003), not loaded from image files.
export const mascotVisual: MascotVisualSource = { kind: "procedural-placeholder" };

/** The mascot's accessible name. It names the mascot only; it doesn't say how to press it. */
export const mascotLabel = "Musty the Mustang";
