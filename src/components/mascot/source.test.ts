import { afterEach, describe, expect, it, vi } from "vitest";
import { mascotVisual } from "../../content/mascot";
import { luminance, sampleAt, type Raster } from "./sampling";
import { createPlaceholderRaster, resolveMascotFrames, SOURCE_SIZE } from "./source";

const pixel = (r: Raster, u: number, v: number) => {
  const i = (Math.floor(v * r.height) * r.width + Math.floor(u * r.width)) * 4;
  return {
    alpha: r.data[i + 3]!,
    lum: luminance(r.data[i]!, r.data[i + 1]!, r.data[i + 2]!),
  };
};

describe("createPlaceholderRaster", () => {
  const raster = createPlaceholderRaster(128);

  it("is a square RGBA raster of the requested size", () => {
    expect(raster.width).toBe(128);
    expect(raster.height).toBe(128);
    expect(raster.data).toHaveLength(128 * 128 * 4);
    expect(createPlaceholderRaster().width).toBe(SOURCE_SIZE);
  });

  it("is a centered disc: opaque inside, transparent in the corners and margins", () => {
    expect(pixel(raster, 0.5, 0.5).alpha).toBe(255);
    for (const [u, v] of [
      [0, 0],
      [0.99, 0.99],
      [0.05, 0.5],
      [0.5, 0.95],
    ] as const) {
      expect(pixel(raster, u, v).alpha, `${u},${v}`).toBe(0);
    }
  });

  it("antialiases the rim instead of a hard stair-step", () => {
    const alphas = new Set<number>();
    for (let i = 3; i < raster.data.length; i += 4) alphas.add(raster.data[i]!);
    expect([...alphas].some((a) => a > 0 && a < 255)).toBe(true);
  });

  it("is shaded like a lit sphere: bright upper left, dark lower right", () => {
    const lit = pixel(raster, 0.36, 0.33).lum;
    const middle = pixel(raster, 0.5, 0.5).lum;
    const shadow = pixel(raster, 0.72, 0.75).lum;
    expect(lit).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(shadow);
    expect(lit - shadow).toBeGreaterThan(0.6);
  });

  it("has a smooth range of tones, so every glyph in the ramp gets used", () => {
    const tones = new Set<number>();
    for (let i = 0; i < raster.data.length; i += 4) {
      if (raster.data[i + 3] === 255) tones.add(raster.data[i]!);
    }
    expect(tones.size).toBeGreaterThan(100);
  });

  it("samples as an edge at the rim and as interior at the center", () => {
    expect(sampleAt(raster, 0.5, 0.5, 0.02)!.edge).toBe(false);
    expect(sampleAt(raster, 0.5, 0.105, 0.02)!.edge).toBe(true);
  });
});

describe("resolveMascotFrames", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("the content config is the placeholder until approved art exists", () => {
    expect(mascotVisual).toEqual({ kind: "procedural-placeholder" });
  });

  it("resolves the placeholder to one shared raster for idle and active", async () => {
    const frames = await resolveMascotFrames({ kind: "procedural-placeholder" });
    expect(frames.idle).toBe(frames.active);
    expect(frames.idle.width).toBe(SOURCE_SIZE);
    const again = await resolveMascotFrames({ kind: "procedural-placeholder" });
    expect(again.idle).toBe(frames.idle);
  });

  it("loads image sources by config alone: idle, and active when given", async () => {
    const loaded: string[] = [];
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        decoding = "";
        set src(value: string) {
          loaded.push(value);
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const data = new Uint8ClampedArray(SOURCE_SIZE * SOURCE_SIZE * 4);
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          drawImage() {},
          getImageData: () => ({ data }),
        }) as unknown as CanvasRenderingContext2D,
    );

    try {
      const both = await resolveMascotFrames({
        kind: "image",
        idleSrc: "/mascot/idle.png",
        activeSrc: "/mascot/active.png",
      });
      expect(loaded).toEqual(["/mascot/idle.png", "/mascot/active.png"]);
      expect(both.active).not.toBe(both.idle);
      expect(both.idle.width).toBe(SOURCE_SIZE);

      const idleOnly = await resolveMascotFrames({ kind: "image", idleSrc: "/mascot/idle.png" });
      expect(idleOnly.active).toBe(idleOnly.idle);
    } finally {
      getContext.mockRestore();
    }
  });

  it("rejects when an image fails to load", async () => {
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    await expect(resolveMascotFrames({ kind: "image", idleSrc: "/missing.png" })).rejects.toThrow(
      /missing\.png/,
    );
  });
});
