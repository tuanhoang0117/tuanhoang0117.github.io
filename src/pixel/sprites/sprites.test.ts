import { describe, expect, it } from "vitest";
import { validateSprite } from "../validate";
import { mustyIdle, sprites } from ".";

const TOKEN_REF = /^var\(--color-[a-z0-9-]+\)$/;

describe("sprite registry", () => {
  it.each(sprites.map((s) => [s.name, s] as const))("%s passes validateSprite", (_, sprite) => {
    expect(validateSprite(sprite)).toEqual([]);
  });

  it("has unique names (rule 5)", () => {
    const names = sprites.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("includes the placeholder musty-idle", () => {
    expect(sprites).toContain(mustyIdle);
    expect(mustyIdle.name).toBe("musty-idle");
  });

  it("musty-idle has 2 frames and fits in 32×32", () => {
    expect(mustyIdle.frames).toHaveLength(2);
    for (const frame of mustyIdle.frames) {
      expect(frame.length).toBeLessThanOrEqual(32);
      for (const row of frame) expect(row.length).toBeLessThanOrEqual(32);
    }
  });

  // e2e/lab.spec.ts checks in a real browser that each referenced token resolves to a color.
  it("musty-idle uses only design token colors", () => {
    for (const color of Object.values(mustyIdle.palette)) expect(color).toMatch(TOKEN_REF);
  });
});
