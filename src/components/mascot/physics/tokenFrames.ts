import { toRuns } from "../../../pixel/runs";
import { ROTATION_STEPS, rotateNearest, rotatedSide, type Pixels } from "./raster";
import type { TokenArt } from "./tokenVisual";

/** Canvas can't read `var(--token)`, so palette references resolve to their computed value. */
function resolveColor(color: string): string {
  const token = /^var\((--[\w-]+)\)$/.exec(color)?.[1];
  if (!token) return color;
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || color;
}

export interface TokenFrames {
  /** Device pixels per art pixel. Changing it redraws every frame. */
  setPixelSize(pixel: number): void;
  /** Side length, in device pixels, of every frame. */
  readonly side: number;
  /** A ready-to-blit frame for a variant at a rotation step, drawn on first use. */
  frame(variant: number, step: number): HTMLCanvasElement | undefined;
  release(): void;
}

/**
 * Pre-rendered token images in device pixels: each variant at an integer pixel size, then rotated
 * by nearest-neighbor into ROTATION_STEPS frames. Drawing one is a plain unscaled, unrotated copy
 * at whole-pixel coordinates, so the canvas never smooths or antialiases a token.
 */
export function createTokenFrames(art: TokenArt): TokenFrames {
  let sources: (Pixels | undefined)[] = [];
  let cache = new Map<number, HTMLCanvasElement>();
  let side = 0;

  const setPixelSize = (pixel: number) => {
    const width = art.width * pixel;
    const height = art.height * pixel;
    side = rotatedSide(width, height);
    cache = new Map();
    sources = art.variants.map(({ frame, palette }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx || width === 0 || height === 0) return undefined;
      for (const run of toRuns(frame, palette)) {
        ctx.fillStyle = resolveColor(run.color);
        ctx.fillRect(run.x * pixel, run.y * pixel, run.width * pixel, pixel);
      }
      return ctx.getImageData(0, 0, width, height);
    });
  };

  return {
    setPixelSize,
    get side() {
      return side;
    },
    frame(variant, step) {
      const key = variant * ROTATION_STEPS + step;
      const hit = cache.get(key);
      if (hit) return hit;
      const source = sources[variant];
      if (!source) return undefined;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = side;
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      const out = ctx.createImageData(side, side);
      rotateNearest(source, (step / ROTATION_STEPS) * 2 * Math.PI, out);
      ctx.putImageData(out, 0, 0);
      cache.set(key, canvas);
      return canvas;
    },
    release() {
      sources = [];
      cache = new Map();
    },
  };
}
