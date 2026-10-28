import { describe, expect, it } from "vitest";
import type { SpriteDef } from "../../../pixel/types";
import { mustyIdle } from "../../../pixel/sprites/musty-idle";
import { pixelCircle, tokenArt, tokenVisual, type TokenVisual } from "./tokenVisual";

const sprite: SpriteDef = {
  name: "test-token",
  palette: { g: "var(--color-gold)" },
  frames: [
    [".gg.", "gggg", ".gg."],
    ["g..g", ".gg.", "g..g"],
  ],
};

describe("tokenVisual", () => {
  it("defaults to little pixel mustangs, sized like a 28-44px token", () => {
    expect(tokenVisual).toEqual({ kind: "sprite", sprite: mustyIdle, scale: 2 });
    const art = tokenArt(tokenVisual);
    expect(art.variants).toHaveLength(mustyIdle.frames.length);
    expect(art.variants.every((v) => v.palette === mustyIdle.palette)).toBe(true);
    expect(art.radius * 2).toBeGreaterThanOrEqual(28);
    expect(art.radius * 2).toBeLessThanOrEqual(44);
    expect(Number.isInteger(art.scale)).toBe(true);
  });

  it("draws a symmetric pixel circle with a rim", () => {
    const frame = pixelCircle(9);
    expect(frame).toHaveLength(9);
    for (const row of frame) {
      expect(row).toHaveLength(9);
      expect(row).toBe([...row].reverse().join(""));
    }
    expect([...frame].reverse()).toEqual(frame);
    expect(frame[4]).toBe("kfffffffk");
    expect(frame[0]![0]).toBe(".");
  });

  it("switches to a sprite by changing the visual only", () => {
    const visual: TokenVisual = { kind: "sprite", sprite, scale: 3 };
    const art = tokenArt(visual);
    expect(art.variants).toEqual([
      { frame: sprite.frames[0], palette: sprite.palette },
      { frame: sprite.frames[1], palette: sprite.palette },
    ]);
    expect(art).toMatchObject({ width: 4, height: 3, scale: 3, radius: 6 });
  });
});
