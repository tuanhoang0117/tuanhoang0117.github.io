import { TRANSPARENT, type SpriteDef } from "./types";

/** Rule 4 in docs/contracts/sprite-format.md. */
export const MAX_SPRITE_SIZE = 64;

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Splits a row into pixels by code point, so a stray emoji counts as one bad pixel, not two. */
export function pixelsOf(row: string): string[] {
  return Array.from(row);
}

/**
 * Checks a sprite against the rules in docs/contracts/sprite-format.md and returns every problem
 * as a readable sentence. An empty list means the sprite is valid.
 *
 * Rule 5's uniqueness half needs every sprite at once, so the registry test checks it. Rule 6
 * (prefer tokens) is a style preference, not an error.
 */
export function validateSprite(def: SpriteDef): string[] {
  const errors: string[] = [];
  const keys = Object.keys(def.palette);

  // Rule 5: kebab-case name.
  if (!KEBAB_CASE.test(def.name)) {
    errors.push(`Name "${def.name}" must be kebab-case, like "musty-idle".`);
  }

  // Rule 1: "." is reserved for transparency.
  if (Object.hasOwn(def.palette, TRANSPARENT)) {
    errors.push(`Palette key "${TRANSPARENT}" is reserved for transparency and can't be a color.`);
  }

  // Rule 2a: keys are exactly one character.
  for (const key of keys) {
    if (pixelsOf(key).length !== 1) {
      errors.push(`Palette key "${key}" must be exactly one character.`);
    }
  }

  if (def.frames.length === 0) {
    errors.push("Sprite has no frames. It needs at least one.");
    return errors;
  }

  // Rule 2b: every character in a frame is in the palette. Reported once per character per frame,
  // at its first position, so a typo doesn't produce a hundred errors.
  def.frames.forEach((frame, f) => {
    const seen = new Set<string>();
    frame.forEach((row, y) => {
      pixelsOf(row).forEach((ch, x) => {
        if (ch === TRANSPARENT || Object.hasOwn(def.palette, ch) || seen.has(ch)) return;
        seen.add(ch);
        errors.push(
          `Frame ${f}, row ${y}, column ${x}: "${ch}" isn't in the palette. Add it or use "${TRANSPARENT}".`,
        );
      });
    });
  });

  // Rule 3: rectangular, with every frame the same size as frame 0.
  const first = def.frames[0]!;
  const height = first.length;
  const width = first[0] === undefined ? 0 : pixelsOf(first[0]).length;
  if (height === 0 || width === 0) {
    errors.push("Frame 0 is empty. Frames need at least one row of at least one pixel.");
  }
  def.frames.forEach((frame, f) => {
    if (frame.length !== height) {
      errors.push(`Frame ${f} has ${frame.length} rows, but frame 0 has ${height}.`);
    }
    frame.forEach((row, y) => {
      const length = pixelsOf(row).length;
      if (length !== width) {
        errors.push(`Frame ${f}, row ${y} is ${length} pixels wide, but should be ${width}.`);
      }
    });
  });

  // Rule 4: at most 64×64.
  if (width > MAX_SPRITE_SIZE || height > MAX_SPRITE_SIZE) {
    errors.push(
      `Sprite is ${width}×${height}, over the ${MAX_SPRITE_SIZE}×${MAX_SPRITE_SIZE} limit. Split it into several sprites.`,
    );
  }

  // Not a numbered rule, but a multi-frame sprite without a usable rate can't animate.
  if (def.frames.length > 1 && !(typeof def.fps === "number" && def.fps > 0 && isFinite(def.fps))) {
    errors.push(
      `Sprite has ${def.frames.length} frames but fps is ${String(def.fps)}. Set a positive fps.`,
    );
  }

  return errors;
}

/** Throws one error listing every problem, or does nothing if the sprite is valid. */
export function assertValidSprite(def: SpriteDef): void {
  const errors = validateSprite(def);
  if (errors.length > 0) {
    throw new Error(
      `Invalid sprite "${def.name}" (${errors.length} problem${errors.length === 1 ? "" : "s"}):\n` +
        errors.map((e) => `- ${e}`).join("\n"),
    );
  }
}
