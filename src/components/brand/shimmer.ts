import { useEffect, type RefObject } from "react";
import { useReducedMotion } from "../../pixel/useReducedMotion";

/**
 * A light Cal Poly fill deepened toward ink. Surf, Morro, Stadium, and Avocado are fills, too pale
 * to be text on paper (docs/design-system.md → Color); mixed like this, each keeps the 3:1 that
 * large text needs. e2e/hero-title.spec.ts measures every stop. Pass the full `var(--color-…)`:
 * Tailwind only emits theme variables whose names it finds written out in the source.
 */
const deepen = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, var(--color-ink))`;

/** The shimmer: our own diagonal band of Cal Poly colors (tokens only), sized up so it can drift. */
export const SHIMMER_GRADIENT = `linear-gradient(120deg, ${[
  "var(--color-ink) 0%",
  "var(--color-cove) 15%",
  `${deepen("var(--color-surf)", 60)} 28%`,
  `${deepen("var(--color-morro)", 55)} 38%`,
  `${deepen("var(--color-stadium)", 55)} 48%`,
  `${deepen("var(--color-avocado)", 55)} 58%`,
  "var(--color-poly-bright) 70%",
  "var(--color-poly) 85%",
  "var(--color-ink) 100%",
].join(", ")})`;

/** About 7 s each way, alternating, like a slow holographic drift. */
export const SHIMMER_KEYFRAMES: Keyframe[] = [
  { backgroundPosition: "10% 20%" },
  { backgroundPosition: "70% 80%" },
];
const SHIMMER_TIMING: KeyframeAnimationOptions = {
  duration: 7000,
  easing: "ease-in-out",
  direction: "alternate",
  iterations: Infinity,
};

/**
 * Inline style for a shimmer overlay. The background is larger than the text, so moving its
 * position moves the bands across the letters. Pair with `bg-clip-text text-transparent`.
 */
export const shimmerStyle = {
  backgroundImage: SHIMMER_GRADIENT,
  backgroundSize: "300% 300%",
  backgroundPosition: SHIMMER_KEYFRAMES[0]!.backgroundPosition as string,
};

/**
 * Drifts the overlay's gradient. Web Animations rather than a CSS keyframe: the keyframes stay in
 * one file, and the global reduced-motion rule in index.css only shortens CSS animations, so this
 * one is turned off here explicitly.
 */
export function useShimmer(ref: RefObject<HTMLElement | null>) {
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (reduced || !el || typeof el.animate !== "function") return;
    const animation = el.animate(SHIMMER_KEYFRAMES, SHIMMER_TIMING);
    return () => animation.cancel();
  }, [reduced, ref]);
}
