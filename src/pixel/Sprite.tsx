import { useEffect, useMemo, useRef, useState } from "react";
import { toRuns } from "./runs";
import type { SpriteDef } from "./types";
import { useInView } from "./useInView";
import { useReducedMotion } from "./useReducedMotion";
import { assertValidSprite, pixelsOf } from "./validate";

interface SpriteProps {
  sprite: SpriteDef;
  /** CSS pixels per sprite pixel. Must be a positive integer; fractional scales blur edges. */
  scale: number;
  /** Accessible name. Without it the sprite is decorative and hidden from assistive tech. */
  label?: string;
  className?: string;
}

/** Renders a sprite as crisp SVG rects, stepping through its frames at `fps`. */
export function Sprite({ sprite, scale, label, className }: SpriteProps) {
  if (import.meta.env.DEV) {
    if (!Number.isInteger(scale) || scale < 1) {
      throw new Error(
        `Sprite "${sprite.name}": scale must be a positive integer, got ${scale}. Fractional scales blur pixel edges.`,
      );
    }
    assertValidSprite(sprite);
  }

  const frames = useMemo(
    () => sprite.frames.map((frame) => toRuns(frame, sprite.palette)),
    [sprite],
  );
  const first = sprite.frames[0] ?? [];
  const height = first.length;
  const width = first[0] === undefined ? 0 : pixelsOf(first[0]).length;
  const px = Math.max(1, Math.round(scale));

  const ref = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref);
  const [tick, setTick] = useState(0);

  const count = frames.length;
  const fps = sprite.fps ?? 0;
  const animate = count > 1 && fps > 0 && !reduced && inView;

  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setTick((t) => (t + 1) % count), 1000 / fps);
    return () => clearInterval(id);
  }, [animate, count, fps]);

  // Reduced motion always shows frame 0. A paused sprite keeps whatever frame it was on.
  const index = reduced || count === 0 ? 0 : tick % count;
  const runs = frames[index] ?? [];

  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      width={width * px}
      height={height * px}
      shapeRendering="crispEdges"
      data-sprite={sprite.name}
      data-frame={index}
      className={className}
      {...a11y}
    >
      {runs.map((run) => (
        <rect
          key={`${run.x},${run.y}`}
          x={run.x}
          y={run.y}
          width={run.width}
          height={1}
          fill={run.color}
        />
      ))}
    </svg>
  );
}
