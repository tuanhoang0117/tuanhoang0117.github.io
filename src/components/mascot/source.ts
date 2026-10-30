import type { MascotVisualSource } from "../../content/types";
import { mustyIdle } from "../../pixel/sprites/musty-idle";
import { TRANSPARENT } from "../../pixel/types";
import { pixelsOf } from "../../pixel/validate";
import type { Raster } from "./sampling";
import { buildVoxelModel, createRaster, REST_ANGLE, renderVoxels, type VoxelModel } from "./voxel";

/** Rasters are sampled at this size: enough detail for the densest grid, cheap to keep. */
export const SOURCE_SIZE = 384;

/** Share of the raster's side the sprite spans. The margin keeps the outline off the edge. */
export const SILHOUETTE_SPAN = 0.84;

/** Where sprite pixel (x, y)'s center lands in a `size` raster, for an `artSize`-wide sprite. */
export function artToRaster(x: number, y: number, artSize: number, size = SOURCE_SIZE) {
  const cell = (size * SILHOUETTE_SPAN) / artSize;
  const offset = (size - cell * artSize) / 2;
  return { x: offset + (x + 0.5) * cell, y: offset + (y + 0.5) * cell, cell };
}

/**
 * Brightness of each sprite pixel's surface before lighting. Ink inside the head (the eye, the
 * nostril, the line between the ears) stays dark so the features read; ink on the outline is just
 * more head, since the renderer draws its own outline.
 */
const ALBEDO = { coat: 0.8, mane: 1, light: 1, feature: 0.1 };

/** Three box blurs approximate a Gaussian. Returns a new array; `field` is left alone. */
function blur(field: Float32Array, size: number, radius: number): Float32Array {
  const r = Math.max(1, Math.round(radius));
  const width = 2 * r + 1;
  let src = field;
  for (let pass = 0; pass < 6; pass++) {
    // Even passes run along rows, odd ones along columns. Outside the raster counts as 0.
    const [lineStep, step] = pass % 2 === 0 ? [size, 1] : [1, size];
    const out = new Float32Array(size * size);
    for (let line = 0; line < size; line++) {
      const base = line * lineStep;
      let sum = 0;
      for (let k = 0; k <= Math.min(r, size - 1); k++) sum += src[base + k * step]!;
      for (let k = 0; k < size; k++) {
        out[base + k * step] = sum / width;
        if (k + r + 1 < size) sum += src[base + (k + r + 1) * step]!;
        if (k - r >= 0) sum -= src[base + (k - r) * step]!;
      }
    }
    src = out;
  }
  return src;
}

/**
 * The flat placeholder (before the spinning voxel model, issue #91; no longer what the renderer
 * draws): the silhouette of Musty's idle sprite, embossed and lit from the upper left in
 * grayscale. Shading matters as much as shape: the glyph renderer turns luminance into depth,
 * so a flat cutout would read as a stencil. The
 * corners are softened so the head reads as a head rather than a stack of squares. Drawn with
 * plain math rather than a canvas, so it is identical everywhere and testable.
 */
