import { describe, expect, it } from "vitest";
import {
  ALPHA_LEVELS,
  COLOR_RAMP,
  FILL_RAMP,
  MIN_ALPHA,
  OUTLINE_RAMP,
  RIPPLE_RADIUS,
  STILL,
  alphaLevel,
  cellLayout,
  colorFor,
  glyphFor,
  inkTone,
  luminance,
  rampIndex,
  rippleInfluence,
  sampleAt,
  stepMotion,
  type Raster,
} from "./sampling";

/** A raster from rows of characters: "#" opaque white, "." opaque black, " " transparent. */
function rasterOf(rows: string[]): Raster {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) =>
    Array.from(row).forEach((ch, x) => {
      const i = (y * width + x) * 4;
      const v = ch === "#" ? 255 : 0;
      data.set([v, v, v, ch === " " ? 0 : 255], i);
    }),
  );
  return { width, height, data };
}

describe("glyph mapping", () => {
  it("weights luminance by Rec. 709, so green reads brighter than red or blue", () => {
    expect(luminance(0, 0, 0)).toBe(0);
    expect(luminance(255, 255, 255)).toBeCloseTo(1);
    expect(luminance(0, 255, 0)).toBeGreaterThan(luminance(255, 0, 0));
    expect(luminance(255, 0, 0)).toBeGreaterThan(luminance(0, 0, 255));
  });

  it("maps tones across the whole ramp and clamps out-of-range tones", () => {
    expect(rampIndex(0, 12)).toBe(0);
    expect(rampIndex(0.999, 12)).toBe(11);
    expect(rampIndex(1, 12)).toBe(11);
    expect(rampIndex(-3, 12)).toBe(0);
    expect(rampIndex(7, 12)).toBe(11);
    expect(rampIndex(0.5, 4)).toBe(2);
  });

  it("gives more ink a denser glyph and a deeper color", () => {
    expect(glyphFor(0, false)).toBe(FILL_RAMP[0]);
    expect(glyphFor(1, false)).toBe(FILL_RAMP.at(-1));
    expect(colorFor(0)).toBe(COLOR_RAMP[0]);
    expect(colorFor(1)).toBe("--color-poly");
    const tones = [0.05, 0.3, 0.55, 0.8, 0.99];
    const glyphs = tones.map((t) => FILL_RAMP.indexOf(glyphFor(t, false)));
    const colors = tones.map((t) => COLOR_RAMP.indexOf(colorFor(t)));
    expect(glyphs).toEqual([...glyphs].sort((a, b) => a - b));
    expect(new Set(glyphs).size).toBe(tones.length);
    expect(colors).toEqual([...colors].sort((a, b) => a - b));
    expect(new Set(colors).size).toBe(COLOR_RAMP.length);
  });

  it("uses the outline ramp on the silhouette's edge", () => {
    expect(OUTLINE_RAMP).toContain(glyphFor(0.5, true));
    expect(FILL_RAMP).toContain(glyphFor(0.5, false));
    expect(glyphFor(0.5, true)).not.toBe(glyphFor(0.5, false));
  });

  it("only names color tokens, never raw colors", () => {
    for (const token of COLOR_RAMP) expect(token).toMatch(/^--color-[a-z-]+$/);
  });

  it("buckets alpha into opacity levels, opaque in the top level", () => {
    expect(alphaLevel(255)).toBe(ALPHA_LEVELS - 1);
    expect(alphaLevel(MIN_ALPHA)).toBe(0);
    expect(alphaLevel(128)).toBe(2);
  });

  it("uses finer cells on smaller mascots", () => {
    expect(cellLayout(320)).toEqual({ step: 5, font: 8 });
    expect(cellLayout(600)).toEqual({ step: 6, font: 9 });
    expect(cellLayout(1000)).toEqual({ step: 7, font: 10 });
    for (const w of [320, 600, 1000]) {
      const { step, font } = cellLayout(w);
      expect(font).toBeGreaterThan(step);
    }
  });
});

