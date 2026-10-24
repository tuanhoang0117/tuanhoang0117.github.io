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

The palette is Cal Poly SLO's brand palette. Tokens are named as in the brand guide and live in
[`src/styles/index.css`](../src/styles/index.css). Poly Green and Mustang Gold are the brand;
each page adds an accent pair (see Page themes).

| Group  | Tokens (hex)                                                                                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand  | `poly` Poly Green #154734, `gold` Mustang Gold #BD8B13                                                                                                                                                                  |
| Bright | `poly-bright` Farmers' Market #3A913F, `dexter` #A4D65E, `canyon` Poly Canyon #F2C75C, `stadium` Stadium Gold #F8E08E, `surf` Surf Blue #5CB8B2, `sky` Sky Blue #B5E3D8, `morro` Morro Blue #ABCAE9, `serenity` #D5E4F4 |
| Muted  | `pismo` Pismo Sand #CAC7A7, `mission` Mission Beige #E4E3D3, `sage` Coast Sage #B7CDC2, `sycamore` #789F90, `seal` Seal Gray #54585A, `kennedy` Kennedy Gray #8E9089                                                    |
| Accent | `avocado` #D0DF00, `heritage` Heritage Orange #FF6A39, `cove` Morro Cove #0067B9                                                                                                                                        |

Surfaces and ink stay neutral so the colors read as color: `paper` (page), `paper-deep` (footer,
Mission Beige), `card` (white), `ink`, `ink-muted`, `ink-faint` (never body text).

**Which colors can be text.** On paper or a white card, only `poly` (10:1), `cove` (5.8:1), and
`seal` (7:1) pass WCAG AA for text. Every other palette color is a **fill**: backgrounds, washes,
shadows, borders, glyphs. Ink text on any light fill passes (10:1 or better).
`src/styles/themes.test.ts` checks these ratios.

**Older token names** still work and now point at Cal Poly colors: `gold-bright` → Poly Canyon
(buttons, stickers, selection); `tint-peach/butter/mint/sky/lilac` → Mission, Stadium, Sky, Sky, Serenity
(archive columns). Every tint is light enough for `ink-muted` labels; no Cal Poly green is, so
`mint` shares Sky Blue; `glyph-blue/red/purple/orange` → Cove, Heritage, Surf, Gold. Glyphs
are decorative: they always sit beside their category's text label.

**Focus ring:** 3px `cove` (5.4:1 against paper; WCAG 1.4.11 needs 3:1).

### Block shadows

Hard, unblurred, offset down and right. Sizes: `shadow-block-sm` (3px), `shadow-block` (6px),
`shadow-block-lg` (10px), `shadow-block-xl` (14px). They're ink by default; add any palette color
utility to make an accent shadow: `shadow-block-lg shadow-cove`. On hover, step up one size.
Cards on a page cycle through their page theme's shadow colors (`cardShadow()` in
[`src/styles/themes.ts`](../src/styles/themes.ts)).

### Page themes

Defined in [`src/styles/themes.ts`](../src/styles/themes.ts), so pages import them instead of
picking colors ad hoc.

| Page       | Primary         | Secondary     | Card shadows                 | Wash       | Accent text |
| ---------- | --------------- | ------------- | ---------------------------- | ---------- | ----------- |
| Home       | Poly Green      | Mustang Gold  | poly, gold, poly-bright      | `stadium`  | `poly`      |
| Hackathons | Surf Blue       | Stadium Gold  | surf, canyon, cove, heritage | `sky`      | `cove`      |
| Portfolio  | Dexter Green    | Morro Blue    | dexter, morro, surf, canyon  | `serenity` | `poly`      |
| Resume     | Morro Cove      | Poly Canyon   | cove, canyon, morro          | `serenity` | `cove`      |
| Contact    | Heritage Orange | Mission Beige | heritage, canyon, cove       | `mission`  | `poly`      |

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
