import { afterEach, describe, expect, it, vi } from "vitest";
import { mascotVisual } from "../../content/mascot";
import { luminance, sampleAt, type Raster } from "./sampling";
import { mustyIdle } from "../../pixel/sprites/musty-idle";
import { artToRaster, createPlaceholderRaster, resolveMascotFrames, SOURCE_SIZE } from "./source";

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

  const art = mustyIdle.frames[0]!;
  const ART = art.length;
  /** The raster pixel at the center of sprite pixel (x, y). */
  const atArt = (r: Raster, x: number, y: number) => {
    const c = artToRaster(x, y, ART, r.width);
    return pixel(r, c.x / r.width, c.y / r.height);
  };

  it.each([128, SOURCE_SIZE])(
    "is the silhouette of musty-idle at %ipx: opaque on its pixels, clear off them",
    (size) => {
      const r = size === 128 ? raster : createPlaceholderRaster(size);
      expect(art).toHaveLength(16);
      for (let y = 0; y < ART; y++) {
        for (let x = 0; x < ART; x++) {
          const expected = art[y]![x] === "." ? 0 : 255;
          expect(atArt(r, x, y).alpha, `sprite pixel ${x},${y}`).toBe(expected);
        }
      }
    },
  );

  it("leaves a clear margin around the head", () => {
    for (const [u, v] of [
      [0, 0],
      [0.99, 0.99],
      [0.02, 0.5],
      [0.5, 0.98],
      [0.98, 0.5],
      [0.5, 0.02],
    ] as const) {
      expect(pixel(raster, u, v).alpha, `${u},${v}`).toBe(0);
    }
  });

  it("antialiases the outline instead of a hard stair-step", () => {
    const alphas = new Set<number>();
    for (let i = 3; i < raster.data.length; i += 4) alphas.add(raster.data[i]!);
    expect([...alphas].some((a) => a > 0 && a < 255)).toBe(true);
  });

  it.each([128, SOURCE_SIZE])(
    "is lit from the upper left at %ipx: left and top edges brighter than right and bottom",
    (size) => {
      const r = size === 128 ? raster : createPlaceholderRaster(size);
      // Row 7 runs from the back of the neck (x 1) to the muzzle (x 15); column 7 from the
      // forelock (y 1) to the throat (y 15). All four ends are outline ink, so only light differs.
      expect(art[7]![1]).toBe("k");
      expect(art[7]![15]).toBe("k");
      expect(art[1]![7]).toBe("k");
      expect(art[15]![7]).toBe("k");
      expect(atArt(r, 1, 7).lum - atArt(r, 15, 7).lum).toBeGreaterThan(0.25);
      expect(atArt(r, 7, 1).lum - atArt(r, 7, 15).lum).toBeGreaterThan(0.25);
    },
  );

  it("keeps the eye dark, so the face reads", () => {
    expect(art[6]!.slice(6, 8)).toBe("kk");
    expect(art[6]![10]).toBe("g");
    const eye = atArt(raster, 6, 6).lum;
    const cheek = atArt(raster, 10, 6).lum;
    expect(eye).toBeLessThan(cheek * 0.5);
  });

  it("has a smooth range of tones, so every glyph in the ramp gets used", () => {
    const tones = new Set<number>();
    for (let i = 0; i < raster.data.length; i += 4) {
      if (raster.data[i + 3] === 255) tones.add(raster.data[i]!);
    }
    expect(tones.size).toBeGreaterThan(100);
  });

  it("samples as an edge at the outline and as interior inside the head", () => {
    // Reach one sprite pixel, so the outline's neighbors are off the head.
    const at = (x: number, y: number) => {
      const c = artToRaster(x, y, ART, raster.width);
      return sampleAt(raster, c.x / raster.width, c.y / raster.height, c.cell / raster.width)!;
    };
    expect(at(10, 7).edge).toBe(false);
    expect(at(1, 7).edge).toBe(true);
    expect(at(15, 7).edge).toBe(true);
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
    // About 0.8 s on a quiet machine, so the default 5 s limit fails under heavy load (seen: a
    // full-suite run next to several browser test runs). A real hang still fails at 30 s.
  }, 30_000);

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
