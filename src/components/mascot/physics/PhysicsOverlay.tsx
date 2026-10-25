import type Matter from "matter-js";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { useReducedMotion } from "../../../pixel/useReducedMotion";
import { rotationStep } from "./raster";
import { createTokenFrames } from "./tokenFrames";
import { tokenArt, tokenVisual, type TokenVisual } from "./tokenVisual";
import { createTokenWorld, DEFAULT_MAX_BODIES } from "./world";

export interface PhysicsOverlayHandle {
  /** Drops one token at a viewport (client) coordinate. Does nothing under reduced motion. */
  spawnAt(x: number, y: number): void;
}

interface PhysicsOverlayProps {
  ref?: Ref<PhysicsOverlayHandle>;
  visual?: TokenVisual;
  maxBodies?: number;
}

const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 4;

/**
 * One transparent, full-viewport Matter.js layer of falling tokens. It never takes pointer
 * events, so everything under it stays clickable. Spawn tokens through the ref's `spawnAt`.
 */
export function PhysicsOverlay({
  ref,
  visual = tokenVisual,
  maxBodies = DEFAULT_MAX_BODIES,
}: PhysicsOverlayProps) {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spawnRef = useRef<(x: number, y: number) => void>(() => {});

  useImperativeHandle(ref, () => ({ spawnAt: (x, y) => spawnRef.current(x, y) }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (reduced || !canvas) return;

    const art = tokenArt(visual);
    const frames = createTokenFrames(art);
    const variantOf = new WeakMap<Matter.Body, number>();
    let nextVariant = 0;
    const ctx = canvas.getContext("2d");
    const measure = () => ({
      width: canvas.clientWidth || window.innerWidth,
      height: canvas.clientHeight || window.innerHeight,
    });
    let size = measure();
    const world = createTokenWorld({ ...size, radius: art.radius, maxBodies });

    // Drawing happens in device pixels, so each art pixel covers a whole number of them even at
    // fractional ratios like 2.625. Physics stays in CSS pixels.
    let dpr = 1;
    let pixel = 0;
    const fitCanvas = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      const nextPixel = Math.max(1, Math.round(art.scale * dpr));
      if (nextPixel !== pixel) frames.setPixelSize((pixel = nextPixel));
      // Resizing a canvas resets its state, smoothing included.
      if (ctx) ctx.imageSmoothingEnabled = false;
    };

    const draw = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const half = frames.side / 2;
      for (const body of world.tokens) {
        const image = frames.frame(variantOf.get(body) ?? 0, rotationStep(body.angle));
        if (!image) continue;
        const x = Math.round(body.position.x * dpr - half);
        const y = Math.round(body.position.y * dpr - half);
        ctx.drawImage(image, x, y);
      }
      canvas.dataset.tokens = String(world.tokens.length);
    };

    // The loop runs only while something moves: it stops once every token sleeps, and while the
    // tab is hidden.
    let frame = 0;
    let last: number | undefined;
    let pending = 0;
    const tick = (now: number) => {
      frame = 0;
      pending += Math.min(now - (last ?? now), STEP_MS * MAX_STEPS_PER_FRAME);
      last = now;
      for (let i = 0; pending >= STEP_MS && i < MAX_STEPS_PER_FRAME; i++) {
        world.step(STEP_MS);
        pending -= STEP_MS;
      }
      draw();
      const resting = world.tokens.every((body) => body.isSleeping);
      canvas.dataset.resting = String(resting);
      if (!resting) start();
    };
    const start = () => {
      if (frame || document.hidden) return;
      canvas.dataset.resting = "false";
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      last = undefined;
      pending = 0;
    };

    const onResize = () => {
      size = measure();
      fitCanvas();
      world.resize(size.width, size.height);
      draw();
      start();
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    fitCanvas();
    draw();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    spawnRef.current = (x, y) => {
      variantOf.set(world.spawnAt(x, y), nextVariant++ % Math.max(1, art.variants.length));
      draw();
      start();
    };

    return () => {
      spawnRef.current = () => {};
      stop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      world.destroy();
      frames.release();
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [reduced, visual, maxBodies]);

  if (reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="physics-overlay"
      data-tokens="0"
      className="pointer-events-none fixed inset-0 z-40 h-full w-full"
    />
  );
}
