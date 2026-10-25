import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { school } from "../../content/site";
import { useReducedMotion } from "../../pixel/useReducedMotion";

/** Scroll speed in CSS px per second. Constant whatever the text length or screen size. */
export const BANNER_SPEED = 80;

/** Tailwind's `md` breakpoint: at and above it the banner is a vertical strip on the right. */
const VERTICAL_QUERY = "(min-width: 48rem)";

/**
 * Space the banner needs, added to <body> while it's mounted so the whole shell (nav, page,
 * footer) sits clear of the strip: 56px at the bottom on phones, 96px on the right from `md` up.
 * The graph paper fills that space too, so it doesn't show as a white gutter once the strip fades.
 */
const RESERVED_SPACE = ["pb-14", "md:pb-0", "md:pr-24", "bg-graph"];

/**
 * How many copies of the text keep the strip full for a whole loop. The track slides by one copy
 * and then jumps back, so it needs one copy beyond what covers the strip.
 */
export function repeatCount(copyLength: number, stripLength: number): number {
  if (!(copyLength > 0)) return 2;
  return Math.max(2, Math.ceil(stripLength / copyLength) + 1);
}

/** Milliseconds to travel `distance` px at `speed` px/s. */
export function loopDuration(distance: number, speed: number = BANNER_SPEED): number {
  if (!(distance > 0) || !(speed > 0)) return 0;
  return (distance / speed) * 1000;
}

export interface BannerLoop {
  /** Length of one copy (text plus separator) along the scroll axis, in px. */
  copyLength: number;
  copies: number;
  /** One loop: the time to scroll by one copy, in ms. 0 when not animating. */
  duration: number;
  vertical: boolean;
}

interface BannerProps {
  /** The banner fades out once this element (the hero) has scrolled above the viewport. */
  hideAfter?: RefObject<Element | null>;
  /** Pad <body> so nothing sits under the strip. On by default. */
  reserveSpace?: boolean;
  /** Called whenever the loop is re-measured. Used by the lab page to show the numbers. */
  onLoop?: (loop: BannerLoop) => void;
}

function useMediaQuery(query: string): boolean {
  const get = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;
  const [matches, setMatches] = useState(get);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** True once `ref` has scrolled entirely above the top of the viewport. */
function useScrolledPast(ref: RefObject<Element | null> | undefined): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const el = ref?.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setPast(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return past;
}

/**
 * Cal Poly's full name scrolling in a Poly Green strip: down the right edge from `md` up, along
 * the bottom on phones. With reduced motion it's one static copy.
 */
export function Banner({ hideAfter, reserveSpace = true, onLoop }: BannerProps) {
  const reduced = useReducedMotion();
  const vertical = useMediaQuery(VERTICAL_QUERY);
  const hidden = useScrolledPast(hideAfter);

  const stripRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ copy: 0, strip: 0 });

  const copies = reduced ? 1 : repeatCount(size.copy, size.strip);
  const duration = reduced ? 0 : loopDuration(size.copy);

  useEffect(() => {
    if (!reserveSpace) return;
    document.body.classList.add(...RESERVED_SPACE);
    return () => document.body.classList.remove(...RESERVED_SPACE);
  }, [reserveSpace]);

  // Measure one copy and the strip along the scroll axis, again whenever either resizes (the
  // breakpoint flips, or the display font finishes loading).
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const copy = copyRef.current;
    if (!strip || !copy) return;
    const measure = () => {
      const along = (el: Element) => {
        const box = el.getBoundingClientRect();
        return vertical ? box.height : box.width;
      };
      const next = { copy: along(copy), strip: along(strip) };
      setSize((prev) => (prev.copy === next.copy && prev.strip === next.strip ? prev : next));
    };
    measure();
    let live = true;
    document.fonts?.ready.then(() => live && measure());
    if (typeof ResizeObserver === "undefined") return () => void (live = false);
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    observer.observe(copy);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [vertical]);

  useEffect(() => {
    onLoop?.({ copyLength: size.copy, copies, duration, vertical });
  }, [onLoop, size.copy, copies, duration, vertical]);

  // Slide the track by exactly one copy, then repeat: copy 2 lands where copy 1 started, so the
  // jump back is invisible. Duration comes from the measured length, so the speed is constant.
  const animation = useRef<Animation | null>(null);
  useEffect(() => {
    const track = trackRef.current;
    if (!track || reduced || duration <= 0 || typeof track.animate !== "function") return;
    const end = vertical
      ? `translate3d(0, -${size.copy}px, 0)`
      : `translate3d(-${size.copy}px, 0, 0)`;
    const anim = track.animate([{ transform: "translate3d(0, 0, 0)" }, { transform: end }], {
      duration,
      iterations: Infinity,
      easing: "linear",
    });
    animation.current = anim;
    return () => {
      anim.cancel();
      animation.current = null;
    };
  }, [reduced, vertical, size.copy, duration]);

  useEffect(() => {
    const anim = animation.current;
    if (!anim) return;
    if (hidden) anim.pause();
    else anim.play();
  }, [hidden, duration, vertical]);

  const content = (
    <div
      ref={stripRef}
      data-testid="school-banner"
      data-orientation={vertical ? "vertical" : "horizontal"}
      data-copies={copies}
      data-state={hidden ? "hidden" : "shown"}
      aria-hidden={hidden || undefined}
      role="region"
      aria-label={`${school.name} banner`}
      className={[
        "fixed inset-x-0 bottom-0 z-40 flex h-14 items-center overflow-hidden border-t-2 border-ink bg-poly text-white transition-opacity duration-300",
        "md:inset-x-auto md:top-0 md:right-0 md:h-dvh md:w-24 md:border-t-0 md:border-l-2",
        hidden ? "pointer-events-none opacity-0" : "opacity-100",
      ].join(" ")}
      style={{ writingMode: vertical ? "vertical-rl" : "horizontal-tb" }}
    >
      <div ref={trackRef} className="flex shrink-0 whitespace-nowrap">
        {Array.from({ length: copies }, (_, i) => (
          <span
            key={i}
            ref={i === 0 ? copyRef : undefined}
            aria-hidden={i > 0 || undefined}
            data-banner-copy=""
            className="flex shrink-0 items-center gap-6 pe-6 font-serif text-4xl leading-none md:gap-8 md:pe-8 md:text-7xl"
          >
            <span>{school.name}</span>
            <span aria-hidden="true" className="text-2xl text-stadium md:text-4xl">
              ◆
            </span>
          </span>
        ))}
      </div>
    </div>
  );
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
