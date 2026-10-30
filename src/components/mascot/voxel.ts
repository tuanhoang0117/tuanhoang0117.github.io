import { TRANSPARENT } from "../../pixel/types";
import { pixelsOf } from "../../pixel/validate";
import type { Raster } from "./sampling";

/**
 * Musty as voxels: every opaque sprite pixel becomes a column of cubes running away from the
 * viewer, centered on the sprite's plane. Columns deep inside the silhouette are thicker than
 * ones near its edge, so the head is fullest in the middle and thin at the ears and muzzle. The
 * model turns about its vertical axis and is drawn into a raster for the glyph renderer to sample.
 * Plain math, no canvas: identical everywhere and testable.
 */
export interface VoxelModel {
  /** The sprite's side in pixels; the model is `size` voxels wide and tall. */
  size: number;
  /** Per sprite pixel, row-major: half the column's depth in voxels. 0 means empty. */
  half: Uint8Array;
  /** Surface brightness (0–1) of the column's front and back faces. */
  albedo: Float32Array;
  /** Surface brightness of the column's side faces. */
  sideAlbedo: Float32Array;
  /**
   * Slope of a smoothed copy of `half` at each pixel's center, along x and y. The front and back
   * faces are lit as if they followed this smooth surface, so the head reads as rounded while its
   * outline stays blocky.
   */
  slopeX: Float32Array;
  slopeY: Float32Array;
}

/** The thickest a column gets, in voxels either side of the sprite's plane. */
export const MAX_HALF_DEPTH = 4;
/** Half-depth gained per pixel of distance from the silhouette's edge. */
const DEPTH_PER_PIXEL = 0.8;

/** One full turn takes this long, so the spin reads as slow and calm. */
export const SPIN_SECONDS = 12;
/** The still pose (reduced motion, and where the spin starts): three-quarter, muzzle toward the viewer. */
export const REST_ANGLE = Math.PI / 4;

/** The model's angle after `seconds` of spinning, in radians, 0 ≤ angle < 2π. */
export function spinAngle(seconds: number): number {
  const turn = 2 * Math.PI;
  const angle = (REST_ANGLE + (seconds / SPIN_SECONDS) * turn) % turn;
  return angle < 0 ? angle + turn : angle;
}

/** Same surface brightness as the flat placeholder: dark features, light mane, mid coat. */
const ALBEDO = { coat: 0.8, mane: 1, light: 1, feature: 0.1 };

/** A [1 2 1] blur along both axes; outside the grid counts as 0. */
function smooth(field: Float32Array, size: number): Float32Array {
  const at = (f: Float32Array, x: number, y: number) =>
    x < 0 || y < 0 || x >= size || y >= size ? 0 : f[y * size + x]!;
  const rows = new Float32Array(size * size);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      rows[y * size + x] = (at(field, x - 1, y) + 2 * at(field, x, y) + at(field, x + 1, y)) / 4;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[y * size + x] = (at(rows, x, y - 1) + 2 * at(rows, x, y) + at(rows, x, y + 1)) / 4;
    }
  }
  return out;
}

/** Builds the model from one sprite frame (rows of palette keys, `.` transparent). */
export function buildVoxelModel(frame: readonly string[]): VoxelModel {
  const rows = frame.map(pixelsOf);
  const size = Math.max(rows.length, ...rows.map((row) => row.length));
  const at = (x: number, y: number) => rows[y]?.[x] ?? TRANSPARENT;
  const filled = (x: number, y: number) => at(x, y) !== TRANSPARENT;

  const half = new Uint8Array(size * size);
  const albedo = new Float32Array(size * size);
  const sideAlbedo = new Float32Array(size * size);
  // Empty pixels, including a one-pixel ring outside the sprite, for the distance to the edge.
  const empty: [number, number][] = [];
  for (let y = -1; y <= size; y++) {
    for (let x = -1; x <= size; x++) if (!filled(x, y)) empty.push([x, y]);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!filled(x, y)) continue;
      let edge = Infinity;
      for (const [ex, ey] of empty) edge = Math.min(edge, Math.hypot(ex - x, ey - y));
      const i = y * size + x;
      half[i] = Math.max(1, Math.min(MAX_HALF_DEPTH, Math.round(edge * DEPTH_PER_PIXEL)));

      // Ink inside the head (the eye, the nostril, the line between the ears) stays dark so the
      // features read; ink on the outline is just more head, since the renderer draws its own.
      const key = at(x, y);
      const enclosed = filled(x - 1, y) && filled(x + 1, y) && filled(x, y - 1) && filled(x, y + 1);
      const feature = key === "k" && enclosed;
      const surface =
        key === "y"
          ? ALBEDO.mane
          : key === "w"
            ? ALBEDO.light
            : feature
              ? ALBEDO.feature
              : ALBEDO.coat;
      albedo[i] = surface;
      // Features are painted on the face, so the sides of their columns are plain coat.
      sideAlbedo[i] = feature ? ALBEDO.coat : surface;
    }
  }

  const soft = smooth(smooth(Float32Array.from(half), size), size);
  const slopeX = new Float32Array(size * size);
  const slopeY = new Float32Array(size * size);
  const softAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= size || y >= size ? 0 : soft[y * size + x]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      slopeX[y * size + x] = (softAt(x + 1, y) - softAt(x - 1, y)) / 2;
      slopeY[y * size + x] = (softAt(x, y + 1) - softAt(x, y - 1)) / 2;
    }
  }
  return { size, half, albedo, sideAlbedo, slopeX, slopeY };
}

