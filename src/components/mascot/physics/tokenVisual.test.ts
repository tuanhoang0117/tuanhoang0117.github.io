import { describe, expect, it } from "vitest";
import type { SpriteDef } from "../../../pixel/types";
import { sprites } from "../../../pixel/sprites";
import { horseTrot } from "../../../pixel/sprites/horse-trot";
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

const TOKEN_REF = /^var\(--color-[a-z0-9-]+\)$/;

describe("tokenVisual", () => {
  it("defaults to the mustang head and the four-legged horse, every frame of both", () => {
    expect(tokenVisual).toEqual({ kind: "sprites", sprites: [mustyIdle, horseTrot], scale: 2 });
    const art = tokenArt(tokenVisual);
    expect(art.variants.map((v) => v.frame)).toEqual([
      mustyIdle.frames[0],
      horseTrot.frames[0],
      mustyIdle.frames[1],
      horseTrot.frames[1],
    ]);
  });

  it("alternates sprites, so consecutive tokens are a head, then a horse", () => {
    // PhysicsOverlay hands out variants in order, wrapping around.
    const palettes = tokenArt(tokenVisual).variants.map((v) => v.palette);
    expect(palettes).toEqual([
      mustyIdle.palette,
      horseTrot.palette,
      mustyIdle.palette,
      horseTrot.palette,
    ]);
  });

  it("sizes every default token at 28-44px with an integer scale", () => {
    const art = tokenArt(tokenVisual);
    expect(art.radius * 2).toBeGreaterThanOrEqual(28);
    expect(art.radius * 2).toBeLessThanOrEqual(44);
    expect(Number.isInteger(art.scale)).toBe(true);
    for (const { frame } of art.variants) {
      expect(frame).toHaveLength(art.height);
      for (const row of frame) expect(row).toHaveLength(art.width);
    }
  });

  it("interleaves sprites with different frame counts without dropping a frame", () => {
    const one: SpriteDef = { name: "one", palette: sprite.palette, frames: [sprite.frames[0]!] };
    const art = tokenArt({ kind: "sprites", sprites: [one, sprite], scale: 1 });
    expect(art.variants.map((v) => v.frame)).toEqual([
      sprite.frames[0],
      sprite.frames[0],
      sprite.frames[1],
    ]);
  });

  it("refuses sprites of different sizes, which would share one frame size and radius", () => {
    const wide: SpriteDef = { name: "wide", palette: sprite.palette, frames: [["ggggg"]] };
    expect(() => tokenArt({ kind: "sprites", sprites: [sprite, wide], scale: 1 })).toThrow(
      /test-token is 4×3, wide is 5×1/,
    );
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

describe("horse-trot, the four-legged horse token", () => {
  it("is registered, so /lab renders it and the registry test validates it", () => {
    expect(sprites).toContain(horseTrot);
    expect(horseTrot.name).toBe("horse-trot");
  });

  it("is 16×16 in every frame, the same size as the mustang head", () => {
    for (const frame of [...horseTrot.frames, ...mustyIdle.frames]) {
      expect(frame).toHaveLength(16);
      for (const row of frame) expect(row).toHaveLength(16);
    }
  });

  it("uses design token colors only", () => {
    for (const color of Object.values(horseTrot.palette)) expect(color).toMatch(TOKEN_REF);
  });

  it("stands on four separate legs, in side view, head up and to the right", () => {
    for (const frame of horseTrot.frames) {
      // The two rows under the belly cross every leg: four single coat pixels, ink between.
      for (const row of [frame[12]!, frame[13]!]) {
        expect(row.match(/b+/g)).toEqual(["b", "b", "b", "b"]);
      }
      // Ears and head sit in the upper right; nothing else is that high.
      for (const row of frame.slice(0, 6)) expect(row.slice(0, 8)).toBe("........");
    }
  });

  it("trots: the second frame lifts a diagonal pair of hooves", () => {
    const [down, up] = horseTrot.frames;
    expect(up).not.toEqual(down);
    expect(down![15]!.match(/k+/g)).toHaveLength(2);
    expect(up![15]).not.toBe(down![15]);
  });
});
