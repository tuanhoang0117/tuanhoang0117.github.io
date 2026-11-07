import type { MascotVisualSource } from "../../content/types";
import { mustyIdle } from "../../pixel/sprites/musty-idle";
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
