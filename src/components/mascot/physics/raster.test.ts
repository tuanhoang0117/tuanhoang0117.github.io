import { describe, expect, it } from "vitest";
import { ROTATION_STEPS, rotateNearest, rotatedSide, rotationStep, type Pixels } from "./raster";

const blank = (side: number): Pixels => ({
  data: new Uint8ClampedArray(side * side * 4),
  width: side,
  height: side,
});

/** An image from rows of keys; each key's color is [code, code, code, 255]. */
function image(rows: string[]): Pixels {
  const width = rows[0]!.length;
  const data = new Uint8ClampedArray(width * rows.length * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      data.set([ch.charCodeAt(0), ch.charCodeAt(0), ch.charCodeAt(0), 255], (y * width + x) * 4);
    }),
  );
  return { data, width, height: rows.length };
}

/** Back to rows of keys, trimmed to the painted area. */
function rowsOf(p: Pixels): string[] {
  const rows: string[] = [];
  for (let y = 0; y < p.height; y++) {
    let row = "";
    for (let x = 0; x < p.width; x++) {
      const i = (y * p.width + x) * 4;
      row += p.data[i + 3] ? String.fromCharCode(p.data[i]!) : ".";
    }
    rows.push(row);
  }
  const painted = rows.filter((r) => r.replaceAll(".", ""));
  const left = Math.min(...painted.map((r) => r.search(/[^.]/)));
  const right = Math.max(
    ...painted.map((r) => r.length - [...r].reverse().join("").search(/[^.]/)),
  );
  return painted.map((r) => r.slice(left, right));
}

describe("rotateNearest", () => {
  const src = image(["abcd", "efgh"]);

  it("leaves an unrotated image unchanged and centered", () => {
    const side = rotatedSide(4, 2);
    const out = rotateNearest(src, 0, blank(side));
    expect(rowsOf(out)).toEqual(["abcd", "efgh"]);
  });

  it("turns a quarter turn clockwise, exactly", () => {
    const out = rotateNearest(src, Math.PI / 2, blank(rotatedSide(4, 2)));
    expect(rowsOf(out)).toEqual(["ea", "fb", "gc", "hd"]);
  });

  it("only ever copies whole source pixels: no blended colors or partial alpha", () => {
    const colors = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((c) => c.charCodeAt(0)));
    for (let step = 0; step < ROTATION_STEPS; step++) {
      const out = rotateNearest(src, (step / ROTATION_STEPS) * 2 * Math.PI, blank(6));
      for (let i = 0; i < out.data.length; i += 4) {
        const alpha = out.data[i + 3]!;
        expect([0, 255]).toContain(alpha);
        if (alpha) expect(colors.has(out.data[i]!)).toBe(true);
      }
    }
  });

  it("fits any rotation inside the output square", () => {
    expect(rotatedSide(36, 36)).toBe(52);
    expect(rotatedSide(4, 2)).toBe(6);
    expect(rotatedSide(99, 99) % 2).toBe(1);
  });
});

describe("rotationStep", () => {
  it("quantizes an angle to the nearest of ROTATION_STEPS frames, any sign or turn", () => {
    const step = (2 * Math.PI) / ROTATION_STEPS;
    expect(rotationStep(0)).toBe(0);
    expect(rotationStep(step * 3.4)).toBe(3);
    expect(rotationStep(-step)).toBe(ROTATION_STEPS - 1);
    expect(rotationStep(2 * Math.PI * 5 + step * 2)).toBe(2);
    expect(rotationStep(2 * Math.PI - step * 0.2)).toBe(0);
  });
});
