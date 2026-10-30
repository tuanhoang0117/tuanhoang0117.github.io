import { describe, expect, it } from "vitest";
import type { SpriteDef } from "../../../pixel/types";
import { costumedSprites, sprites } from "../../../pixel/sprites";
import { horseTrot } from "../../../pixel/sprites/horse-trot";
import { mustyIdle } from "../../../pixel/sprites/musty-idle";
import {
  COSTUME_EVERY,
  pixelCircle,
  tokenArt,
  tokenVisual,
  type TokenVariant,
  type TokenVisual,
} from "./tokenVisual";

/** A small seeded generator (mulberry32), so "random" token mixes are repeatable in tests. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The costumed sprite a variant was drawn from, or undefined for a plain head or horse. */
const costumeOf = (variant: TokenVariant) =>
  costumedSprites.find(
    (s) => s.palette === variant.palette && s.frames.some((f) => f === variant.frame),
  );

const sprite: SpriteDef = {
  name: "test-token",
  palette: { g: "var(--color-gold)" },
  frames: [
    [".gg.", "gggg", ".gg."],
    ["g..g", ".gg.", "g..g"],
  ],
};

const TOKEN_REF = /^var\(--color-[a-z0-9-]+\)$/;

// The plain mix: the default before costumes, and still what fills two tokens in three.
const plainMix: TokenVisual = { kind: "sprites", sprites: [mustyIdle, horseTrot], scale: 2 };

describe("tokenVisual", () => {
  it("mixes the mustang head and the four-legged horse, every frame of both", () => {
    const art = tokenArt(plainMix);
    expect(art.variants.map((v) => v.frame)).toEqual([
      mustyIdle.frames[0],
      horseTrot.frames[0],
      mustyIdle.frames[1],
      horseTrot.frames[1],
    ]);
  });

  it("alternates sprites, so consecutive tokens are a head, then a horse", () => {
    // PhysicsOverlay hands out variants in order, wrapping around.
    const palettes = tokenArt(plainMix).variants.map((v) => v.palette);
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

describe("costumed tokens", () => {
  it("is the default: the head and the horse, plus every costume, at the same scale", () => {
    expect(tokenVisual).toEqual({
      kind: "costumed",
      sprites: [mustyIdle, horseTrot],
      costumes: costumedSprites,
      scale: 2,
    });
    expect(costumedSprites).toHaveLength(10);
  });

  it("keeps token size, scale and collision radius exactly as before costumes", () => {
    const before = tokenArt(plainMix);
    const after = tokenArt(tokenVisual, seeded(1));
    for (const key of ["width", "height", "scale", "radius"] as const) {
      expect(after[key], key).toBe(before[key]);
    }
  });

  it.each([1, 2, 3, 42])("dresses exactly one token in every three (seed %i)", (seed) => {
    const { variants } = tokenArt(tokenVisual, seeded(seed));
    expect(variants).toHaveLength(COSTUME_EVERY * costumedSprites.length);
    for (let i = 0; i < variants.length; i += COSTUME_EVERY) {
      const run = variants.slice(i, i + COSTUME_EVERY);
      expect(run.filter((v) => costumeOf(v)).length, `tokens ${i}-${i + 2}`).toBe(1);
    }
  });

  it("shows every costume once per cycle, each as one of its own frames", () => {
    const worn = tokenArt(tokenVisual, seeded(7))
      .variants.map(costumeOf)
      .filter((s) => s !== undefined);
    expect(new Set(worn)).toEqual(new Set(costumedSprites));
    expect(worn).toHaveLength(costumedSprites.length);
  });

  it("keeps the plain tokens alternating head, horse, through every frame of both", () => {
    const plain = tokenArt(tokenVisual, seeded(3)).variants.filter((v) => !costumeOf(v));
    const cycle = tokenArt(plainMix).variants;
    expect(plain).toEqual(plain.map((_, i) => cycle[i % cycle.length]));
  });

  it("takes its randomness from the injected source, so a seed repeats exactly", () => {
    const names = (seed: number) =>
      tokenArt(tokenVisual, seeded(seed)).variants.map((v) => costumeOf(v)?.name ?? "plain");
    expect(names(5)).toEqual(names(5));
    expect(names(5)).not.toEqual(names(6));
  });

  it("puts costumes in different spots and orders for different random sources", () => {
    const spots = new Set<string>();
    const orders = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const { variants } = tokenArt(tokenVisual, seeded(seed));
      spots.add(variants.map((v) => (costumeOf(v) ? "C" : "p")).join(""));
      orders.add(
        variants
          .map((v) => costumeOf(v)?.name)
          .filter((name) => name !== undefined)
          .join(","),
      );
    }
    expect(spots.size).toBeGreaterThan(1);
    expect(orders.size).toBeGreaterThan(1);
  });

  it("survives a source that returns 0 or the top of its range", () => {
    for (const random of [() => 0, () => 0.999999999, () => 1]) {
      const { variants } = tokenArt(tokenVisual, random);
      expect(variants).toHaveLength(COSTUME_EVERY * costumedSprites.length);
      for (const v of variants) {
        expect(v.frame).toBeDefined();
        expect(v.palette).toBeDefined();
      }
    }
  });

  it("refuses a costume of a different size than the plain tokens", () => {
    const wide: SpriteDef = { name: "wide", palette: sprite.palette, frames: [["ggggg"]] };
    expect(() =>
      tokenArt({ kind: "costumed", sprites: [sprite], costumes: [wide], scale: 1 }, seeded(1)),
    ).toThrow(/test-token is 4×3, wide is 5×1/);
  });

  it("falls back to the plain mix when there are no costumes", () => {
    const art = tokenArt({ ...plainMix, kind: "costumed", costumes: [] }, seeded(1));
    expect(art.variants).toEqual(tokenArt(plainMix).variants);
  });
});
