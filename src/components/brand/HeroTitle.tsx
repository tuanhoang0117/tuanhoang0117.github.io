import { useEffect, useRef } from "react";
import { site } from "../../content/site";
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
const SHIMMER_GRADIENT = `linear-gradient(120deg, ${[
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

/** Larger than the word, so moving the background position moves the bands across it. */
const SHIMMER_SIZE = "300% 300%";

/** About 7 s each way, alternating, like a slow holographic drift. */
const SHIMMER_KEYFRAMES: Keyframe[] = [
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
 * Font size per container width: each step is the largest Tailwind size whose 6.3em fits.
 * 36px under 320px, 48px from 320, 60px from 448, 72px from 576, 96px from 672, 128px from 896.
 */
const SIZES = "text-4xl @xs:text-5xl @md:text-6xl @xl:text-7xl @2xl:text-8xl @4xl:text-9xl";

interface HeroTitleProps {
  /** The heading level. `h1` on the home page; lower where a page already has its own `h1`. */
  as?: "h1" | "h2" | "p";
}

/**
 * The site owner's name as a giant display title: the first part in solid ink, the last word with
 * a slowly drifting shimmer clipped to its letters. The shimmer is an `aria-hidden` copy laid over
 * the real word, so screen readers hear the name once. Under reduced motion it holds still.
 */
export function HeroTitle({ as: Tag = "h1" }: HeroTitleProps) {
  const split = site.name.lastIndexOf(" ");
  const lead = split === -1 ? "" : site.name.slice(0, split);
  const last = split === -1 ? site.name : site.name.slice(split + 1);

  const reduced = useReducedMotion();
  const shimmer = useRef<HTMLSpanElement>(null);

  // Web Animations rather than a CSS keyframe: the keyframes stay in this component's own file,
  // and the global reduced-motion rule in index.css only shortens CSS animations, so this one is
  // turned off here explicitly.
  useEffect(() => {
    const el = shimmer.current;
    if (reduced || !el || typeof el.animate !== "function") return;
    const animation = el.animate(SHIMMER_KEYFRAMES, SHIMMER_TIMING);
    return () => animation.cancel();
  }, [reduced]);

  return (
    // Sized by the space it's given (container queries on Tailwind's default sizes), so the name
    // stays on one line wherever it's mounted. Archivo Black is wide: "Tuan Hoang" is about 6.3em.
    <div className="@container">
      <Tag
        className={`font-display leading-tight tracking-tight whitespace-nowrap text-ink ${SIZES}`}
      >
        {lead && <>{lead} </>}
        <span className="relative inline-block">
          <span>{last}</span>
          <span
            ref={shimmer}
            aria-hidden="true"
            data-shimmer=""
            className="pointer-events-none absolute inset-0 bg-clip-text text-transparent select-none mask-l-from-60%"
            style={{
              backgroundImage: SHIMMER_GRADIENT,
              backgroundSize: SHIMMER_SIZE,
              backgroundPosition: SHIMMER_KEYFRAMES[0]!.backgroundPosition as string,
            }}
          >
            {last}
          </span>
        </span>
      </Tag>
    </div>
  );
}
