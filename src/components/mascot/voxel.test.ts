import { describe, expect, it } from "vitest";
import { mustyIdle } from "../../pixel/sprites/musty-idle";
import { luminance, type Raster } from "./sampling";
import { artToRaster, SILHOUETTE_SPAN } from "./source";
import {
  buildVoxelModel,
  createRaster,
  MAX_HALF_DEPTH,
  renderVoxels,
  REST_ANGLE,
  SPIN_SECONDS,
  spinAngle,
} from "./voxel";

const art = mustyIdle.frames[0]!;
const N = art.length;
const model = buildVoxelModel(art);
const halfAt = (x: number, y: number) => model.half[y * N + x]!;

const render = (angle: number, size = 192) => {
  const raster = createRaster(size);
  renderVoxels(model, angle, raster, SILHOUETTE_SPAN);
  return raster;
};
const pixel = (r: Raster, px: number, py: number) => {
  const i = (Math.floor(py) * r.width + Math.floor(px)) * 4;
  return { alpha: r.data[i + 3]!, lum: luminance(r.data[i]!, r.data[i + 1]!, r.data[i + 2]!) };
};
/** The raster pixel at the center of sprite pixel (x, y), seen in profile. */
const atArt = (r: Raster, x: number, y: number) => {
  const c = artToRaster(x, y, N, r.width);
  return pixel(r, c.x, c.y);
};
/** Opaque raster pixels in raster row `py`. */
const rowWidth = (r: Raster, py: number) => {
  let n = 0;
  for (let px = 0; px < r.width; px++) if (pixel(r, px, py).alpha > 0) n++;
  return n;
};

describe("buildVoxelModel", () => {
  it("has one cube column per opaque pixel of musty-idle frame 0, and none elsewhere", () => {
    expect(model.size).toBe(16);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const opaque = art[y]![x] !== ".";
        expect(halfAt(x, y) > 0, `pixel ${x},${y}`).toBe(opaque);
      }
    }
  });

  it("is thickest in the middle of the head and thin at the ears and muzzle", () => {
    // The middle of the head, just behind the eye.
    const middle = halfAt(6, 7);
    expect(middle).toBe(MAX_HALF_DEPTH);
    // Ear tips (rows 0–1) and the muzzle's front edge (column 15).
    const ears = [halfAt(6, 0), halfAt(7, 0), halfAt(10, 1), halfAt(11, 1)];
    const muzzle = [halfAt(15, 7), halfAt(15, 8), halfAt(15, 9), halfAt(14, 7)];
    for (const depth of [...ears, ...muzzle]) expect(depth).toBe(1);
    // Depth steps down from the middle toward the muzzle, rather than jumping.
    const row = [6, 8, 10, 12, 14].map((x) => halfAt(x, 7));
    expect(row).toEqual([...row].sort((a, b) => b - a));
    expect(new Set(row).size).toBeGreaterThanOrEqual(3);
  });
});

describe("spinAngle", () => {
  it("starts at the three-quarter rest pose and turns once per SPIN_SECONDS", () => {
    expect(spinAngle(0)).toBeCloseTo(REST_ANGLE);
    expect(REST_ANGLE).toBeCloseTo(Math.PI / 4);
    expect(spinAngle(SPIN_SECONDS / 4)).toBeCloseTo(REST_ANGLE + Math.PI / 2);
    expect(spinAngle(SPIN_SECONDS)).toBeCloseTo(REST_ANGLE);
    for (let t = 0; t < 30; t += 0.7) {
      expect(spinAngle(t)).toBeGreaterThanOrEqual(0);
      expect(spinAngle(t)).toBeLessThan(2 * Math.PI);
    }
  });
});

