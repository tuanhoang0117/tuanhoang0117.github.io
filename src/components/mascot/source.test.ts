import { afterEach, describe, expect, it, vi } from "vitest";
import { mascotVisual } from "../../content/mascot";
import { resolveMascotFrames, SOURCE_SIZE } from "./source";

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