describe("sampleAt", () => {
  const raster = rasterOf(["      ", " #### ", " #..# ", " #..# ", " #### ", "      "]);
  const at = (x: number, y: number) => sampleAt(raster, (x + 0.5) / 6, (y + 0.5) / 6, 1 / 6);

  it("skips transparent and out-of-bounds cells", () => {
    expect(at(0, 0)).toBeNull();
    expect(sampleAt(raster, -0.01, 0.5, 0.1)).toBeNull();
    expect(sampleAt(raster, 0.5, 1, 0.1)).toBeNull();
  });

  it("reads luminance from the source pixel", () => {
    expect(at(1, 1)!.luminance).toBeCloseTo(1);
    expect(at(2, 2)!.luminance).toBe(0);
    expect(at(2, 2)!.alpha).toBe(255);
  });

  it("flags cells next to empty space as edge, and interior cells not", () => {
    expect(at(1, 1)!.edge).toBe(true);
    expect(at(4, 2)!.edge).toBe(true);
    expect(at(2, 2)!.edge).toBe(false);
    expect(at(3, 3)!.edge).toBe(false);
  });

  it("checks edges one reach away, so a wider reach finds the edge from further in", () => {
    expect(sampleAt(raster, 2.5 / 6, 2.5 / 6, 2 / 6)!.edge).toBe(true);
  });
});

describe("motion", () => {
  it("in a still frame, darker source means more ink, so shading reads as depth", () => {
    const tones = [1, 0.75, 0.5, 0.25, 0].map((lum) => inkTone(lum, 0.3, 0.6, STILL));
    expect(tones).toEqual([...tones].sort((a, b) => a - b));
    expect(new Set(tones).size).toBe(tones.length);
    for (const t of tones) expect(t).toBeGreaterThanOrEqual(0);
    for (const t of tones) expect(t).toBeLessThanOrEqual(1);
  });

  it("the wave changes tone over time", () => {
    const at = (time: number) => inkTone(0.5, 0.4, 0.4, { ...STILL, time });
    expect(at(1)).not.toBeCloseTo(at(2), 3);
  });

  it("ripples only near the pointer, and only while the pointer has energy", () => {
    const calm = { time: 2, pointerX: 0.5, pointerY: 0.5, energy: 0 };
    const busy = { ...calm, energy: 1 };
    const near = [0.52, 0.5] as const;
    const far = [0.5 + RIPPLE_RADIUS + 0.05, 0.5] as const;
    expect(inkTone(0.5, ...near, busy)).not.toBeCloseTo(inkTone(0.5, ...near, calm), 3);
    expect(inkTone(0.5, ...far, busy)).toBe(inkTone(0.5, ...far, calm));
  });

  it("ripple influence is full under the pointer and fades to zero at the radius", () => {
    expect(rippleInfluence(0)).toBe(1);
    expect(rippleInfluence(RIPPLE_RADIUS / 2)).toBeGreaterThan(0);
    expect(rippleInfluence(RIPPLE_RADIUS / 2)).toBeLessThan(1);
    expect(rippleInfluence(RIPPLE_RADIUS)).toBe(0);
    expect(rippleInfluence(1)).toBe(0);
  });

  it("eases the pointer toward its target and builds energy from movement", () => {
    const next = stepMotion(STILL, 1, 0.5, 1 / 60);
    expect(next.pointerX).toBeGreaterThan(0.5);
    expect(next.pointerX).toBeLessThan(1);
    expect(next.energy).toBeGreaterThan(0);
    expect(next.time).toBeCloseTo(1 / 60);
  });

  it("lets energy decay once the pointer stops", () => {
    let m = { ...STILL, energy: 1 };
    for (let i = 0; i < 120; i++) m = stepMotion(m, 0.5, 0.5, 1 / 60);
    expect(m.energy).toBeLessThan(0.01);
  });

  it("moves the same at 30 fps as at 60 fps", () => {
    const sixty = stepMotion(stepMotion(STILL, 1, 0, 1 / 60), 1, 0, 1 / 60);
    const thirty = stepMotion(STILL, 1, 0, 1 / 30);
    expect(thirty.pointerX).toBeCloseTo(sixty.pointerX, 6);
    expect(thirty.pointerY).toBeCloseTo(sixty.pointerY, 6);
    expect(thirty.time).toBeCloseTo(sixty.time, 6);
  });
});