export function createPlaceholderRaster(size = SOURCE_SIZE): Raster {
  const art = mustyIdle.frames[0]!;
  const artSize = Math.max(art.length, ...art.map((row) => pixelsOf(row).length));
  const at = (x: number, y: number) => pixelsOf(art[y] ?? "")[x] ?? TRANSPARENT;
  const filled = (x: number, y: number) => at(x, y) !== TRANSPARENT;
  const albedoOf = (x: number, y: number) => {
    const key = at(x, y);
    if (key === "y") return ALBEDO.mane;
    if (key === "w") return ALBEDO.light;
    const enclosed = filled(x - 1, y) && filled(x + 1, y) && filled(x, y - 1) && filled(x, y + 1);
    return key === "k" && enclosed ? ALBEDO.feature : ALBEDO.coat;
  };

  // Nearest-neighbor upscale of the sprite: its mask and the surface brightness under it.
  const { cell } = artToRaster(0, 0, artSize, size);
  const offset = (size - cell * artSize) / 2;
  const mask = new Float32Array(size * size);
  const albedo = new Float32Array(size * size);
  for (let py = 0; py < size; py++) {
    const y = Math.floor((py + 0.5 - offset) / cell);
    for (let px = 0; px < size; px++) {
      const x = Math.floor((px + 0.5 - offset) / cell);
      if (x < 0 || y < 0 || x >= artSize || y >= artSize || !filled(x, y)) continue;
      mask[py * size + px] = 1;
      albedo[py * size + px] = albedoOf(x, y);
    }
  }

  // Softened outline: a slightly blurred mask, cut at one half with about a pixel of antialiasing.
  const soft = blur(mask, size, cell * 0.2);
  // Surface tone, blurred only among filled pixels (normalized), so the edge doesn't darken.
  const tone = blur(albedo, size, cell * 0.12);
  const toneWeight = blur(mask, size, cell * 0.12);
  // Height: a tight bevel at the edges plus a broad dome over the whole head.
  const bevel = blur(mask, size, cell * 0.45);
  const dome = blur(mask, size, cell * 1.6);
  const height = (i: number) => bevel[i]! * 0.55 + dome[i]! * 0.45;
  const relief = cell * 1.8;

  // Unit vector toward the light: up, left, and toward the viewer.
  const light = [-0.48, -0.56, 0.68];
  const norm = Math.hypot(light[0]!, light[1]!, light[2]!);
  const [lx, ly, lz] = light.map((c) => c / norm) as [number, number, number];
  // Blinn-Phong halfway vector with the viewer straight on.
  const hn = Math.hypot(lx, ly, lz + 1);
  const [hx, hy, hz] = [lx / hn, ly / hn, (lz + 1) / hn];

  const data = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = py * size + px;
      const coverage = Math.max(0, Math.min(1, (soft[i]! - 0.5) * 6 + 0.5));
      if (coverage === 0) continue;
      const left = height(px > 0 ? i - 1 : i);
      const right = height(px < size - 1 ? i + 1 : i);
      const up = height(py > 0 ? i - size : i);
      const down = height(py < size - 1 ? i + size : i);
      let nx = -(right - left) * relief;
      let ny = -(down - up) * relief;
      let nz = 1;
      const n = Math.hypot(nx, ny, nz);
      nx /= n;
      ny /= n;
      nz /= n;
      const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
      const specular = Math.max(0, nx * hx + ny * hy + nz * hz) ** 40;
      const weight = toneWeight[i]!;
      const surface = weight > 0.001 ? tone[i]! / weight : ALBEDO.coat;
      const shade = Math.min(1, 0.06 + surface * diffuse * 0.82 + specular * 0.4);
      const gray = Math.round(shade * 255);
      const p = i * 4;
      data[p] = gray;
      data[p + 1] = gray;
      data[p + 2] = gray;
      data[p + 3] = Math.round(coverage * 255);
    }
  }
  return { width: size, height: size, data };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Mascot image failed to load: ${src}`));
    image.src = src;
  });
}

/** Draws an image into a square raster. The art is expected square and padded (content-schema.md). */
function rasterize(image: HTMLImageElement, size = SOURCE_SIZE): Raster | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data };
}

// The model and its still pose never change, so they are computed once and shared (the pose is
// never written to; a spinning renderer draws into its own raster).
let model: VoxelModel | null = null;
let restPose: Raster | null = null;

export interface MascotFrames {
  idle: Raster;
  /** Shown briefly on press. The same raster as `idle` when there is no separate active art. */
  active: Raster;
  /**
   * Present when the visual is a 3D model. Draws it turned `angle` radians about its vertical
   * axis into `into` (overwriting it), so the renderer can spin it. `idle` is then the model at
   * its still pose, `REST_ANGLE`.
   */
  turn?: (angle: number, into: Raster) => void;
}

/** Draws the voxel model of Musty's idle sprite, turned `angle` radians, into `into`. */
function turnMusty(angle: number, into: Raster) {
  model ??= buildVoxelModel(mustyIdle.frames[0]!);
  renderVoxels(model, angle, into, SILHOUETTE_SPAN);
}

/**
 * Turns the content config into rasters. This is the only place that knows about source kinds:
 * swapping the placeholder for real art is a change to `mascotVisual`, nothing else. The
 * placeholder is Musty's idle sprite built into voxels (ADR 0003: drawn in code), which spins.
 */
export async function resolveMascotFrames(source: MascotVisualSource): Promise<MascotFrames> {
  if (source.kind === "procedural-placeholder") {
    if (!restPose) {
      restPose = createRaster(SOURCE_SIZE);
      turnMusty(REST_ANGLE, restPose);
    }
    return { idle: restPose, active: restPose, turn: turnMusty };
  }
  const [idleImage, activeImage] = await Promise.all([
    loadImage(source.idleSrc),
    source.activeSrc ? loadImage(source.activeSrc) : null,
  ]);
  const idle = rasterize(idleImage);
  if (!idle) throw new Error("Mascot image could not be sampled: no 2D canvas");
  const active = (activeImage && rasterize(activeImage)) || idle;
  return { idle, active };
}
