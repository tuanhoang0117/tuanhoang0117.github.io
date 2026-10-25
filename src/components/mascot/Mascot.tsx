import { useEffect, useRef, useState, type MouseEvent } from "react";
import { mascotLabel, mascotVisual } from "../../content/mascot";
import type { MascotVisualSource } from "../../content/types";
import { useReducedMotion } from "../../pixel/useReducedMotion";
import { startMascotRenderer, type MascotRenderer } from "./renderer";

/** How long press feedback (and the active frame, if any) lasts after an activation. */
export const PRESS_MS = 160;

/** One press of the mascot, in viewport (client) coordinates, for physics and the counter. */
export interface MascotActivation {
  x: number;
  y: number;
  /** "keyboard" for Enter/Space (and other clicks with no pointer position): x/y are the center. */
  input: "pointer" | "keyboard";
}

interface MascotProps {
  onActivate?: (activation: MascotActivation) => void;
  /** The visual to sample. Defaults to `mascotVisual`; tests pass their own. */
  source?: MascotVisualSource;
  className?: string;
}

/**
 * The interactive glyph mascot: a square button that fills its container's width. Click, tap,
 * Enter, or Space presses it and calls `onActivate`. The canvas inside is decorative; the button
 * carries the accessible name from `mascotLabel`.
 */
export function Mascot({ onActivate, source = mascotVisual, className = "" }: MascotProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MascotRenderer | null>(null);
  const reduced = useReducedMotion();
  // Counts presses so a press during feedback restarts the timer.
  const [press, setPress] = useState(0);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const button = buttonRef.current;
    if (!canvas || !button) return;
    const renderer = startMascotRenderer(canvas, {
      source,
      reducedMotion: reduced,
      pointerTarget: button,
    });
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, [source, reduced]);

  useEffect(() => {
    if (!pressed) return;
    const id = setTimeout(() => setPressed(false), PRESS_MS);
    return () => clearTimeout(id);
  }, [press, pressed]);

  useEffect(() => {
    rendererRef.current?.setActive(pressed);
  }, [pressed]);

  const activate = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    // Keyboard activation (and element.click()) fires a click with detail 0 and no position.
    const keyboard = event.detail === 0;
    const x = keyboard ? rect.left + rect.width / 2 : event.clientX;
    const y = keyboard ? rect.top + rect.height / 2 : event.clientY;
    setPressed(true);
    setPress((n) => n + 1);
    if (rect.width > 0 && rect.height > 0) {
      rendererRef.current?.pulse((x - rect.left) / rect.width, (y - rect.top) / rect.height);
    }
    onActivate?.({ x, y, input: keyboard ? "keyboard" : "pointer" });
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={mascotLabel}
      onClick={activate}
      data-pressed={pressed ? "" : undefined}
      className={`block aspect-square w-full cursor-pointer touch-manipulation transition-transform duration-75 select-none active:scale-95 data-pressed:scale-95 ${className}`}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="pixelated block size-full" />
    </button>
  );
}
