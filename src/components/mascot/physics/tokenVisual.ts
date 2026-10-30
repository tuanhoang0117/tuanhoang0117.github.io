import type { Frame, Palette, SpriteDef } from "../../../pixel/types";
import { costumedSprites } from "../../../pixel/sprites/costumes";
import { horseTrot } from "../../../pixel/sprites/horse-trot";
import { mustyIdle } from "../../../pixel/sprites/musty-idle";
import { pixelsOf } from "../../../pixel/validate";

/**
 * What a falling token looks like. Placeholder art is a pixel circle per color; the final mustang
 * token art is a sprite. Changing `tokenVisual` below is the only change needed to switch.
 *
 * - `circles`: a `pixels`-wide pixel circle with an ink rim, one variant per fill color.
 * - `sprite`: every frame of the sprite is a variant (tokens cycle through them).
 * - `sprites`: the frames of several same-sized sprites, interleaved so consecutive tokens
 *   alternate between sprites: frame 0 of each, then frame 1 of each, and so on.
 * - `costumed`: `sprites` as above, with one token in every three swapped for a costumed sprite
 *   (a random frame of it). Each costume appears once per cycle, in a random order.
 *
 * `scale` is the integer CSS-pixel size of one art pixel, so tokens stay pixel-crisp.
 */
export type TokenVisual =
  | { kind: "circles"; colors: readonly string[]; pixels: number; scale: number }
  | { kind: "sprite"; sprite: SpriteDef; scale: number }
  | { kind: "sprites"; sprites: readonly SpriteDef[]; scale: number }
  | {
      kind: "costumed";
      sprites: readonly SpriteDef[];
      costumes: readonly SpriteDef[];
      scale: number;
    };

/**
 * Tokens are little pixel mustangs (owner request, 2026-10-27): Musty's head and a four-legged
 * horse (owner request, 2026-10-28), alternating, each through its own frames. One in three
 * wears a costume (owner request, 2026-10-29).
 */
export const tokenVisual: TokenVisual = {
  kind: "costumed",
  sprites: [mustyIdle, horseTrot],
  costumes: costumedSprites,
  scale: 2,
};

/** In the `costumed` visual, one token in this many wears a costume. */
export const COSTUME_EVERY = 3;

/** One drawable look for a token: a pixel frame and its palette. */
export interface TokenVariant {
  frame: Frame;
  palette: Palette;
}

export interface TokenArt {
  variants: readonly TokenVariant[];
  /** Native size in art pixels. */
  width: number;
  height: number;
  scale: number;
  /** Collision radius in CSS pixels. */
  radius: number;
}

const FILL = "f";
const RIM = "k";

/** A filled pixel circle: "f" inside, "k" on the edge, "." outside. */
export function pixelCircle(pixels: number): Frame {
  const r = pixels / 2;
  const inside = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < pixels &&
    y < pixels &&
    (x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 <= r * r;
  const rows: string[] = [];
  for (let y = 0; y < pixels; y++) {
    let row = "";
    for (let x = 0; x < pixels; x++) {
      if (!inside(x, y)) row += ".";
      else {
        const edge =
          !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        row += edge ? RIM : FILL;
      }
    }
    rows.push(row);
  }
  return rows;
}

const sizeOf = (sprite: SpriteDef) => {
  const first = sprite.frames[0] ?? [];
  return `${first[0] === undefined ? 0 : pixelsOf(first[0]).length}×${first.length}`;
};

/** Every variant is drawn into one frame size and collides with one radius. */
function assertOneSize(sprites: readonly SpriteDef[]): void {
  const [first] = sprites;
  const odd = sprites.find((sprite) => sizeOf(sprite) !== sizeOf(first!));
  if (first && odd) {
    throw new Error(
      `Token sprites must share one size: ${first.name} is ${sizeOf(first)}, ` +
        `${odd.name} is ${sizeOf(odd)}.`,
    );
  }
}

/** Frame 0 of every sprite, then frame 1 of every sprite that has one, and so on. */
function interleave(sprites: readonly SpriteDef[]): TokenVariant[] {
  assertOneSize(sprites);
  const variants: TokenVariant[] = [];
  const longest = Math.max(0, ...sprites.map((sprite) => sprite.frames.length));
  for (let i = 0; i < longest; i++) {
    for (const { frames, palette } of sprites) {
      const frame = frames[i];
      if (frame) variants.push({ frame, palette });
    }
  }
  return variants;
}

/** A whole number in [0, n), from a source like Math.random. */
const pick = (random: () => number, n: number) =>
  Math.min(n - 1, Math.max(0, Math.floor(random() * n)));

/**
 * The plain variants in order, with a costumed one at a random spot in every run of
 * COSTUME_EVERY. PhysicsOverlay hands variants out in order and wraps around, so this list is one
 * cycle: every costume once, shuffled.
 */
function mixCostumes(
  sprites: readonly SpriteDef[],
  costumes: readonly SpriteDef[],
  random: () => number,
): TokenVariant[] {
  assertOneSize([...sprites, ...costumes]);
  const plain = interleave(sprites);
  if (costumes.length === 0 || plain.length === 0) return plain;

  const deck = [...costumes];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = pick(random, i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }

  const variants: TokenVariant[] = [];
  let next = 0;
  for (const { frames, palette } of deck) {
    const spot = pick(random, COSTUME_EVERY);
    for (let i = 0; i < COSTUME_EVERY; i++) {
      if (i === spot) variants.push({ frame: frames[pick(random, frames.length)]!, palette });
      else variants.push(plain[next++ % plain.length]!);
    }
  }
  return variants;
}

/** `random` (Math.random by default) shuffles and places the costumes; tests pass a fixed one. */
export function tokenArt(visual: TokenVisual, random: () => number = Math.random): TokenArt {
  const scale = Math.max(1, Math.round(visual.scale));
  let variants: TokenVariant[];
  if (visual.kind === "circles") {
    const frame = pixelCircle(visual.pixels);
    variants = visual.colors.map((color) => ({
      frame,
      palette: { [FILL]: color, [RIM]: "var(--color-ink)" },
    }));
  } else if (visual.kind === "costumed") {
    variants = mixCostumes(visual.sprites, visual.costumes, random);
  } else {
    variants = interleave(visual.kind === "sprite" ? [visual.sprite] : visual.sprites);
  }
  const first = variants[0]?.frame ?? [];
  const width = first[0] === undefined ? 0 : pixelsOf(first[0]).length;
  const height = first.length;
  return { variants, width, height, scale, radius: (Math.max(width, height) * scale) / 2 };
}