describe("renderVoxels", () => {
  it("at 0 is the sprite as drawn: opaque on its pixels, clear off them", () => {
    const r = render(0);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const expected = art[y]![x] === "." ? 0 : 255;
        expect(atArt(r, x, y).alpha, `sprite pixel ${x},${y}`).toBe(expected);
      }
    }
  });

  it("at half a turn shows the sprite mirrored (the far side of the head)", () => {
    const r = render(Math.PI);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const expected = art[y]![N - 1 - x] === "." ? 0 : 255;
        expect(atArt(r, x, y).alpha, `sprite pixel ${x},${y}`).toBe(expected);
      }
    }
  });

  // Exactly edge-on, and a hair off it (a different code path: the general ray-box test).
  it.each([Math.PI / 2, Math.PI / 2 + 0.002, (3 * Math.PI) / 2 - 0.002])(
    "edge-on (%f rad), each row is as wide as that row's thickest column",
    (angle) => {
      const r = render(angle);
      const { cell } = artToRaster(0, 0, N, r.width);
      for (const y of [0, 1, 6, 7, 12]) {
        const thickest = Math.max(...Array.from({ length: N }, (_, x) => halfAt(x, y)));
        const width = rowWidth(r, artToRaster(0, y, N, r.width).y);
        expect(Math.abs(width - 2 * thickest * cell), `row ${y}`).toBeLessThanOrEqual(2);
      }
      // So the ears are much thinner than the middle of the head.
      const ear = rowWidth(r, artToRaster(0, 0, N, r.width).y);
      const head = rowWidth(r, artToRaster(0, 7, N, r.width).y);
      expect(head).toBeGreaterThanOrEqual(ear * 3);
    },
  );

  it.each([0, Math.PI / 2, Math.PI])(
    "is lit from the upper left at %f rad: left and top brighter than right and bottom",
    (angle) => {
      const r = render(angle);
      const sums = {
        left: { total: 0, count: 0 },
        right: { total: 0, count: 0 },
        top: { total: 0, count: 0 },
        bottom: { total: 0, count: 0 },
      };
      const add = (key: keyof typeof sums, lum: number) => {
        sums[key].total += lum;
        sums[key].count++;
      };
      // Bounding box of the silhouette, split in half each way.
      let [x0, x1, y0, y1] = [r.width, 0, r.height, 0];
      for (let py = 0; py < r.height; py++) {
        for (let px = 0; px < r.width; px++) {
          if (pixel(r, px, py).alpha === 0) continue;
          [x0, x1, y0, y1] = [
            Math.min(x0, px),
            Math.max(x1, px),
            Math.min(y0, py),
            Math.max(y1, py),
          ];
        }
      }
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const { alpha, lum } = pixel(r, px, py);
          if (alpha === 0) continue;
          add(px < (x0 + x1) / 2 ? "left" : "right", lum);
          add(py < (y0 + y1) / 2 ? "top" : "bottom", lum);
        }
      }
      const mean = (key: keyof typeof sums) => sums[key].total / sums[key].count;
      expect(mean("left") - mean("right")).toBeGreaterThan(0.08);
      expect(mean("top") - mean("bottom")).toBeGreaterThan(0.04);
    },
  );

  it("brightens the face as it turns toward the light, on the left", () => {
    const mean = (r: Raster) => {
      let [sum, count] = [0, 0];
      for (let py = 0; py < r.height; py++) {
        for (let px = 0; px < r.width; px++) {
          const { alpha, lum } = pixel(r, px, py);
          if (alpha === 0) continue;
          sum += lum;
          count++;
        }
      }
      return sum / count;
    };
    // At +45° the sprite's face turns to the left, toward the light; at −45° to the right, away.
    expect(mean(render(REST_ANGLE)) - mean(render(-REST_ANGLE))).toBeGreaterThan(0.05);
  });

  it("shades the face as rounded, not as a flat slab", () => {
    // In profile every front face points straight at the viewer. A flat slab would light all the
    // plain coat the same; a rounded head is bright where it faces the light and dark where it
    // turns away.
    const r = render(0);
    const coat: number[] = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (art[y]![x] === "g") coat.push(atArt(r, x, y).lum);
      }
    }
    expect(Math.max(...coat) - Math.min(...coat)).toBeGreaterThan(0.3);
  });

  it("keeps the eye dark, so the face reads", () => {
    const r = render(0);
    expect(art[6]!.slice(6, 8)).toBe("kk");
    expect(atArt(r, 6, 6).lum).toBeLessThan(atArt(r, 10, 6).lum * 0.5);
  });

  it("stays inside the raster at every angle, with a clear margin", () => {
    for (let step = 0; step < 24; step++) {
      const r = render((step / 24) * 2 * Math.PI, 96);
      for (let i = 0; i < r.width; i++) {
        for (const [px, py] of [
          [i, 0],
          [i, r.height - 1],
          [0, i],
          [r.width - 1, i],
        ] as const) {
          expect(pixel(r, px, py).alpha, `step ${step} at ${px},${py}`).toBe(0);
        }
      }
    }
  });

  it("overwrites the whole target, so a reused raster holds only the new angle", () => {
    const r = render(0);
    const fresh = render(Math.PI / 2);
    renderVoxels(model, Math.PI / 2, r, SILHOUETTE_SPAN);
    expect(r.data).toEqual(fresh.data);
  });
});
