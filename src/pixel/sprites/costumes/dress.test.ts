import { describe, expect, it } from "vitest";
import type { SpriteDef } from "../../types";
import { validateSprite } from "../../validate";
import { dress, type Costume } from "./dress";

const base: SpriteDef = {
  name: "test-base",
  palette: { k: "var(--color-ink)", g: "var(--color-poly)" },
  frames: [
    ["kkk", "kgk", "kkk"],
    ["ggg", "gkg", "ggg"],
  ],
  fps: 3,
};

const hat: Costume = {
  name: "hat",
  palette: { r: "var(--color-heritage)", k: "var(--color-ink)" },
  overlay: ["r.r", "...", ".k."],
};

describe("dress", () => {
  it("draws overlay pixels over the base and lets `.` show the base through", () => {
    expect(dress(base, hat).frames[0]).toEqual(["rkr", "kgk", "kkk"]);
  });

  it("dresses every frame of an animated base, keeping its frame count and rate", () => {
    const dressed = dress(base, hat);
    expect(dressed.frames).toEqual([
      ["rkr", "kgk", "kkk"],
      ["rgr", "gkg", "gkg"],
    ]);
    expect(dressed.fps).toBe(3);
  });

  it("leaves a single-frame base without an fps", () => {
    const still: SpriteDef = { name: "still", palette: base.palette, frames: [base.frames[0]!] };
    const dressed = dress(still, hat);
    expect(dressed.frames).toHaveLength(1);
    expect(dressed).not.toHaveProperty("fps");
  });

  it("names the result <base>-<costume>", () => {
    expect(dress(base, hat).name).toBe("test-base-hat");
  });

  it("merges the palettes, keeping every base color and adding the costume's", () => {
    expect(dress(base, hat).palette).toEqual({
      k: "var(--color-ink)",
      g: "var(--color-poly)",
      r: "var(--color-heritage)",
    });
  });

  it("refuses a costume key that the base colors differently", () => {
    const clash: Costume = { ...hat, palette: { ...hat.palette, g: "var(--color-cove)" } };
    expect(() => dress(base, clash)).toThrow(
      /palette key "g" is var\(--color-poly\) in test-base but var\(--color-cove\)/,
    );
  });

  it("refuses an overlay character the costume's palette doesn't define", () => {
    // "g" is in the base palette, but a costume must bring its own colors.
    expect(() => dress(base, { ...hat, overlay: ["g..", "...", "..."] })).toThrow(
      /overlay uses "g"/,
    );
  });

  it.each([
    ["too wide", ["r..r", "....", "...."]],
    ["too short", ["r.r", "..."]],
    ["ragged", ["r.r", "....", "..."]],
  ])("refuses an overlay that doesn't match the base's size (%s)", (_, overlay) => {
    expect(() => dress(base, { ...hat, overlay })).toThrow(/overlay is .* but test-base is 3×3/);
  });

  it("doesn't change the base sprite", () => {
    // A fresh base: if dress() mutated, the shared one above would already carry the change.
    const fresh: SpriteDef = {
      name: "fresh",
      palette: { k: "var(--color-ink)", g: "var(--color-poly)" },
      frames: [["kkk", "kgk", "kkk"]],
    };
    const before = structuredClone(fresh);
    dress(fresh, hat);
    expect(fresh).toEqual(before);
  });

  it("produces a sprite that passes validateSprite", () => {
    expect(validateSprite(dress(base, hat))).toEqual([]);
  });
});
