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

/** Route change: the whole page fades in and rises. */
export const pageKeyframes: Keyframe[] = [
  { opacity: 0, transform: `translateY(${ENTER_DISTANCE_PX}px)` },
  { opacity: 1, transform: "none" },
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
 * Shared card hover lift and press, by resting shadow size. Hover lifts the card up-left and
 * steps the block shadow up one size; press pushes it down-right into a smaller shadow. Add a
 * shadow color (`shadow-cove`, or `cardShadow()` from src/styles/themes.ts) for an accent
 * shadow: the size utilities keep whatever color is set. Movement is `motion-safe` only; under
 * reduced motion the shadow still changes, instantly, as feedback. Class names are written out
 * in full so Tailwind generates them.
 */
export const cardLift = {
  sm: "shadow-block-sm transition duration-150 ease-out hover:shadow-block active:shadow-none motion-safe:hover:-translate-x-0.5 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-x-0.5 motion-safe:active:translate-y-0.5",
  md: "shadow-block transition duration-150 ease-out hover:shadow-block-lg active:shadow-block-sm motion-safe:hover:-translate-x-0.5 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-x-0.5 motion-safe:active:translate-y-0.5",
  lg: "shadow-block-lg transition duration-150 ease-out hover:shadow-block-xl active:shadow-block motion-safe:hover:-translate-x-0.5 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-x-0.5 motion-safe:active:translate-y-0.5",
} as const;
