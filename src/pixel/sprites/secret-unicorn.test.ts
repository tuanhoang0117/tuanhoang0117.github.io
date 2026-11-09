import { describe, expect, it } from "vitest";
import { pixelsOf } from "../validate";
import { horseTrot, mustyIdle, secretUnicorn, sprites } from ".";

const TOKEN_REF = /^var\(--color-[a-z0-9-]+\)$/;

describe("secret-unicorn", () => {
  it("is in the registry, so /lab shows it", () => {
    expect(sprites).toContain(secretUnicorn);
  });

  it("is 16×16 in every frame, the falling tokens' size", () => {
    for (const frame of secretUnicorn.frames) {
      expect(frame).toHaveLength(16);
      for (const row of frame) expect(pixelsOf(row)).toHaveLength(16);
    }
  });

  // e2e/lab.spec.ts checks in a real browser that each referenced token resolves to a color.
  it("uses only design token colors", () => {
    for (const color of Object.values(secretUnicorn.palette)) expect(color).toMatch(TOKEN_REF);
  });

  it("has a rainbow: at least five distinct colors besides ink and the coat", () => {
    const used = new Set(secretUnicorn.frames.flat().flatMap(pixelsOf));
    const accents = [...used]
      .filter((key) => key !== "." && key !== "k" && key !== "w")
      .map((key) => secretUnicorn.palette[key]);
    expect(new Set(accents).size).toBeGreaterThanOrEqual(5);
  });

  it("differs from Musty and the four-legged horse in every frame", () => {
    for (const other of [mustyIdle, horseTrot]) {
      for (const frame of secretUnicorn.frames) {
        for (const theirs of other.frames) expect(frame).not.toEqual(theirs);
      }
      expect(secretUnicorn.palette).not.toEqual(other.palette);
    }
  });
});
