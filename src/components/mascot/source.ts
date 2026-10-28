import type { MascotVisualSource } from "../../content/types";
import type { Raster } from "./sampling";

/** Rasters are sampled at this size: enough detail for the densest grid, cheap to keep. */
export const SOURCE_SIZE = 384;

/**
 * The placeholder visual: a shaded sphere, lit from the upper left, in grayscale. It stands in
 * for the mustang art until Tuan supplies it. Shading matters more than shape here: the glyph
 * renderer turns the luminance into depth, so a flat disc would hide whether that works.
 * Drawn with plain math rather than a canvas, so it is identical everywhere and testable.
 */
export function createPlaceholderRaster(size = SOURCE_SIZE): Raster {
  const data = new Uint8ClampedArray(size * size * 4);
  const radius = size * 0.4;
  const center = size / 2;
  // Unit vector toward the light: up, left, and toward the viewer.
  const light = [-0.48, -0.56, 0.68];
  const norm = Math.hypot(light[0]!, light[1]!, light[2]!);
  const [lx, ly, lz] = light.map((c) => c / norm) as [number, number, number];

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const nx = (px + 0.5 - center) / radius;
      const ny = (py + 0.5 - center) / radius;
      const d2 = nx * nx + ny * ny;
      // One pixel of antialiasing at the rim, so the edge isn't jagged when sampled finely.
      const coverage = Math.max(0, Math.min(1, (1 - Math.sqrt(d2)) * radius + 0.5));
      if (coverage === 0) continue;
      const nz = Math.sqrt(Math.max(0, 1 - d2));
      const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
      // Blinn-Phong highlight with the viewer straight on.
      const hx = lx;
      const hy = ly;
      const hz = lz + 1;
      const hn = Math.hypot(hx, hy, hz);
      const specular = Math.max(0, (nx * hx + ny * hy + nz * hz) / hn) ** 40;
      const shade = Math.min(1, 0.06 + diffuse * 0.82 + specular * 0.5);
      const i = (py * size + px) * 4;
      const gray = Math.round(shade * 255);
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
      data[i + 3] = Math.round(coverage * 255);
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

// The placeholder never changes, so it is computed once and shared (it is never written to).
let placeholder: Raster | null = null;

export interface MascotFrames {
  idle: Raster;
  /** Shown briefly on press. The same raster as `idle` when there is no separate active art. */
  active: Raster;
}

/**
 * Turns the content config into rasters. This is the only place that knows about source kinds:
 * swapping the placeholder for real art is a change to `mascotVisual`, nothing else.
 */
export async function resolveMascotFrames(source: MascotVisualSource): Promise<MascotFrames> {
  if (source.kind === "procedural-placeholder") {
    const idle = (placeholder ??= createPlaceholderRaster());
    return { idle, active: idle };
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