/** An empty square RGBA raster to render into. */
export function createRaster(size: number): Raster {
  return { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
}

// Unit vector toward the light, in view space (x right, y down, z toward the viewer): up, left,
// and in front. The same light as the flat placeholder.
const LIGHT = (() => {
  const v = [-0.48, -0.56, 0.68];
  const n = Math.hypot(v[0]!, v[1]!, v[2]!);
  return v.map((c) => c / n) as [number, number, number];
})();
// Blinn-Phong halfway vector, with the viewer straight on.
const HALFWAY = (() => {
  const [lx, ly, lz] = LIGHT;
  const n = Math.hypot(lx, ly, lz + 1);
  return [lx / n, ly / n, (lz + 1) / n] as [number, number, number];
})();

/** How strongly the smoothed slope bends the lighting normal: higher reads as more rounded. */
const RELIEF = 1.1;

/** How far side faces lean toward the front or back face they meet (0 = flat walls). */
const SIDE_LEAN = 0.6;

/** Bilinear lookup of a per-pixel field at sprite coordinates (pixel centers at +0.5). */
function lerpField(field: Float32Array, size: number, fx: number, fy: number): number {
  const x = Math.min(size - 1, Math.max(0, fx - 0.5));
  const y = Math.min(size - 1, Math.max(0, fy - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const top = field[y0 * size + x0]! * (1 - tx) + field[y0 * size + x1]! * tx;
  const bottom = field[y1 * size + x0]! * (1 - tx) + field[y1 * size + x1]! * tx;
  return top * (1 - ty) + bottom * ty;
}

/**
 * Draws the model turned `angle` radians about its vertical axis into `target`, overwriting it.
 * At 0 the model is the sprite as drawn (a profile facing right); positive angles turn the muzzle
 * toward the viewer. `span` is the share of the raster's side the sprite covers.
 *
 * Turning about the vertical axis never moves a point up or down, so each sprite row is its own
 * 2D problem: for each raster column, cast one ray through that row's cube columns (axis-aligned
 * boxes in model space) and keep the nearest hit. That is at most `size` box tests per raster
 * column per sprite row, then one shading pass over the raster.
 */
export function renderVoxels(model: VoxelModel, angle: number, target: Raster, span: number) {
  const { size: n, half, albedo, sideAlbedo, slopeX, slopeY } = model;
  const S = target.width;
  const data = target.data;
  data.fill(0);

  const cell = (S * span) / n;
  const offset = (S - cell * n) / 2;
  const center = n / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const flatX = Math.abs(sin) < 1e-9;
  const flatZ = Math.abs(cos) < 1e-9;
  // The farthest any voxel corner gets from the axis: for the depth cue below.
  const reach = Math.hypot(center, MAX_HALF_DEPTH);
  const [lx, ly, lz] = LIGHT;
  const [hx, hy, hz] = HALFWAY;

  // Per raster column, for the current sprite row: the hit column (-1 = none), whether the ray
  // entered through a side face, which way that face points (±1), the hit's model x, and its depth
  // toward the viewer.
  const hitCol = new Int16Array(S);
  const hitSide = new Uint8Array(S);
  const hitSign = new Int8Array(S);
  const hitX = new Float32Array(S);
  const hitZ = new Float32Array(S);
  const hitDepth = new Float32Array(S);

  let row = -1;
  for (let py = 0; py < S; py++) {
    const fy = (py + 0.5 - offset) / cell;
    const y = Math.floor(fy);
    if (y < 0 || y >= n) continue;

    if (y !== row) {
      row = y;
      const base = y * n;
      for (let px = 0; px < S; px++) {
        const sx = (px + 0.5 - S / 2) / cell;
        // The ray for this column, by view depth t: X(t) = sx·cos + t·sin, Z(t) = −sx·sin + t·cos.
        const ox = sx * cos;
        const oz = -sx * sin;
        let best = -Infinity;
        let col = -1;
        let side = false;
        for (let x = 0; x < n; x++) {
          const k = half[base + x]!;
          if (k === 0) continue;
          const x0 = x - center;
          let xLo = -Infinity;
          let xHi = Infinity;
          if (flatX) {
            if (ox < x0 || ox > x0 + 1) continue;
          } else {
            const a = (x0 - ox) / sin;
            const b = (x0 + 1 - ox) / sin;
            xLo = a < b ? a : b;
            xHi = a < b ? b : a;
          }
          let zLo = -Infinity;
          let zHi = Infinity;
          if (flatZ) {
            if (oz < -k || oz > k) continue;
          } else {
            const a = (-k - oz) / cos;
            const b = (k - oz) / cos;
            zLo = a < b ? a : b;
            zHi = a < b ? b : a;
          }
          const lo = xLo > zLo ? xLo : zLo;
          const hi = xHi < zHi ? xHi : zHi;
          if (lo > hi || hi <= best) continue;
          best = hi;
          col = x;
          // The ray enters through whichever face it crosses last on its way in.
          side = xHi < zHi;
        }
        hitCol[px] = col;
        if (col < 0) continue;
        hitSide[px] = side ? 1 : 0;
        hitSign[px] = side ? (sin > 0 ? 1 : -1) : cos > 0 ? 1 : -1;
        hitX[px] = ox + best * sin;
        hitZ[px] = oz + best * cos;
        hitDepth[px] = best;
      }
    }

    const rowStart = py * S;
    for (let px = 0; px < S; px++) {
      const col = hitCol[px]!;
      if (col < 0) continue;
      const i = row * n + col;
      const sign = hitSign[px]!;
      const side = hitSide[px] === 1;
      // Model-space normal. Front and back faces follow the smoothed surface z = ±half(x, y).
      // Side faces (the steps between columns) lean partway toward that surface, so they read
      // as steps on a rounded head rather than as dark stripes.
      const gx = lerpField(slopeX, n, hitX[px]! + center, fy);
      const gy = lerpField(slopeY, n, hitX[px]! + center, fy);
      const mx = side ? sign - RELIEF * gx : -RELIEF * gx;
      const mz = side ? Math.sign(hitZ[px]!) * SIDE_LEAN : sign;
      // Turned with the model, into view space.
      let vx = mx * cos - mz * sin;
      let vy = -RELIEF * gy;
      let vz = mx * sin + mz * cos;
      const len = Math.hypot(vx, vy, vz);
      vx /= len;
      vy /= len;
      vz /= len;

      const diffuse = Math.max(0, vx * lx + vy * ly + vz * lz);
      let spec = Math.max(0, vx * hx + vy * hy + vz * hz);
      spec *= spec; // ^2
      spec *= spec; // ^4
      spec *= spec; // ^8
      const s8 = spec;
      spec *= spec; // ^16
      spec *= spec; // ^32
      spec *= s8; // ^40
      // Nearer surfaces are a little brighter, so the thick middle of the head stands forward.
      const near = Math.min(1, Math.max(0, (hitDepth[px]! + reach) / (2 * reach)));
      const cue = 0.7 + 0.3 * near;
      const surface = side ? sideAlbedo[i]! : albedo[i]!;
      // Dark features stay matte, so the highlight never washes out the eye.
      const shade = Math.min(1, 0.04 + surface * ((0.12 + 0.82 * diffuse) * cue + spec * 0.35));
      const gray = Math.round(shade * 255);
      const p = (rowStart + px) * 4;
      data[p] = gray;
      data[p + 1] = gray;
      data[p + 2] = gray;
      data[p + 3] = 255;
    }
  }
}
