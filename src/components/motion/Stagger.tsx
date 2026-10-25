import { useLayoutEffect, useRef, type ReactNode } from "react";
import { CARD_ENTER_MS, cardKeyframes, playEntrance, STAGGER_STEP_MS } from "./motion";

interface StaggerProps {
  /** The list element to render. Each direct child enters in turn. */
  as?: "div" | "ul" | "ol" | "section";
  className?: string;
  /** Milliseconds between consecutive children. */
  step?: number;
  children: ReactNode;
}

/**
 * Makes its direct children enter one after another when it mounts. Never driven by scroll
 * position (ADR 0002). Children added after mount appear without an entrance.
 */
export function Stagger({ as = "div", className, step = STAGGER_STEP_MS, children }: StaggerProps) {
  // Every allowed tag is an HTMLElement; typing it as div keeps the ref and props simple.
  const Tag = as as "div";
  const ref = useRef<HTMLDivElement>(null);

  // Layout effect: the first frame painted is already the animation's starting frame.
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const animations = playEntrance(Array.from(list.children), {
      keyframes: cardKeyframes,
      duration: CARD_ENTER_MS,
      step,
    });
    return () => animations.forEach((a) => a.cancel());
  }, [step]);

  return (
    <Tag ref={ref} className={className} data-stagger="">
      {children}
    </Tag>
  );
}
