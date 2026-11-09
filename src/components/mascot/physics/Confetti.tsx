import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "../../../pixel/useReducedMotion";

/** How long one burst lasts, start to cleanup. Every piece has fallen out of view by then. */
export const CONFETTI_MS = 2000;
/** Pieces per burst. */
export const CONFETTI_PIECES = 40;
/** The palette's accent tokens, so the burst echoes the secret sprite's rainbow mane. */
export const CONFETTI_COLORS = [
  "var(--color-heritage)",
  "var(--color-gold)",
  "var(--color-canyon)",
  "var(--color-poly-bright)",
  "var(--color-dexter)",
  "var(--color-surf)",
  "var(--color-cove)",
] as const;

/** Square pixel sizes on the 4px grid (8px and 12px). Static strings so Tailwind sees them. */
const SIZES = ["size-2", "size-3"] as const;
/** Pieces fall in stepped frames, like the sprites (design rule 4): about 12 frames a second. */
const FRAME_MS = 1000 / 12;
/** Furthest a piece drifts sideways, in CSS pixels. The layer clips, so drift never overflows. */
const MAX_DRIFT_PX = 32;

export interface ConfettiPiece {
  /** Horizontal start, as a percentage of the viewport width, in [0, 100). */
  left: number;
  color: string;
  size: (typeof SIZES)[number];
  delay: number;
  fall: number;
  drift: number;
  /** One flutter cycle: the piece shows its face, then its edge (half height). */
  flutter: number;
}

/** A whole number in [0, n), from a source like Math.random. */
const pick = (random: () => number, n: number) =>
  Math.min(n - 1, Math.max(0, Math.floor(random() * n)));

/**
 * Lays out one burst. Every piece's delay plus fall fits inside `duration`, so the burst is over
 * when the component removes itself.
 */
export function confettiPieces(
  count: number,
  duration: number,
  random: () => number = Math.random,
): ConfettiPiece[] {
  return Array.from({ length: count }, () => {
    const fall = duration * (0.6 + 0.4 * random());
    return {
      left: random() * 100,
      color: CONFETTI_COLORS[pick(random, CONFETTI_COLORS.length)]!,
      size: SIZES[pick(random, SIZES.length)]!,
      delay: random() * (duration - fall),
      fall,
      drift: Math.round((random() * 2 - 1) * MAX_DRIFT_PX),
      flutter: (2 + pick(random, 4)) * FRAME_MS,
    };
  });
}

/** Falls from just above the viewport to just below it, in stepped frames. */
function fall(el: Element, piece: ConfettiPiece): Animation {
  return el.animate(
    [
      { transform: "translate(0, 0)" },
      { transform: `translate(${piece.drift}px, calc(100vh + 100%))` },
    ],
    {
      duration: piece.fall,
      delay: piece.delay,
      easing: `steps(${Math.max(1, Math.round(piece.fall / FRAME_MS))}, jump-none)`,
      fill: "both",
    },
  );
}

/** Flips between face and edge in two frames, never a smooth squash. */
function flutter(el: Element, piece: ConfettiPiece): Animation {
  return el.animate([{ transform: "scaleY(1)" }, { transform: "scaleY(0.5)" }], {
    duration: piece.flutter,
    easing: "steps(2, jump-none)",
    iterations: Infinity,
  });
}

interface ConfettiProps {
  /** Called once when the burst is over (at once under reduced motion, which shows nothing). */
  onDone?: () => void;
  duration?: number;
  pieces?: number;
  /** Lays out the pieces; tests pass a fixed source. */
  random?: () => number;
}

/**
 * Pixel confetti that falls from the top of the viewport, then removes itself. A fixed,
 * full-viewport layer that clips its own pieces and never takes pointer events, so it can't
 * cause overflow or catch a click. Renders nothing under reduced motion.
 */
export function Confetti({
  onDone,
  duration = CONFETTI_MS,
  pieces = CONFETTI_PIECES,
  random = Math.random,
}: ConfettiProps) {
  const reduced = useReducedMotion();
  const [layout] = useState(() => confettiPieces(pieces, duration, random));
  const [done, setDone] = useState(false);
  const layerRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  const firedRef = useRef(false);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const finish = () => {
      setDone(true);
      if (firedRef.current) return;
      firedRef.current = true;
      onDoneRef.current?.();
    };
    if (reduced) {
      finish();
      return;
    }
    const timer = setTimeout(finish, duration);
    return () => clearTimeout(timer);
  }, [reduced, duration]);

  useEffect(() => {
    const layer = layerRef.current;
    if (reduced || done || !layer) return;
    const animations: Animation[] = [];
    Array.from(layer.children).forEach((el, i) => {
      const piece = layout[i];
      const face = el.firstElementChild;
      if (!piece || !face || typeof el.animate !== "function") return;
      animations.push(fall(el, piece), flutter(face, piece));
    });
    return () => animations.forEach((animation) => animation.cancel());
  }, [reduced, done, layout]);

  if (reduced || done) return null;

  const layer = (
    <div
      ref={layerRef}
      aria-hidden="true"
      data-testid="confetti"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      {layout.map((piece, i) => (
        <span
          key={i}
          data-testid="confetti-piece"
          className={`absolute bottom-full block ${piece.size}`}
          style={{ left: `${piece.left}%` }}
        >
          <span className="block size-full" style={{ backgroundColor: piece.color }} />
        </span>
      ))}
    </div>
  );
  return typeof document === "undefined" ? layer : createPortal(layer, document.body);
}
