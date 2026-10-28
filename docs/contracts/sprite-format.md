# Sprite format

Types: [`src/pixel/types.ts`](../../src/pixel/types.ts). Why code-rendered: [ADR 0003](../decisions/0003-code-rendered-pixel-art.md).

## Shape

A sprite is a palette plus one or more frames. A frame is rows of text, one character per pixel.

```ts
export const mustyIdle: SpriteDef = {
  name: "musty-idle",
  palette: {
    k: "var(--color-ink)",
    g: "var(--color-poly)",
    y: "var(--color-gold-bright)",
  },
  frames: [
    ["..kk..", ".kggk.", "kgyygk", ".kggk.", "..kk.."],
    ["......", "..kk..", ".kggk.", "kgyygk", ".kggk."],
  ],
  fps: 4,
};
```

## Rules

The engine's `validateSprite` enforces each of these, with a unit test per rule.

1. `.` is transparent and is never a palette key.
2. Palette keys are exactly one character. Every character used in a frame must be in the palette.
3. Every row in every frame has the same length, and every frame has the same number of rows.
4. Sprites are at most **64×64** pixels. Larger art is composed from several sprites in a scene.
5. `name` is unique and kebab-case.
6. Colors should be token references (`var(--color-*)`). Raw hex is allowed only for colors the
   design system doesn't have, such as skin tones and wood.

## Rendering

- Output is one `<svg>` with `viewBox="0 0 {width} {height}"` and `shape-rendering="crispEdges"`.
- Horizontal runs of the same color in a row merge into a single `<rect>` (`PixelRun`). This keeps
  rect counts low.
- Size is set by an integer `scale` prop (CSS pixels per sprite pixel). Non-integer scales blur the
  edges and are not allowed.
- Decorative sprites get `aria-hidden="true"`. Meaningful ones get `role="img"` and an
  `aria-label`.

## Animation

- Frames step; they never tween. Multi-frame sprites swap frames at `fps`.
- Under `prefers-reduced-motion: reduce`, sprites show frame 0 and don't animate.
- Sprites outside the viewport pause.

## Art from the artist

The artist delivers PNGs at 1× scale (one image pixel = one sprite pixel), each frame as a
separate file or as a horizontal strip with a stated frame width, on a transparent background.
Palette: 8 to 12 colors. A conversion script turns PNGs into `SpriteDef` source files so art
changes show up as reviewable text diffs.

Requested frames for Musty: idle (2), walk (4), sitting at a laptop (1), celebrate (2). Accessories
(hats, headphones) as separate layered sprites.
