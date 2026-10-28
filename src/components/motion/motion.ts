/**
 * Site-wide entrance motion (docs/design-system.md → Motion).
 *
 * Entrances use the Web Animations API instead of CSS classes, so the hidden starting frame
 * exists only inside a running animation. Nothing in the markup or stylesheet starts hidden: if
 * the animation never runs (no Web Animations support, reduced motion, or it is cancelled),
 * content is simply visible in its final state (ADR 0002).
 */

/** Route change: the incoming page's content fades in and rises. */
export const PAGE_ENTER_MS = 280;
/** One card's entrance inside a `<Stagger>`. */
export const CARD_ENTER_MS = 240;
/** Gap between consecutive cards in a `<Stagger>`. */
export const STAGGER_STEP_MS = 60;
/**
 * Cards after this index share the last delay, so a long list never keeps its tail waiting
 * (at the default step, the last card starts by 480 ms).
 */
export const STAGGER_MAX_INDEX = 8;
/** Starting offset below the final position: two 4px grid steps. */
export const ENTER_DISTANCE_PX = 8;
/** Smooth ease-out. Entrances are UI feedback, not sprites, so they don't use steps(). */
export const ENTER_EASING = "cubic-bezier(0.2, 0, 0, 1)";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Delay before the card at `index` starts its entrance. */
export function staggerDelay(index: number, step: number = STAGGER_STEP_MS): number {
  return Math.min(Math.max(index, 0), STAGGER_MAX_INDEX) * step;
}

/**
 * Route change: the whole page fades in and rises.
 *
 * The rise animates `top` on a `position: relative` wrapper, never `transform`. A transform (or
 * filter, perspective, will-change: transform, contain: paint) on any ancestor makes it the
 * containing block for `position: fixed` descendants, so the physics overlay and the banner
 * would be sized and placed against the page wrapper instead of the window. A relative offset
 * moves the wrapper visually without creating a containing block or reflowing its siblings.
 */
export const pageKeyframes: Keyframe[] = [
  { opacity: 0, top: `${ENTER_DISTANCE_PX}px` },
  { opacity: 1, top: "0px" },
];

/**
 * How far a card's reveal extends past its border box, so block shadows (up to 14px) and the
 * hover lift are never cut off.
 */
const REVEAL_BLEED = "-16px";

/**
 * Card entrance: each card is revealed top to bottom as it rises. A reveal, not a fade, so
 * whatever part of a card is showing is drawn at full contrast at every moment, and an
 * accessibility check run mid-entrance sees the same colors as the settled page.
 */
export const cardKeyframes: Keyframe[] = [
  {
    clipPath: `inset(${REVEAL_BLEED} ${REVEAL_BLEED} 100% ${REVEAL_BLEED})`,
    transform: `translateY(${ENTER_DISTANCE_PX}px)`,
  },
  { clipPath: `inset(${REVEAL_BLEED})`, transform: "none" },
];

interface EntranceTiming {
  keyframes: Keyframe[];
  duration: number;
  /** Delay between consecutive elements; 0 starts them together. */
  step: number;
}

/**
 * Plays the entrance on each element, one `step` after the previous. Returns the running
 * animations so callers can cancel them on unmount. Under reduced motion, plays nothing.
 *
 * `fill: "backwards"` holds the starting frame only during each element's delay. There is no
 * forwards fill, so once an animation ends the element's own styles apply again.
 */
export function playEntrance(
  elements: readonly Element[],
  { keyframes, duration, step }: EntranceTiming,
) {
  if (prefersReducedMotion()) return [];
  return elements.flatMap((el, index) =>
    typeof el.animate === "function"
      ? [
          el.animate(keyframes, {
            duration,
            delay: staggerDelay(index, step),
            easing: ENTER_EASING,
            fill: "backwards",
          }),
        ]
      : [],
  );
}

/**
 * The float shared by every size: straight up 4px (`-translate-y-1`), no sideways shift, with a
 * soft 200ms ease-out. It runs on hover, on keyboard focus of the card itself
 * (`focus-visible`), and on keyboard focus of a link or button inside it (`has-focus-visible`).
 *
 * Hover is `pointer-fine:hover:`. Tailwind's `hover:` already requires `(hover: hover)`, and
 * `pointer-fine:` adds `(pointer: fine)`, so a touch tap never leaves a card stuck raised.
 *
 * Press pushes the card 2px down. It is written twice: plain `active:` for touch, and
 * `pointer-fine:active:` because Tailwind emits `pointer-fine:hover:` after plain `active:`,
 * so with a mouse the hover rule would otherwise win while the button is held.
 *
 * Movement is `motion-safe` only.
 */
const float =
  "transition duration-200 ease-out motion-safe:pointer-fine:hover:-translate-y-1 motion-safe:focus-visible:-translate-y-1 motion-safe:has-focus-visible:-translate-y-1 motion-safe:active:translate-y-0.5 motion-safe:pointer-fine:active:translate-y-0.5";

/**
 * Shared card hover float and press, by resting shadow size. Raised (see `float`), the block
 * shadow steps up one size so the card reads as lifted off the page; pressed, it steps down one
 * size. Add a shadow color (`shadow-cove`, or `cardShadow()` from src/styles/themes.ts) for an
 * accent shadow: the size utilities keep whatever color is set. Under reduced motion the card
 * doesn't move and the shadow still changes, instantly (index.css cuts transitions to ~0), as
 * feedback. Class names are written out in full so Tailwind generates them.
 */
export const cardLift = {
  sm: `shadow-block-sm pointer-fine:hover:shadow-block focus-visible:shadow-block has-focus-visible:shadow-block active:shadow-none pointer-fine:active:shadow-none ${float}`,
  md: `shadow-block pointer-fine:hover:shadow-block-lg focus-visible:shadow-block-lg has-focus-visible:shadow-block-lg active:shadow-block-sm pointer-fine:active:shadow-block-sm ${float}`,
  lg: `shadow-block-lg pointer-fine:hover:shadow-block-xl focus-visible:shadow-block-xl has-focus-visible:shadow-block-xl active:shadow-block pointer-fine:active:shadow-block ${float}`,
} as const;
