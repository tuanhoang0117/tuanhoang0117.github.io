# Design system

Light, warm, and **digitally rendered**: graph paper, hard pixel edges, terminal labels, and
code-drawn pixel art. Reference: the [/story](https://www.quackhacks.org/story),
[/quackpost](https://www.quackhacks.org/quackpost), and
[/signup](https://www.quackhacks.org/signup) pages of quackhacks.org (not its dark homepage).

Tokens live in [`src/styles/index.css`](../src/styles/index.css) under `@theme` and are exposed
as Tailwind utilities (`bg-poly`, `font-display`, `shadow-block`, ...). Use tokens only. A raw hex
value or arbitrary `[...]` value in a component is a review blocker.

## The six rules

1. **The pixel is the unit.** Spacing, borders, and shadow offsets snap to Tailwind's 4px scale.
   No arbitrary spacing.
2. **No blur, ever.** Shadows are solid offset blocks (`shadow-block-sm` / `shadow-block` /
   `shadow-block-lg`). No `blur-*`, no soft `shadow-md`. Sprites render with `crispEdges`;
   raster pixel art uses `pixelated`.
3. **Three type voices** (plus one accent):
   - `font-display` + `text-outline`: giant hollow headings ("PORTFOLIO"). Page titles only.
   - `font-sans`: everything people read.
   - `font-mono` / `label-mono` / `prompt`: system voice, like `CHAPTER 01`, `>>> prompt`, tags.
   - `font-pixel`: tiny accents only (badges, Musty's speech). Never body text.
4. **Pixel art animates in frames.** Use `steps()` timing (`ease-step-2`, `ease-step-4`) or frame
   swapping. Smooth easing is for UI feedback only (hover lifts), never for sprites.
5. **Graph paper + grain** (`bg-graph`) is the page background. Cards sit on it as `bg-card`
   or a tint.
6. **Game-UI language.** Categories use colored glyphs (■ ▲ ◆ ● ✚ in `glyph-*` colors).
   Numbered labels (`01 — Hackathons`), stickers, badges, progress bars.

## Color

| Token                              | Use                                                               |
| ---------------------------------- | ----------------------------------------------------------------- |
| `paper`, `paper-deep`              | Page and footer backgrounds                                       |
| `card`                             | Card surfaces                                                     |
| `ink`, `ink-muted`, `ink-faint`    | Text, borders, shadows. `ink-faint` is never body text (contrast) |
| `poly`, `poly-bright`              | Primary brand, section labels, prompt arrows                      |
| `gold`, `gold-bright`              | Primary buttons, focus ring, highlights                           |
| `tint-peach/butter/mint/sky/lilac` | Archive columns, card washes (one per hackathon)                  |
| `glyph-red/blue/orange/purple`     | Category glyphs only                                              |

## Motion

- Content is never gated behind scrolling ([ADR 0002](decisions/0002-no-scroll-gated-content.md)).
- Hover feedback: lift `-translate-x-0.5 -translate-y-0.5` against a block shadow.
- Page transitions (planned): pixel dissolve, under 400ms.
- `prefers-reduced-motion` disables animation globally. Content must still be complete.

## Accessibility floor

- Text contrast of at least 4.5:1, checked by axe in CI.
- Every interactive element is keyboard reachable with the gold focus ring.
- Decorative sprites are `aria-hidden`. Meaningful images have real alt text.
- No horizontal overflow at 375px wide, checked in CI.
