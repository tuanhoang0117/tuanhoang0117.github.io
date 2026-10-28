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

**Which colors can be text.** On paper or a white card, only `poly` (10:1), `cove` (5.4:1 on
paper, 5.8:1 on white), and `seal` (6.8:1 on paper) pass WCAG AA for text. On a light **wash**,
only `poly` and `seal` pass: `cove` drops to 4.1–4.5:1, so Morro Cove is never text on a wash.
Every other palette color is a **fill**: backgrounds, washes, shadows, borders, glyphs. Ink text
passes AA on every light fill (5.7:1 or better). On the dark fills (`poly`, `cove`, `seal`), text
is white or paper. The `>>>` prompt arrow is `poly-bright` (3.7:1): a decorative marker before
text that carries the meaning. `src/styles/themes.test.ts` checks these ratios.

**Older token names** still work and now point at Cal Poly colors: `gold-bright` → Poly Canyon
(buttons, stickers, selection); `tint-peach/butter/mint/sky/lilac` → Mission, Stadium, Sky, Sky, Serenity
(archive columns). Every tint is light enough for `ink-muted` labels; no Cal Poly green is, so
`mint` shares Sky Blue; `glyph-blue/red/purple/orange` → Cove, Poly Green, Surf, Heritage (each archive column
accent is distinct). Glyphs
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
| Hackathons | Surf Blue       | Stadium Gold  | surf, canyon, cove, heritage | `sky`      | `poly`      |
| Portfolio  | Dexter Green    | Morro Blue    | dexter, morro, surf, canyon  | `serenity` | `poly`      |
| Resume     | Morro Cove      | Poly Canyon   | cove, canyon, morro          | `serenity` | `poly`      |
| Contact    | Heritage Orange | Mission Beige | heritage, canyon, cove       | `mission`  | `poly`      |

## Motion

Motion decorates content and never gates it ([ADR 0002](decisions/0002-no-scroll-gated-content.md)):
nothing waits for a scroll position, and nothing starts hidden in markup or CSS. Entrances run on
the Web Animations API from [`src/components/motion/`](../src/components/motion/), so the hidden
starting frame exists only inside a running animation. If it never runs, content is simply there.

| Motion          | What moves                                                               | Duration          | Easing                       |
| --------------- | ------------------------------------------------------------------------ | ----------------- | ---------------------------- |
| Route change    | Page content fades in from 0 and rises 8px (`<PageTransition>`)          | 280ms             | `cubic-bezier(0.2, 0, 0, 1)` |
| Card entrance   | Each card is revealed top to bottom as it rises 8px (`<Stagger>`)        | 240ms, 60ms apart | `cubic-bezier(0.2, 0, 0, 1)` |
| Hover and press | Float 4px straight up, shadow one size up; press 2px down, one size down | 200ms             | `ease-out`                   |

- **Route change.** Applied once, in the shell (`Layout.tsx`). There's no exit animation: the old
  page is gone in the same frame the new one appears. The first page of a visit doesn't fade; the
  browser's load is its entrance, and its cards still enter.
  The rise animates `top` on a `position: relative` wrapper, not `transform`: page-level
  animations must not put `transform`, `filter`, `perspective`, `will-change: transform` or
  `contain: paint` on any ancestor of page content, because that makes the ancestor the containing
  block for `position: fixed` elements (the physics overlay, the banner, future modals and toasts)
  and sizes them against the page instead of the window.
- **Card entrances.** Wrap a list in `<Stagger as="ul">`; each direct child enters in turn on
  mount. Delays stop growing after the ninth card (480ms), so long lists don't keep their tail
  waiting. Cards are revealed, not faded, so text is at full contrast at every moment, and an axe
  check run mid-entrance sees the settled colors. The reveal extends 16px past the card so block
  shadows aren't cut off.
- **Hover and press.** Use `cardLift.sm` / `.md` / `.lg` (by resting shadow size) from
  `src/components/motion/motion.ts`, plus any accent shadow color (`cardShadow()`). The size steps
  keep the accent color. Every card uses it. Hover styles apply only with a fine pointer that can
  hover, so a tap never leaves a card raised; keyboard focus on a card, or on a link inside it,
  floats it too.
- **Smooth, not stepped.** These are UI feedback, so they ease smoothly. Sprites still animate in
  frames (rule 4).
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, no entrance runs and content renders
  in its final state. Hover and press don't move the card; the shadow still changes, instantly, as
  feedback.
- Demo and test bench: `/lab/motion`.

## Accessibility floor

- Text contrast of at least 4.5:1, checked by axe in CI. Graph-paper text is also checked by
  `checkContrast` in `e2e/helpers/`, because axe cannot resolve text contrast over the page's gradient background.
- Every interactive element is keyboard reachable with the gold focus ring.
- Decorative sprites are `aria-hidden`. Meaningful images have real alt text.
- No horizontal overflow at 375px wide, checked in CI.
