import { describe, expect, it } from "vitest";
import type { SpriteDef } from "../../types";
import { validateSprite } from "../../validate";
import { horseTrot, mustyIdle, sprites } from "..";
import { costumedSprites, horseSportsJersey } from ".";

const TOKEN_REF = /^var\(--color-[a-z0-9-]+\)$/;

const onMusty = [
  "cowboy-hat",
  "aviator-goggles",
  "safety-goggles",
  "round-glasses",
  "sunglasses",
  "volleyball-headband",
  "graduation-cap",
  "headphones",
  "party-hat",
];

const baseOf = (sprite: SpriteDef) =>
  sprite.name.startsWith(`${horseTrot.name}-`) ? horseTrot : mustyIdle;

describe("costumed sprites", () => {
  it("are the ten requested costumes: nine on musty-idle, the jersey on horse-trot", () => {
    expect(costumedSprites.map((s) => s.name)).toEqual([
      ...onMusty.map((c) => `musty-idle-${c}`),
      "horse-trot-sports-jersey",
    ]);
    expect(horseSportsJersey.name).toBe("horse-trot-sports-jersey");
  });

  it("are all registered, so /lab shows them and the registry test validates them", () => {
    for (const sprite of costumedSprites) expect(sprites).toContain(sprite);
  });

  describe.each(costumedSprites.map((s) => [s.name, s] as const))("%s", (_, sprite) => {
    const base = baseOf(sprite);

    it("passes validateSprite", () => {
      expect(validateSprite(sprite)).toEqual([]);
    });

    it("uses design token colors only", () => {
      for (const color of Object.values(sprite.palette)) expect(color).toMatch(TOKEN_REF);
    });

    it("keeps its base's size, frames and rate, so it animates and fits a token", () => {
      expect(sprite.frames).toHaveLength(base.frames.length);
      expect(sprite.fps).toBe(base.fps);
      for (const frame of sprite.frames) {
        expect(frame).toHaveLength(16);
        for (const row of frame) expect(row).toHaveLength(16);
      }
    });

    it("visibly changes every frame of its base", () => {
      sprite.frames.forEach((frame, f) => expect(frame).not.toEqual(base.frames[f]));
    });
  });
});
