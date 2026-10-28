import { describe, expect, it } from "vitest";
import { toRuns } from "./runs";

const palette = { k: "ink", g: "poly", y: "gold" };

describe("toRuns", () => {
  it("returns nothing for a fully transparent row", () => {
    expect(toRuns(["....."], palette)).toEqual([]);
  });

  it("returns one 1-wide run for a single pixel", () => {
    expect(toRuns(["..k.."], palette)).toEqual([{ x: 2, y: 0, width: 1, color: "ink" }]);
  });

  it("returns one run per pixel when colors alternate", () => {
    expect(toRuns(["kgkg"], palette)).toEqual([
      { x: 0, y: 0, width: 1, color: "ink" },
      { x: 1, y: 0, width: 1, color: "poly" },
      { x: 2, y: 0, width: 1, color: "ink" },
      { x: 3, y: 0, width: 1, color: "poly" },
    ]);
  });

  it("merges a full row of one color into a single run", () => {
    expect(toRuns(["gggggg"], palette)).toEqual([{ x: 0, y: 0, width: 6, color: "poly" }]);
  });

  it("splits a run at a transparent gap", () => {
    expect(toRuns(["kk.kk"], palette)).toEqual([
      { x: 0, y: 0, width: 2, color: "ink" },
      { x: 3, y: 0, width: 2, color: "ink" },
    ]);
  });

  it("never merges across rows, and gives each row its own y", () => {
    expect(toRuns(["kkk", "...", "gyy", "kkk"], palette)).toEqual([
      { x: 0, y: 0, width: 3, color: "ink" },
      { x: 0, y: 2, width: 1, color: "poly" },
      { x: 1, y: 2, width: 2, color: "gold" },
      { x: 0, y: 3, width: 3, color: "ink" },
    ]);
  });

  it("merges neighbors that use different keys for the same color", () => {
    expect(toRuns(["ab"], { a: "ink", b: "ink" })).toEqual([
      { x: 0, y: 0, width: 2, color: "ink" },
    ]);
  });

  it("skips characters missing from the palette instead of guessing a color", () => {
    expect(toRuns(["kzk"], palette)).toEqual([
      { x: 0, y: 0, width: 1, color: "ink" },
      { x: 2, y: 0, width: 1, color: "ink" },
    ]);
  });

  it("returns nothing for an empty frame", () => {
    expect(toRuns([], palette)).toEqual([]);
  });
});
