import { describe, expect, it } from "vitest";
import type { SpriteDef } from "./types";
import { assertValidSprite, validateSprite } from "./validate";

const valid: SpriteDef = {
  name: "test-dot",
  palette: { k: "var(--color-ink)", g: "var(--color-poly)" },
  frames: [
    [".k.", "kgk", ".k."],
    ["...", ".g.", "..."],
  ],
  fps: 4,
};

const square = (size: number) => [Array.from({ length: size }, () => "k".repeat(size))];

describe("validateSprite", () => {
  it("returns no errors for a valid sprite", () => {
    expect(validateSprite(valid)).toEqual([]);
  });

  it("accepts a single-frame sprite without fps, and exactly 64×64", () => {
    expect(validateSprite({ ...valid, frames: square(64), fps: undefined })).toEqual([]);
  });

  it("rule 1: rejects '.' as a palette key", () => {
    const errors = validateSprite({ ...valid, palette: { ...valid.palette, ".": "red" } });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/"\." is reserved for transparency/);
  });

  it.each([["kk"], [""]])("rule 2: rejects the palette key %j", (key) => {
    const errors = validateSprite({ ...valid, palette: { ...valid.palette, [key]: "red" } });
    expect(errors).toEqual([expect.stringMatching(/"[^"]*" must be exactly one character/)]);
  });

  it("rule 2: counts a single emoji key as one character", () => {
    const sprite = { ...valid, palette: { ...valid.palette, "🐴": "red" }, frames: [["🐴k"]] };
    expect(validateSprite({ ...sprite, fps: undefined })).toEqual([]);
  });

  it("rule 2: rejects characters missing from the palette, with where they first appear", () => {
    const errors = validateSprite({
      ...valid,
      frames: [
        [".k.", "kzk", ".z."],
        ["...", ".q.", "..."],
      ],
    });
    expect(errors).toEqual([
      expect.stringMatching(/Frame 0, row 1, column 1: "z" isn't in the palette/),
      expect.stringMatching(/Frame 1, row 1, column 1: "q" isn't in the palette/),
    ]);
  });

  it("rule 3: rejects ragged rows", () => {
    const errors = validateSprite({ ...valid, frames: [[".k.", "kgkk", ".k."]], fps: undefined });
    expect(errors).toEqual([
      expect.stringMatching(/Frame 0, row 1 is 4 pixels wide, but should be 3/),
    ]);
  });

  it("rule 3: rejects frames with a different number of rows", () => {
    const errors = validateSprite({ ...valid, frames: [valid.frames[0]!, ["...", ".g."]] });
    expect(errors).toEqual([expect.stringMatching(/Frame 1 has 2 rows, but frame 0 has 3/)]);
  });

  it("rule 3: rejects frames with a different width", () => {
    const errors = validateSprite({
      ...valid,
      frames: [valid.frames[0]!, ["....", ".gg.", "...."]],
    });
    expect(errors).toHaveLength(3);
    for (const e of errors) expect(e).toMatch(/Frame 1, row \d is 4 pixels wide, but should be 3/);
  });

  it.each([
    ["wide", [Array.from({ length: 2 }, () => "k".repeat(65))]],
    ["tall", [Array.from({ length: 65 }, () => "kk")]],
  ])("rule 4: rejects a sprite over 64×64 (%s)", (_, frames) => {
    const errors = validateSprite({ ...valid, frames, fps: undefined });
    expect(errors).toEqual([expect.stringMatching(/over the 64×64 limit/)]);
  });

  it.each([["Musty"], ["musty_idle"], ["musty idle"], ["-musty"], ["musty--idle"], [""]])(
    "rule 5: rejects the non-kebab-case name %j",
    (name) => {
      const errors = validateSprite({ ...valid, name });
      expect(errors).toEqual([expect.stringMatching(/must be kebab-case/)]);
    },
  );

  it("rejects a sprite with no frames", () => {
    expect(validateSprite({ ...valid, frames: [] })).toEqual([expect.stringMatching(/no frames/)]);
  });

  it("rejects an empty frame", () => {
    expect(validateSprite({ ...valid, frames: [[]], fps: undefined })).toEqual([
      expect.stringMatching(/Frame 0 is empty/),
    ]);
  });

  it.each([[undefined], [0], [-2], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    "rejects a multi-frame sprite with fps %s",
    (fps) => {
      expect(validateSprite({ ...valid, fps })).toEqual([
        expect.stringMatching(/2 frames but fps is .*Set a positive fps/),
      ]);
    },
  );

  it("reports every problem at once", () => {
    const errors = validateSprite({
      name: "Bad Name",
      palette: { ".": "red", kk: "blue" },
      frames: [["ab", "a"], ["ab"]],
    });
    expect(errors).toEqual([
      expect.stringMatching(/kebab-case/),
      expect.stringMatching(/"\." is reserved/),
      expect.stringMatching(/"kk" must be exactly one character/),
      expect.stringMatching(/Frame 0, row 0, column 0: "a"/),
      expect.stringMatching(/Frame 0, row 0, column 1: "b"/),
      expect.stringMatching(/Frame 1, row 0, column 0: "a"/),
      expect.stringMatching(/Frame 1, row 0, column 1: "b"/),
      expect.stringMatching(/Frame 0, row 1 is 1 pixels wide, but should be 2/),
      expect.stringMatching(/Frame 1 has 1 rows, but frame 0 has 2/),
      expect.stringMatching(/2 frames but fps is undefined/),
    ]);
  });
});

describe("assertValidSprite", () => {
  it("does nothing for a valid sprite", () => {
    expect(() => assertValidSprite(valid)).not.toThrow();
  });

  it("throws one error that lists every problem", () => {
    const bad: SpriteDef = { ...valid, name: "Bad", frames: [["kz"]], fps: undefined };
    expect(() => assertValidSprite(bad)).toThrowError(
      /Invalid sprite "Bad" \(2 problems\):\n- Name "Bad" must be kebab-case.*\n- Frame 0, row 0, column 1: "z"/,
    );
  });
});
